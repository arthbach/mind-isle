# Mind Isle

Your second brain and your AI agents, as a pixel-art island.

Mind Isle is built from your Obsidian notes and your Orca, Claude Code and Codex sessions. Watch your agents work on your projects live, see which session is waiting on you, and notice which projects and people are going quiet.

Your projects become buildings in a workshop. The people you know live in villages. Decisions are sealed scrolls in a library, your beliefs fly as banners, and your milestones stand in a trophy hall. Each morning and evening, **Atlas**, your chief of staff, checks in from your phone: what will you do today, and what actually got done?

Nothing is invented. Every building, lantern and XP point is read from plain markdown notes, and everything the game writes goes back into those same notes. Your data never leaves your machine.

```
           Banner Wall          Codex
  ┌──────────┐            ┌───────────┐
  │ Workshop │── Home ────│ Villages  │
  └──────────┘  (Atlas)   └───────────┘
               Trophy Hall ─── Harbor
```

## What's on the island

| Place | Made from | What it shows |
|---|---|---|
| **Workshop** | notes with `type: project` | Scaffolding while active, weeds after 45 silent days, fog after 120. A gold roof when done, a tarp when paused, ruins when stopped. |
| **Villages** | `type: person` | One village per company. Each person carries a lantern that fades as `last_contact` gets older. |
| **Codex** | `type: decision` notes, plus every bullet under `## Decisions` in meeting and daily notes | Each decision is sealed. After 90 days the seal cracks and you judge it: right call, wrong call, mixed, too early. |
| **Banner Wall** | `type: belief` | What you believe, with evidence and confidence. Proposed beliefs fly white until you confirm them. |
| **Trophy Hall** | `type: achievement`, shipped projects, island badges | Public or private. Public ones appear at `/hall`, a page you can share. |
| **Harbor** | `type: bet` (or `application`) | Outbound bets such as applications, pitches and grants. Ships are at sea, docked or wrecked. |
| **Quest board** | every open `- [ ]` task in the vault | Overdue and high-priority first (Obsidian Tasks syntax). |

The island grows with your vault. More projects add workshop rows, more companies add village rows, more beliefs lengthen the banner wall, and more bets fill the harbor. Nothing is cut off. When there are more than 8 companies, people who are the only one from their company share a "Wider world" village. The map fits the screen and opens on the whole island: drag to move, scroll or pinch to zoom, and use **⤢** to see the whole island. With the map focused, the arrow keys move it, `+` and `−` zoom, and `0` fits the island.

## Playing it

The island is the game world: it fills the screen, and everything else is a HUD on top of it.

| HUD | Where | What |
|---|---|---|
| Player card | top left | Your name, level, class and XP bar. Click the portrait for the character sheet. |
| Resources | top center | Active sites (and weedy ones), warm lanterns, seals to judge, banners to confirm, trophies. |
| Quick buttons | top right | Music on/off (or press `M`), day/night, the public trophy hall. |
| Live tracker | under the player card | Running agent sessions, the ones that need you first. Folds away; starts folded on phones. |
| Atlas | bottom left | Your chief of staff's message for the day, with a shortcut to Today. "Later" tucks him into a button. |
| Inspector | right | Opens when you click a building, person, banner or ship. |
| Hotbar | bottom | All navigation: Island, Today, Sessions, Codex, Banners, Trophies, Character, Settings. Keys `1`–`8` open them. |

Every page except the island opens as a **window** over it, so the island never goes away. `Esc`, **✕** or a click outside closes it.

**Settings** (hotbar slot 8) has one page per config:

| Page | What |
|---|---|
| World | Season, fog of neglect, harbor ships. The island stays visible beside the panel, so changes show at once. |
| Sound | Music on/off, volume, song (Auto follows day/night), sound effects. |
| Display | Day, night or follow the device; which HUD panels show. |
| Agents | Which agent apps to read sessions from, and live hooks. |

World, Sound and Display are saved per browser. Agents is saved with the app's data.

**Music** is two original chiptune loops, *Harbor Morning* (day) and *Lantern Night* (night), synthesized in the browser with Web Audio. No audio files ship with the repo and nothing is downloaded. Browsers only allow sound after a click or key press, so the music starts on your first one.

## The daily loop (phone)

The check-in comes first. Before `PALACE_DUSK_FROM` (default 17:00), any page opens with **Dawn** on top until you lock a plan; after it, **Dusk** opens until you close the day. "Skip today" is always there. Skips are written to the daily note (`skipped: [dawn]`), shown as skipped on your streak, and never count as a check-in.

Open **Today** on your phone and add it to your home screen; it installs like an app.

- **☀ Dawn:** set your energy, write what you'll do today (or tap Atlas's suggestions from your quest board), then lock it in. The plan is written to `01 Daily/YYYY-MM-DD.md` as tasks.
- **☾ Dusk:** mark each item done, partly done or moved to tomorrow. Add unplanned wins, the people you talked to, a decision and one line about the day. Then close the day. Atlas will:
  - tick off the plan in your daily note (`[x]`, `[/]`, `[>]`)
  - light lanterns by setting `last_contact` on the people you named, matched by name or alias
  - clear weeds by setting `last_activity` on projects your work mentioned
  - complete the matching open task wherever it lives in the vault
  - seal your decision into the Codex

## Agent sessions (Orca, Claude Code, Codex)

The **Sessions** window connects the island to your AI coding agents. A building with running sessions gets a light beam and a small **crew pin** above it: the agent's face and how many sessions are running. Hover or tap the pin to open a bubble with one portrait per session (a builder for Claude, a robot for Codex), so three sessions on one project means three portraits. Each portrait shows its state: ⚒ working, z idle, ! needs you. The pin turns red and bounces when a session is waiting for your permission. Sessions in folders that aren't confirmed for a project wait at a dashed pin by the harbor. The live tracker under your player card lists every session, the ones that need you first.

- **Consent first.** Nothing is read until you **Allow** a source in **Settings → Agents**. Turning a source off hides its sessions and removes any hooks Mind Isle installed for it.
- **Metadata only.** Mind Isle reads which folder, when, which branch, the agent's own generated title, and which tool ran. It never stores your prompts, code, commands or tool output.
- **How running sessions are detected:**
  - Claude Code keeps a list of its running sessions.
  - Codex writes its task events to its log.
  - Optional **live hooks** make "needs you" instant. They're added next to whatever hooks already exist (Orca installs its own), backed up first, and removed cleanly.
- **Which project is each folder?** Folders are matched to projects by confidence:

  | Evidence | Result |
  |---|---|
  | The folder is in the project's `repos:` | placed (confirmed) |
  | The git remote matches the project's `repo_urls:` | placed automatically, with **Undo** |
  | The folder name matches the project name or an alias | asks you ("Is this right?") |
  | Anything weaker, or two projects tie | waits at the harbor until you choose |

  Saving writes the folder into the project's `repos:`, so the next session lands there by itself. **Reassign** is always available. You can also create a new project note from a folder, or mark it as not a project.

Where it looks (each can be overridden):

| Source | Location |
|---|---|
| Claude Code | `$CLAUDE_CONFIG_DIR` or `~/.claude` (`PALACE_CLAUDE_DIR`) |
| Codex | `$CODEX_HOME` or `~/.codex` (`PALACE_CODEX_DIR`) |
| Orca | its app-data folder, e.g. `~/Library/Application Support/orca` on macOS (`PALACE_ORCA_DIR`) |

### Session summaries (optional)

Turn them on in **Settings → Summaries**. When a session has been quiet for 2 hours, Mind Isle can write a note about it to `Sessions/` in your vault: a summary, decisions (they appear in the Codex) and follow-ups (they appear on the quest board).

- **Ask** (default) waits for your yes on each session; **Always** writes them on its own; **Never** never opens the transcript. A project note can override this with `summaries: ask|auto|off`.
- Summaries are written by your own CLI on your computer (`claude -p` with a small model, or `codex exec`), with no tools and no saved session.
- Before the transcript leaves Mind Isle, keys, passwords, tokens, `.env` values, emails and phone numbers are removed. Add your own words to remove (a client's name, say) under `redact_patterns` in `Mind Isle/Settings.md`.
- Sessions that ended before you turned summaries on are never touched. Every session still gets a metadata record (times, files, the agent's title) in the History list.

## Worldview banners (optional)

The Banner Wall has a **Worldview wing** for values, faith and spirituality, and civic views. It follows stricter rules than the rest of the app:

- Nothing is read until you choose what may be: all notes, chosen folders, only session notes, or **interview only** (nothing is read; Atlas asks one question a day at Dusk).
- Only your own first-person lines count. Quotes, `Name:` lines and "she said…" are skipped, and people notes are never read.
- Every banner is a proposal with your exact words as evidence; anything the AI can't quote word for word is dropped. No demographic traits are ever inferred.
- Banners live in `Mind Isle/Worldview/`, stay blurred until you tap Reveal, never appear on the island or the public Hall, and are never given to an AI unless you switch that on for a banner.
- **Forget** deletes everything Mind Isle proposed (confirmed banners only after a second yes) and stops looking.

## Your character

The **Character** page shows six attributes for the **last 30 days**, each with a "why?" breakdown:

| Attribute | What counts |
|---|---|
| Builder | projects that moved, active hours with your agents, tasks completed |
| Follow-through | how much of your Dawn plan got done (partly counts half) |
| Diplomat | different people you were in touch with |
| Strategist | decisions sealed and judged, plus how often your calls were right |
| Sage | beliefs confirmed or adjusted, reflections written at Dusk |
| Chronicler | days with a Dawn or Dusk check-in (note count doesn't matter) |

50 means your usual pace (your 90-day average), 100 twice that; Follow-through and Chronicler are plain percentages. Your class is this month's strongest attribute. XP keeps growing for levels, but nothing rewards raw note volume.

Your avatar comes only from what you enter: MBTI (or a 4-question quiz) picks the outfit (scholar, bard, knight or ranger), extraverts carry a banner and introverts get a companion, Enneagram adds an emblem, and Big Five works as an alternative. Hair, skin tone and colour are always your choice. It's saved in `Mind Isle/Settings.md`.

## The civilization

Your people are villagers, and Atlas is the Owner of the isle.

- **Shells 🐚** are earned from what you actually do, read from the vault: a ticked quest (1–3 by priority, at most 10 a day), a Dawn plan item done (2), Dawn and Dusk (2 each), a conversation (3), bringing someone back (10), a project update or session note (1), a decision judged (2).
- **Villagers live and die by contact.** Contact dates come from meeting `attendees`, the People section of daily notes, `last_contact` and `first_met`. Each person has a clock set by `circle:` in their note (close: sick at 10 days, ghost after 21; client: 14/30; network: 45/90). A ghost keeps a grave on the island until you talk again; then they're reborn, and their life count goes up. `in_memoriam: true` gives a golden spirit that never decays. Your own person note needs `self: true` (or set `PALACE_OWNER_NAME`).
- **Atlas builds overnight**, one thing a night, for the worst problem first: a Clinic where someone is sick (7 more days before they die), a Post Office where people drift (a letter idea at Dawn), a Shrine where ghosts gather, a Tavern where you talk most, a Library and a Market for the whole island. Buildings cost weekly upkeep; unpaid ones close until there's money again. Dawn opens with what it did and why; **Treasury** (key 9) shows the ledger, who needs you and what's next.

- **Events.** Calm villages (nobody sick, fewer than three ghosts) hold a festival every two weeks, when conversations there pay +3. Three days in a row with nothing earned bring a storm that breaks a building until Atlas mends it. Add `birthday: 04-12` to a person's note and Dawn reminds you; a message on the day pays +5.
- **The weekly challenge.** Atlas picks the village most in need ("Reach 2 of these 5 people by Sunday"), or a quest goal when nobody is. Win it for Shells and a festival there.
- **Levels and Wonders.** Buildings go up to level 3 by what happens around them (a Clinic by people brought back, a Tavern by festivals…), then Atlas pays for the upgrade. Three Wonders unlock by what you do in the year: the Great Lighthouse (60 nights in a row with nobody dying), the World Tree (20 people brought back) and the Grand Archive (60 Dawns locked). They stand on the Plaza, new land south of Home. When every village of three or more has all four buildings and nobody is sick, a **Golden Age** begins.
- **Eras.** On New Year's night Atlas closes the year: the chronicle goes to `Mind Isle/Eras/<year>.md` in your vault, and it sails to a new island with a quarter of the treasury, blueprints (rebuilding costs half) and a statue of each Wonder. Your people come along, alive or not. **Treasury → The year so far** shows this year's chronicle as it's being written.

Only Atlas's state is stored (`.palace/isle.json`: spending, buildings, festivals, storms, challenges, past Eras); Shells and lives are recomputed from your notes.

## Seasons

Pick the island's season in **Settings → World**: **Spring, Summer, Autumn, Winter, Dry season or Wet season**, each with its own palette and weather. **Auto** (the default) follows the real season where you live, worked out from `PALACE_TIMEZONE`:

- temperate timezones use the four seasons for their hemisphere
- tropical timezones use dry and wet seasons by region (e.g. wet November–April in northern Australia, May–October in mainland Southeast Asia)

If Auto gets your climate wrong, set `PALACE_CLIMATE` (`north`, `south` or `tropical`) and, for tropical, `PALACE_WET_MONTHS` (e.g. `11,12,1,2,3`). Your choice is remembered per browser.

## Quick start

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without configuration the app runs on a **fictional demo vault**: it copies `demo-vault/` into `.palace/` the first time, so trying it never changes the repo.

### Use your own vault

```bash
cp .env.example .env.local
```

Then set at least:

```bash
VAULT_PATH=/absolute/path/to/your/vault
PALACE_OWNER_NAME=Your Name
```

To try it safely first, add `PALACE_READ_ONLY=true`. The island renders, but nothing is ever written.

### Use it from your phone

On the same Wi-Fi:

```bash
# in .env.local: set a passcode first!
PALACE_PASSCODE=something-long

npm run build
npm run start:phone     # listens on your local network
```

Open `http://<your-computer-ip>:3000/today` on the phone, enter the passcode, then use *Add to Home Screen*.

When you're away from home, put the computer on a private network such as [Tailscale](https://tailscale.com/) rather than exposing the port to the internet. Every page except `/hall` and `/login` requires the passcode.

## Note schema

Notes are recognised by their `type:` frontmatter, not by folder, so organise your vault however you like. All fields are optional except `type`.

<details>
<summary><b>project</b></summary>

```yaml
---
type: project
status: active          # active | blocked | paused | maintenance | done | stopped
client: Northwind       # "Own venture" (or venture: true) gives it your colour
started: 2026-01-12
last_activity: 2026-09-02   # last real movement, not last edit
deadline: 2026-12-01
aliases: [NW]
---
## Objective
One paragraph; shown on the island.
```
</details>

`repos:` and `repo_urls:` (optional lists) connect agent sessions to a project: `repos: ["~/code/northwind", "~/code/northwind-worktrees/*"]`, `repo_urls: ["github.com/acme/northwind"]`. The Sessions page fills `repos:` in for you.

<details>
<summary><b>person</b></summary>

```yaml
---
type: person
aliases: [Maya]          # every short form you use in notes
company: Northwind Logistics
role: Operations Lead
last_contact: 2026-10-20
---
```
Mark your own note with `self: true` so you don't appear in a village.
</details>

<details>
<summary><b>decision</b></summary>

```yaml
---
type: decision
date: 2026-05-20
domain: Business
review_on: 2026-08-20    # default: date + 90 days
question: "Did outcome pricing win bigger projects?"
verdict:                 # filled in by the game when you judge it
---
Context: why you decided this.
```
Bullets under `## Decisions` in any `type: meeting` or `type: daily` note also count. Verdicts for those are stored in `.palace/state.json`.
</details>

<details>
<summary><b>belief</b></summary>

```yaml
---
type: belief
status: proposed         # proposed | confirmed | adjusted | rejected
confidence: 2            # 1–3
evidence: "Where this shows up in your notes"
---
```
Name the note after the statement itself, e.g. `Ship small, ship often.md`.
</details>

<details>
<summary><b>achievement</b></summary>

```yaml
---
type: achievement
category: Ventures       # groups trophies in the hall
date: 2026-07-01
public: true             # only public trophies appear on /hall
locked: false            # true = a goal you haven't reached yet
icon: cup                # cup | medal | book | star | scar
detail: "One line about it"
---
```
</details>

<details>
<summary><b>bet</b></summary>

```yaml
---
type: bet                # or: application
kind: Grant
status: sent             # draft | ready | sent | rejected | offer
sent: 2026-09-28
note: "One line about it"
---
```
</details>

<details>
<summary><b>daily</b> (written by the app)</summary>

```markdown
---
type: daily
date: 2026-10-26
energy: 4
plan_locked: true
closed: true
---
## Plan
- [x] Ship the onboarding flow ✅ 2026-10-26
- [/] Call Maya about the GPS export
- [>] Pricing page draft
## Done
## People
## Decisions
## Reflections
```
The app only replaces these sections. Anything else you write in the daily note is left alone.
</details>

## How the game scores you

XP and attributes are computed from the vault every time a page loads; nothing is stored or made up.

| Earns XP | |
|---|---|
| Daily note | 20 |
| Task ticked off | 10 |
| Decision judged | 25 |
| Belief confirmed or adjusted | 15 |
| Warm lantern (contact within 30 days) | 5 each |
| Project shipped | 100 |
| Trophy earned | 50 |

Your class (Architect, Envoy, Tactician, Philosopher, Cartographer) is your strongest attribute. The thresholds for weeds, fog and lanterns live in `RULES` in [`src/lib/game.ts`](src/lib/game.ts).

## Configuration

All settings go in `.env.local`. See [`.env.example`](.env.example) for the full list.

| Variable | Default | |
|---|---|---|
| `VAULT_PATH` | demo vault | Absolute path to your Obsidian vault |
| `PALACE_OWNER_NAME` | `Traveler` | Your name in greetings and on `/hall` |
| `PALACE_VAULT_NAME` | folder name | Vault name for `obsidian://` links |
| `PALACE_DAILY_DIR` | `01 Daily` | Where daily notes are written |
| `PALACE_EXCLUDE` | `.obsidian,.trash,.git,node_modules,Templates,Archive,_attachments` | Folders to skip (`Archive` also skips `07 Archive`) |
| `PALACE_PRIVATE_TAGS` | `private,career,personal` | Tags that keep a note out of public view |
| `PALACE_TIMEZONE` | system | What "today" means, and the Auto season |
| `PALACE_DUSK_FROM` | `17:00` | When Dusk replaces Dawn |
| `PALACE_CHECKIN_GATE` | `soft` | `off` stops the check-in opening on top of other pages |
| `PALACE_CLIMATE` | from timezone | `north`, `south` or `tropical` |
| `PALACE_WET_MONTHS` | from timezone | Wet-season months for tropical climates, e.g. `11,12,1,2,3` |
| `PALACE_CLAUDE_DIR` / `PALACE_CODEX_DIR` / `PALACE_ORCA_DIR` | auto-detected | Where to look for agent sessions |
| `PALACE_PASSCODE` | — | Requires a passcode everywhere except `/hall` |
| `PALACE_READ_ONLY` | `false` | Never write to the vault |
| `PALACE_DATA_DIR` | `.palace` | The app's own small state file |

## Privacy

- The vault is read from disk at request time. Nothing is bundled into the build, sent to a server, or tracked.
- The app writes only to the notes described above, and only by editing specific frontmatter lines and `##` sections. It never deletes or moves a note.
- Every write is checked: the edited frontmatter must still parse and no other field may change, otherwise nothing is saved. If Obsidian saves the note while the app is writing, the edit is re-applied to the new content instead of overwriting it. Notes are written through a temp file, so a crash never leaves half a note.
- `.env.local` and `.palace/` are git-ignored. Don't commit them.
- `/hall` is the only page meant to be shared. It renders achievements with `public: true` and nothing else.

## Development

```bash
npm run typecheck   # TypeScript
npm test            # unit tests (Vitest), each file on a throwaway copy of the demo vault
npm run test:e2e    # end-to-end (Playwright): builds, then runs morning + evening servers on a test vault
npm run check       # all of the above
```

The end-to-end tests use your installed Chrome locally and Playwright's Chromium in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). They pin the clock with `PALACE_NOW` and always use `.palace-e2e/`, never your vault.

## Project structure

```
src/
  app/
    (palace)/        island, today, codex, banners, trophies, character
    (public)/        hall (shareable), login
    actions.ts       server actions (thin wrappers)
  components/        IslandView (canvas map), mapCamera (pan/zoom), CrewPins, Hud (HUD + hotbar), GameWindow,
                     Settings, check-in (dawn/dusk), boards, sprites
  lib/
    checkin.ts       every write to the vault: dawn, dusk, skips, boards
    sessions/        agent sessions: discovery, log reading, state, mapping, hooks
    gate.ts          which check-in to show, and when
    seasons.ts       seasons and climate by timezone
    vault/           read, parse and safely edit markdown
    world.ts         compiles the vault into the game world
    game.ts          rules, levels, name matching (shared with the client)
    store.ts         tiny JSON state; swap for a database here
    prefs.ts         per-browser settings (season, layers, sound, HUD panels)
    audio.ts         the synthesized music and UI sounds
  proxy.ts           optional passcode gate
scripts/palace-hook.mjs   the metadata-only hook installed into Claude Code / Codex
demo-vault/          fictional sample vault (also the test fixture)
tests/               unit (Vitest) and end-to-end (Playwright)
docs/                roadmap for the next version
```

### Using a database instead of JSON

Only decision verdicts for meeting and daily bullets live outside the vault, in `.palace/state.json`. To move them to SQLite or Postgres, reimplement `readStore` and `updateStore` in [`src/lib/store.ts`](src/lib/store.ts); nothing else touches storage.

## Ideas for later

- Crossroads: unresolved either/or choices that become decisions once settled
- A weekly chronicle written by Atlas from the week's daily notes
- Voice input at Dawn and Dusk
- Time slider to watch the island grow

## License

Add a license before publishing this repository.
