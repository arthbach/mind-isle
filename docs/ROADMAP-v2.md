# Mind Isle v2: Roadmap & Spec

Status: **All phases (A–E) shipped** (check-in gate, seasons, tests and write safety; agent sessions on the island; settings note, session records, summaries with redaction, onboarding; the worldview wing; attributes v2 and the personality avatar). Progress is tracked in [PROGRESS.md](PROGRESS.md); the current app is described in the [README](../README.md).

v2 turns Mind Isle from a vault viewer into a living chief of staff. It:

- opens with a check-in
- watches your AI coding sessions (Orca, Claude Code, Codex) as they happen
- remembers them in your vault, if you allow it
- asks before it touches anything sensitive

---

## 0. Principles

Every feature below must hold to these. If a design conflicts with one, the principle wins.

1. **The vault is the source of truth.** Anything worth remembering is written to plain markdown the user can read, edit and delete. App-only state (`.palace/`) holds caches and things with no natural home in the vault.
2. **Consent before collection.** Nothing is read from a new source, summarised, or inferred about a sensitive topic until the user says yes, in a scope they chose. Every consent is visible and revocable in one place.
3. **Ask when unsure.** Automatic decisions (session → project mapping, belief proposals) carry a confidence score. Below the threshold, the app asks; it never guesses silently.
4. **Everything is reversible.** Mappings can be reassigned, summaries deleted, AI-proposed banners forgotten in one action.
5. **Local only.** No server, no telemetry. Summarisation uses the user's own agent CLI on their own machine.
6. **Never break a note.** Writes are surgical, verified, and skipped if the note changed underneath.
7. **No profiling of other people.** Anything inferred describes the vault owner only.

---

## 1. Check-in first

**Goal:** the check-in is the first thing you see each day, without making the app feel like a gate.

### Behaviour

| Time (user's timezone) | State of today's daily note | Opening any page shows |
|---|---|---|
| Before `dusk_from` (default 17:00) | Plan not locked, no skip recorded | Dawn, over a blurred island |
| After `dusk_from` | Plan locked, day not closed | Dusk, over a blurred island |
| After `dusk_from` | Plan never locked | Dusk ("No plan this morning, that's fine") |
| Any time | Closed, or skipped | The page you asked for |

- **Skip today** writes `skipped: dawn` (or `dusk`) to the daily note's frontmatter. Skips are visible on the streak calendar as a distinct state, never counted as check-ins.
- The gate is decided on the server from the daily note, so it behaves the same on every device.
- `/hall` and `/login` are never gated.
- Settings: `checkin.gate` (`soft` | `off`), `checkin.dusk_from`.

### Acceptance

- [ ] First visit of the day lands on Dawn; skipping lands on the requested page and stays skipped all day on every device.
- [ ] After `dusk_from` with an open day, any page opens Dusk.
- [ ] Closing the day removes the gate until tomorrow.

---

## 2. Agent sessions

### 2.1 Sources

The user chooses which sources to enable during onboarding (§5). Each source is an adapter with the same interface:

```ts
interface SessionSource {
  id: 'orca' | 'claude-code' | 'codex';
  detect(): Promise<{ available: boolean; roots: string[] }>;   // where its logs live
  listSessions(since: Date): Promise<SessionMeta[]>;             // historical, from logs
  readTranscript(id: string): AsyncIterable<TranscriptEvent>;    // for summaries
  installHooks(): Promise<HookInstallResult>;                    // live events (opt-in)
  uninstallHooks(): Promise<void>;
}

interface SessionMeta {
  id: string;            // the agent's own session id
  source: SessionSource['id'];
  cwd: string;           // working directory: the main mapping signal
  gitRemote?: string;
  branch?: string;
  startedAt: string;
  lastEventAt: string;
  title?: string;        // first user prompt, truncated
  transcriptPath: string;
}
```

| Source | Logs (defaults, overridable in settings) | Live events |
|---|---|---|
| **Claude Code** | `$CLAUDE_CONFIG_DIR/projects/<encoded-cwd>/<session>.jsonl` (default `~/.claude/projects`) | Claude Code hooks |
| **Orca** | Orca runs Claude Code and Codex under its own profiles. On macOS: `~/Library/Application Support/orca/claude-profiles/<profile>/home/projects/…` | The same Claude Code / Codex hooks, installed into Orca's profile homes |
| **Codex** | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` (default `~/.codex/sessions`) | Codex `notify` program, plus hooks where the installed version supports them |

Rules:

- **Use only documented formats:** agent transcripts and hooks. Orca's internal databases are undocumented and may change between versions. They are never a dependency.
- **Detection is read-only.** Hooks are installed only after explicit consent, and they're listed in Settings with a one-click uninstall.
- **The same session seen by two sources** (e.g. Claude Code inside Orca) is de-duplicated by session id.

### 2.2 Live state

Hooks append one JSON line per event to `.palace/events/<source>.jsonl`. The app watches these files. Because this needs no network, a hook never fails when Mind Isle isn't running.

```jsonc
{ "ts": "…", "source": "claude-code", "session": "…", "cwd": "…", "event": "SessionStart|UserPromptSubmit|PostToolUse|Notification|Stop|SessionEnd", "tool": "Edit", "detail": "src/map.ts" }
```

The hook script writes **only metadata**: event, tool name, a file path or short label. It never writes prompt text or tool output.

State machine per session:

```
            prompt / tool use
  ┌────────► WORKING ◄────────┐
  │             │ Notification (permission / input)
start           ▼             │ user replies
  │         NEEDS_YOU ────────┘
  │             │
  │   no events for 10 min (configurable)
  └─────────► IDLE ──── SessionEnd, or 2 h silent ───► ENDED
```

Sessions without hooks still appear. As built, three signals are combined, newest wins:

- **Claude Code's running-session registry** (`sessions/<pid>.json`): process alive or not, busy or idle
- **Codex log events** (`task_started`, `task_complete`, approval requests)
- **hook events**

A Stop event makes a session IDLE straight away ("your turn"); WORKING with no new signal for 10 minutes also becomes IDLE. With no signal at all, a log touched in the last 2 minutes counts as WORKING. That state is inferred, so it's shown with a dashed outline. Session titles come from the agent's own generated title (Claude Code's `aiTitle`), never from the user's prompt.

### 2.3 Mapping sessions to projects

Each project note gains:

```yaml
repos: ["~/code/northwind-routing", "~/code/northwind-routing-worktrees/*"]
repo_urls: ["github.com/acme/northwind-routing"]
```

Every session gets a confidence score against every project:

| Signal | Confidence |
|---|---|
| `cwd` matches a `repos` entry (glob, `~` expanded) | 1.00 |
| Git remote matches a `repo_urls` entry | 0.95 |
| Earlier sessions from this `cwd` were confirmed for one project | 0.95 |
| A path segment matches the project name or an alias (normalised: case, `-`, `_`, spaces) | 0.70 |
| The first prompt mentions the project name or an alias | 0.50 |
| Several projects tie | max − 0.2 |

- **≥ 0.90:** assigned automatically. A toast says so, with **Undo**.
- **0.60–0.89:** a proposal: "Is this *Northwind Routing*?" with Yes / Pick another / Not a project.
- **< 0.60:** the session docks at the Harbor as an **unassigned ship** until the user places it.
- Confirming writes the `cwd` into the project's `repos:`, so the next session maps at 1.00.
- "Not a project" records the `cwd` in Settings → ignored folders.
- **Reassign** is always available from the session card and the session note. It moves the `repos` entry and rewrites the `project:` link in every summary from that `cwd`, after confirmation.

### 2.4 First run (backfill)

During onboarding the agent:

1. Scans the enabled sources for the last 90 days (configurable).
2. Groups sessions by `cwd`.
3. Scores every group (§2.3).
4. Shows a single review table: auto-mapped groups pre-ticked, low-confidence groups awaiting a choice, and a "create a new project note" option.
5. Writes the confirmed `repos:` entries.

Nothing is summarised during backfill unless the user separately opts in (§3).

### 2.5 UI

**On the island:**

As built, sessions are shown as **crew pins**: small HTML pins over the map that open into a bubble of portraits, so they stay readable at any screen size without hiding the island. Two earlier designs were dropped: tiny in-map workers were too small to read, and always-open bubbles covered the map.

| State | On the island |
|---|---|
| Any live session | A light beam over the building, plus a pin above it: the agent's face and the session count. Hover (or tap) opens a bubble with one 32px portrait per session (Claude: builder, Codex: robot); click selects the building |
| WORKING | Portrait badge ⚒ (animated); warm beam |
| NEEDS_YOU | The pin turns red, bounces and shows a red **!**; portrait badge !; red beam |
| IDLE | Portrait dimmed, badge z; pale beam |
| ENDED | The portrait leaves the bubble; the pin disappears with the last session |
| Unassigned or unconfirmed | A dashed pin at the harbor road that opens as "? Not placed yet" (only confirmed or automatic matches go on a building) |

Three sessions on one project are three portraits in the bubble. Past four, a "+N" counter. Pins are placed so they don't overlap each other or the map labels. The island is full screen with a game HUD on top (player card, resources, live tracker, Atlas, inspector, and a hotbar holding all navigation); every other page opens as a window over it, and each setting has its own page under /settings. It opens on the whole island, fitted between the HUD panels. The island grows with the vault (no caps on projects, villages, people, beliefs or bets), so the map pans and zooms: drag, wheel or pinch, the arrow keys, and + / − / ⤢ buttons.

**Live strip** under the header, visible on every page:

```
┌ LIVE ──────────────────────────────────────────────────────────────┐
│ ⚒ Northwind Routing · Claude · 12m · editing src/solver.ts         │
│ ⚒ Northwind Routing · Codex  ·  3m · running tests                 │
│ ❗ Lighthouse App   · Claude · waiting for you (permission)         │
│ ? ~/code/scratch    · Codex  ·  1m · unassigned: place it          │
└────────────────────────────────────────────────────────────────────┘
```

- Cards are ordered by urgency: NEEDS_YOU first.
- Clicking a card selects the building and opens a side panel. The panel shows source, branch, duration, last 10 events (metadata only), the mapping with a Reassign action, and the summary status.
- Updates arrive over Server-Sent Events. No polling, no reloads.
- On the phone the strip collapses to a count badge ("3 live · 1 needs you").
- `prefers-reduced-motion`: no animation, state shown by icon only.

### Acceptance

- [ ] Three concurrent sessions on one repo show three workers and three cards within 2 s of their first event.
- [ ] A permission prompt in any session shows "!" within 2 s.
- [ ] Turning a source off removes its sessions and leaves no hooks behind.
- [ ] A low-confidence session never maps itself; a reassignment updates `repos:` and past summaries.

---

## 3. Session summaries → vault memory

### 3.1 Consent

There are two layers, each with its own approval:

1. **Session record (metadata only).** Approved once per source during onboarding (§5). From then on, every session is recorded: project, source, time, duration, files touched. No prompt text, no code. The record appears on the island and in session history immediately, and is kept in `.palace/sessions/`.
2. **Session summary (written to the vault).** Approved per session, unless the project is set to `auto`:

| Mode | Behaviour |
|---|---|
| `ask` (default) | The ended session becomes a **pending scroll** waiting for approval |
| `auto` | Summarised on session end, no prompt |
| `off` | Never summarised; the metadata record still shows |

The mode lives in the project note (`summaries: ask|auto|off`), so it's visible and editable in Obsidian. The global default lives in the settings note (§5).

**Pending scrolls:**
- They never expire and are never discarded or saved without approval.
- Each one appears as a scroll icon on its project's building and in a "Pending" list on the Today page.
- **Dusk batches them:** "4 sessions today: Save all · Review one by one · Skip". Review shows the title, project, duration and files touched before you decide.
- **"Always save for this project"** on any prompt switches that project to `auto`.
- **Transcript retention:** agents delete old logs (Claude Code defaults to about 30 days). At transcript age `retention_warn_days` (default 25), Atlas warns at Dawn: "3 sessions will lose their transcript in 5 days." If a transcript disappears while pending, the scroll becomes *unsummarisable*. The metadata record stays; only the summary option is gone.

### 3.2 Pipeline

```
session ENDED
  → consent check (project mode, source enabled, cwd not ignored)
  → read transcript
  → REDACT (before anything else sees it)
  → chunk if long
  → summarise with the user's agent CLI, headless
  → validate the output schema
  → write the note (§3.3)
  → link: Codex, Quests, project last_activity
```

- **Summariser:** the user's own CLI in non-interactive mode, chosen during onboarding: `claude -p` (Claude Code) or `codex exec` (Codex). A small, fast model by default. A queue limits it to one summary at a time.
- **Redaction (mandatory, runs locally before the CLI):**
  - known key formats (cloud provider keys, `sk-…`, JWTs, private key blocks)
  - `.env`-style `KEY=value` lines
  - high-entropy tokens
  - email addresses and phone numbers, unless the user allows them
  - anything matching user-defined patterns in settings
- **Prompt contract:** the summariser returns JSON matching a fixed schema: `title`, `summary`, `decisions[]`, `todos[]`, `files_touched[]`, `people_mentioned[]`. Invalid output is retried once, then recorded as a failed job and not written.
- **Failure handling:** failed jobs are listed in Settings with Retry. A summary is never half-written.

### 3.3 Session note

`<sessions_dir>/YYYY-MM-DD <project> <title>.md` (default folder `Sessions/`):

```markdown
---
type: session
source: claude-code
session_id: …
project: "[[Northwind Routing]]"
cwd: ~/code/northwind-routing
branch: feat/solver
started: 2026-10-26T09:12
ended: 2026-10-26T10:40
duration_min: 88
summarised_by: claude -p
---
## Summary
## Decisions          ← picked up by the Codex
## Follow-ups         ← "- [ ]" tasks, picked up by the Quest board
## Files touched
```

After writing, the project's `last_activity` is set to the session date. Summaries are the "memory": the Codex, Quests and Atlas's Dawn suggestions read from them automatically.

### Acceptance

- [x] Every session from an enabled source gets a metadata record, regardless of summary mode.
- [x] `off` never reads a transcript; `ask` never writes without a yes; pending scrolls survive restarts and never expire.
- [x] "Save all" at Dusk writes one note per pending session; "Always save" flips the project to `auto`.
- [x] A pending session whose transcript is older than `retention_warn_days` triggers a Dawn warning.
- [x] A transcript containing a fake API key and a `.env` block produces a note with both redacted (test fixture).
- [x] Malformed summariser output writes nothing and shows a retryable failure.

---

## 4. Worldview banners

The Banner Wall gains a **Worldview** wing for values, faith and spirituality, and politics and civic views. These are the most sensitive things the app can hold, so this feature has its own rules.

### 4.1 Rules

- **Opt-in, with scope.** The onboarding agent first checks for existing `type: belief` notes with `domain: worldview`. If there are none, it asks whether to look, and where. The choices are:
  - all notes
  - specific folders (the user picks)
  - agent session summaries
  - **interview only:** no reading; the agent asks reflective questions instead
  - not now
- **Owner only.** Extraction uses only first-person statements by the vault owner. Opinions of other people found in meeting notes, quotes or sessions are ignored, and no belief is ever recorded about another person.
- **Proposals, never facts.** Every finding becomes `status: proposed` with verbatim evidence quotes and their source notes. Nothing counts until the user confirms it.
- **No demographic inference.** The app never infers race, ethnicity or any other demographic trait, and has no field for it.
- **Contained.** Worldview banners carry `sensitive: true` and live in their own folder (default `Mind Isle/Worldview/`). They are:
  - never shown on `/hall`
  - never included in session summaries, Atlas's prompts, or any other AI context unless the user enables "use in AI context" per banner
  - hidden behind a reveal tap on shared screens
- **Forget.** One action deletes every AI-proposed worldview banner (confirmed ones need a second confirmation), and records `worldview.scan: revoked` in settings.

### 4.2 Interview mode

Atlas asks one question per day at Dusk (skippable), for example:

- "What would you never compromise on, even for money?"
- "What does a good society look like to you?"
- "What do you do when your faith or values and your work disagree?"

The answer becomes a proposed banner, written in the user's own words.

### Acceptance

- [x] With scope "specific folders", no file outside those folders is read (test with a canary note).
- [x] A meeting note containing another person's political opinion produces no banner.
- [x] Sensitive banners never appear on `/hall` or in any summariser prompt (asserted in tests).

---

## 5. Onboarding via the user's AI agent

When someone clones the repo, they open it with their AI agent. `AGENTS.md` (with `CLAUDE.md` pointing to it) defines the onboarding script the agent follows:

1. **Vault.** Find candidate vaults (folders containing `.obsidian/`), ask which one, write `VAULT_PATH` to `.env.local`.
2. **Identity.** Display name and timezone.
3. **Sources.** Detect Orca, Claude Code and Codex, show which were found, and ask which to enable. Each enabled source can install hooks, but only on a separate yes.
4. **Backfill and mapping.** Run §2.4. Ask about every low-confidence group.
5. **Summaries.** Choose the global default (`off`, `ask`, `auto`) and the summariser CLI.
6. **Worldview.** Run §4.1.
7. **Personality** (optional). Run §7.
8. **Phone.** Offer to set a passcode and explain how to open the app on the phone.
9. **Write the settings note** and print a summary of every choice.

The settings note is `Mind Isle/Settings.md`. It holds every consent, readable and editable in Obsidian:

```yaml
---
type: palace-settings
sources: { orca: true, claude-code: true, codex: false }
hooks: { claude-code: installed, orca: installed }
summaries: { default: ask, cli: claude, sessions_dir: Sessions }
worldview: { scan: folders, folders: [Journal], interview: true, use_in_ai: false }
checkin: { gate: soft, dusk_from: "17:00" }
season: auto
personality: { mbti: , enneagram: , big5: }
consents_updated: 2026-10-26
---
```

Re-running onboarding (`npm run setup`, or asking the agent) shows the current choices and changes only what the user changes.

---

## 6. Seasons & weather

**Six seasons plus Auto:**

| Season | Palette | Particles |
|---|---|---|
| Spring | Fresh greens, pink blossom trees | Drifting petals |
| Summer | Saturated greens, bright sand | Heat shimmer, butterflies |
| Autumn | Orange and red canopy, golden grass | Falling leaves |
| Winter | Snow-capped ground, pale water, frozen shallows | Snowfall |
| Dry | Tan grass, low water line, clear sky | Dust motes |
| Wet | Deep greens, high water, overcast tint | Rain and ripples |
| **Auto** | Real season for the user's location | |

**The user can always pick any season manually.** All six are available to everyone, whatever the location. Auto is just the default.

**How Auto decides:**
- Temperate latitudes use the four seasons by hemisphere.
- Latitudes within roughly ±23.5° use Dry/Wet by month, from a built-in table by region.
- During onboarding the user sees the result and can correct it ("Dry: Apr–Oct, Wet: Nov–Mar, correct?"). The corrected months are saved in settings.
- The location comes from the configured timezone; no geolocation prompt.

Day and night stay independent of the season. Particles stop under `prefers-reduced-motion`, and all palettes are checked for contrast in both light and dark themes.

Optional **mood weather:** today's Dawn energy adds an overlay (energy 1–2 gives a light drizzle, 5 gives sun rays). Off by default.

---

## 7. Personality → avatar

Optional, self-reported or via a short in-app quiz. Never inferred from notes.

| Input | Changes |
|---|---|
| MBTI temperament: Analyst (NT), Diplomat (NF), Sentinel (SJ), Explorer (SP) | Outfit: scholar robe, bard cloak, knight armour, ranger gear |
| MBTI E / I | E: banner-bearer pose · I: companion pet (cat, owl, fox) |
| Enneagram 1–9 | Emblem on the chest and accent colour |
| Big Five (alternative, more evidence-based) | Outfit from highest trait, accent from second |
| Free choice | Hair, skin tone, colours (always the user's pick) |

Sprites are layered: base, then outfit, emblem, accessory and companion. The header, Character page and `/hall` use the same avatar.

---

## 8. Attributes v2

Current attributes are lifetime counts with hand-picked weights. They only ever go up, and one of them rewards note volume. v2 replaces them with **30-day rolling scores** that decay, each normalised against the user's own 90-day baseline. Every score has a "why?" breakdown on hover.

| Attribute | Measures | Inputs (last 30 days) |
|---|---|---|
| **Builder** | Making things move | Distinct projects with real movement, **active** session hours (from §2; gaps over 10 min between events don't count), tasks completed |
| **Follow-through** *(new)* | Doing what you planned | Planned items done ÷ planned (from Dawn/Dusk), with partly done counted as 0.5 |
| **Diplomat** | Keeping people warm | Distinct people contacted; "I owe them" items closed |
| **Strategist** | Judgement quality | Decisions sealed; **calibration**: share of judged decisions rated "Right call", shown with sample size |
| **Sage** | Knowing your own mind | Beliefs confirmed or revised, reflections written |
| **Chronicler** | Showing up | Check-in consistency: days with Dawn or Dusk ÷ days. Not note count. |

- XP stays cumulative for levels, but no XP source rewards raw volume.
- Class = highest attribute over the last 30 days, so it can change as your month changes.

---

## 9. Robustness

| Area | Requirement |
|---|---|
| **Tests** | Unit tests for frontmatter and section editing, task parsing, mapping scores, redaction, attribute formulas. A fixture vault and fixture transcripts for each source. End-to-end tests (Playwright) for Dawn → Dusk, mapping review and reassignment. CI runs them all on every push. |
| **Write safety** | Re-read the note's mtime and hash before writing. If it changed since read, re-apply the edit to the new content; if the edit no longer applies, skip and surface a conflict. Write via temp file + rename. |
| **YAML lists** | Editing list fields (`repos`, `aliases`) uses the YAML document API, which preserves comments and order, instead of line replacement. |
| **Performance** | An incremental index of the vault, kept in `.palace/index`, updated by a file watcher instead of a full rescan per request. Target: 5,000 notes, page render under 300 ms. |
| **Live updates** | One SSE endpoint carrying session events and vault changes, with reconnect and backoff. |
| **Jobs** | A durable queue in `.palace/jobs/` for summaries and backfill, which resumes after restart and is visible in Settings. |
| **Settings** | A Settings page that edits `Mind Isle/Settings.md`, including uninstall-hooks, forget-worldview and failed jobs. |
| **Security** | Passcode required whenever the app listens beyond localhost. Hook scripts write metadata only. Redaction runs before any transcript leaves the parser. |
| **Portability** | macOS, Linux and Windows paths for every source. Missing sources degrade quietly. |

---

## 10. Phases

| Phase | Scope | Depends on |
|---|---|---|
| **A** | Check-in gate (§1), six seasons + Auto (§6), test harness + write safety (§9) | — |
| **B** | Session sources, hooks, live strip, workers on the island, mapping + reassignment, backfill (§2) | A (tests, write safety) |
| **C** | Settings note + page, `AGENTS.md` onboarding (§5), summaries pipeline with redaction (§3) | B |
| **D** | Worldview wing (§4) | C (consent framework) |
| **E** | Attributes v2 (§8), personality avatar (§7) | B (session hours), C |
| **F** | Civilization (§12): Shells, the Owner, villagers' life and death, buildings, events, Eras | A–E |

Each phase ships only when its acceptance checks pass.

## 11. Resolved questions

- **Tropical months:** a built-in table by region, confirmed during onboarding. Any season can always be picked manually (§6).
- **Unanswered summaries:** they never expire. Every session gets a metadata record; summaries wait as pending scrolls, batched at Dusk, with a warning before the transcript is deleted (§3.1).
- **Session hours:** active time only; gaps over 10 minutes don't count (§8).

## 12. Civilization (Phase F)

A game layer on the island. Nothing in it replaces Mind Isle's own features; it is fed by them.

**Shells 🐚.** Earned from dated vault events, recomputed on every load (nothing to fake, same on every device): a quest ticked (✅ date; 1, 2 or 3 by priority, at most 10 a day), a Dawn plan item done (2), Dawn locked and Dusk closed (2 each), a conversation (3; a rebirth 10), a project Log line (1), a session note (1), a decision judged (2). Only days since the isle was founded count.

**Villagers.** Every person note. Contact history comes from meeting `attendees`, daily `## People` links, `last_contact` and `first_met`. Each person has a clock by `circle:` (close 10/21 days, client 14/30, network 45/90 until sick/dead; default client when their company is a project's client, else network). Past the dead mark they become a ghost with a grave; the next contact is a rebirth and adds a life. `in_memoriam: true` gives a golden spirit that never decays.

**The Owner (Atlas).** Each night, for every night not yet processed, it pays weekly upkeep (closing buildings it can't pay for) and builds at most one thing, ranked: people in danger → what you do most → saving. The choice and its reason become the Dawn report. Only spending and buildings are stored, in `.palace/isle.json`.

**Buildings.** Per village: Clinic (+7 days before death), Post Office (Dawn suggests a message to a sick person), Shrine (rebirth pays 15), Tavern (conversations there pay 4). Island-wide: Library (session notes pay 2), Market (high-priority quests pay 4).

**Events (F3).** All decided by the Owner at night and stored, so they're the same on every device:
- *Festival:* the next day in the calmest village (3+ alive, nobody sick, under 3 ghosts) that hasn't had one in 14 days (7 in a Golden Age); conversations there pay +3.
- *Storm:* after 3 days in a row with nothing earned (at most one a week), the newest working building is broken from the next morning until the Owner pays a quarter of its price to mend it.
- *Birthdays:* `birthday:` (`MM-DD` or a full date) on a person note; Dawn mentions them 3 days ahead, a conversation on the day pays +5.
- *Weekly challenge:* posted on the latest night only, ending on Sunday: reach 2 of up to 5 sick or dead people in the village most in need (15 + 5 per person, and a festival there), or finish 12 quests when nobody is.

**Levels.** Each building goes to level 2 and 3 when enough happens after it went up (rules in `LEVELS`), then the Owner pays 60% / 100% of its price. Clinic +7/+10/+14 days; Post Office 1/2/3 letter ideas; Shrine 15/18/20; Tavern, Library +1/+2/+3; Market high, then medium, then every quest +1.

**Wonders and the Golden Age.** Unlocked within the Era by 60 nights with nobody dying (Great Lighthouse: +3 days for every sick villager), 20 people brought back (World Tree: rebirths +5), 60 Dawns locked (Grand Archive: Dawn and Dusk 3 each). They need the Plaza (60 🐚), then cost 150–180. A Golden Age starts the first night every village of 3+ has all four village buildings, the island has Library, Market and Plaza, and nobody is sick.

**Eras (F4).** At the end of 31 December the Owner records the year (`EraRecord`), writes the chronicle note `Mind Isle/Eras/<year>.md` (never over an existing one) and starts a new island on 1 January: a quarter of the treasury, no buildings, blueprints at half price, statues of the year's Wonders. People carry over as they are, because they come from the vault. Each year's coast is drawn from noise shifted by the year.
