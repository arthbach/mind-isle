# v2 Progress Tracker

Working checklist for [ROADMAP-v2.md](ROADMAP-v2.md). Tick items as they ship.
**Delete this file once every phase is done.**

Legend: `[ ]` not started · `[~]` in progress · `[x]` done (acceptance checks pass)

## Phase A: Foundations & quick wins  `[x] done`
- [x] Test harness: unit tests + fixture vault, Playwright e2e, CI
- [x] Write safety: mtime/hash check, re-apply or conflict, temp file + rename
- [x] YAML list-safe frontmatter editing
- [x] Check-in gate (§1): soft gate, Dawn/Dusk by time, "Skip today" recorded
- [x] Seasons (§6): Spring, Summer, Autumn, Winter, Dry, Wet + Auto; manual pick always available
- [x] Phase A acceptance checks pass

## Phase B: Agent sessions  `[x] done`
- [x] Source adapters: Claude Code, Orca, Codex (detect, list, read)
- [x] Hooks: install/uninstall per source, metadata-only event files
- [x] Session state machine (working / needs you / idle / ended)
- [x] Mapping: confidence scoring, auto ≥ 0.90, ask 0.60–0.89, Harbor < 0.60
- [x] Reassign session → project (updates `repos:`; re-linking past summaries lands with summaries in Phase C)
- [x] First-run backfill + mapping review table
- [x] UI: workers on buildings, "!" for needs-you, live strip, SSE updates
- [x] Phase B acceptance checks pass

## Phase C: Consent, onboarding & memory  `[x] done`
- [x] `Mind Isle/Settings.md` note + Settings page (sources, hooks, summaries, redaction; edits in Obsidian apply live)
- [x] `AGENTS.md` / `CLAUDE.md` onboarding script for the user's AI
- [x] Session metadata records for every session from an enabled source (`.palace/sessions/records/`, read incrementally; History on the Sessions page)
- [x] Pending scrolls: never expire, Dusk batch (Save all / Review / Skip), "Always save" per project, 📜 on the building
- [x] Transcript-retention warning at Dawn (`warn_days`, default 25)
- [x] Summaries pipeline: consent check → redact → CLI summarise → validate → write (verified with a real `claude -p` run; chunking for long sessions)
- [x] Durable job queue with retry (`.palace/jobs/`, resumes after restart; failed jobs + Retry in Settings → Summaries)
- [x] Session notes feed Codex, Quests, `last_activity`
- [x] Phase C acceptance checks pass

## Phase D: Worldview  `[x] done`
- [x] Opt-in scan with scope (all / folders / sessions / interview / not now)
- [x] Owner-only extraction, proposals with evidence (first-person lines only; quotes must be verbatim or the proposal is dropped)
- [x] Sensitive containment (no /hall, no island, no AI context, veiled until revealed) + Forget
- [x] Interview mode at Dusk
- [x] Phase D acceptance checks pass

## Phase E: Character  `[x] done`
- [x] Attributes v2: 30-day rolling scores, Follow-through, "why?" breakdown (`src/lib/attributes.ts`)
- [x] Personality avatar: MBTI / Enneagram / Big Five, layered sprites, 4-question quiz (`src/lib/avatar.ts`)
- [x] Phase E acceptance checks pass

## Phase F: Civilization  `[x] done`
- [x] Shells from dated vault events, with a daily quest cap (`src/lib/civ/earn.ts`)
- [x] Villagers' life from contact history: clocks by circle, ghosts and graves, rebirths and lives, in memoriam (`src/lib/civ/life.ts`)
- [x] The Owner's nights: upkeep, closing and reopening, one building a night ranked by need (`src/lib/civ/owner.ts`)
- [x] Six buildings with real effects, drawn in villages and by Home
- [x] Dawn night report (with the Post Office's letter idea), Treasury page, HUD treasury and villagers alive, circle picker on a villager's pin
- [x] F3: festivals in calm villages, storms after quiet days (repairs), birthdays (`birthday:`), building levels earned by behaviour, three Wonders on the Plaza (new land), the Golden Age, the weekly challenge
- [x] F4: Eras: on New Year's night the chronicle goes to `Mind Isle/Eras/<year>.md` and Atlas moves to a new island (a quarter of the treasury, half-price blueprints, statues); Treasury → Eras shows the year so far

## Small additions
- [x] Project updates: "+ Add update" on a project pin writes a dated line to `## Log`, moves `last_activity` forward (never back), optionally sets `status`; the latest three show on the pin
- [x] Quest board at Dawn: ✓ Done / ✗ Drop close a task in its own note (`[x] … ✅ date` / `[-] … ❌ date`)

## Open questions
- [x] Tropical months: built-in table by region, confirmed at onboarding; manual season pick always available
- [x] Unanswered summaries: never expire; pending scrolls batched at Dusk
- [x] Session hours: active time only
