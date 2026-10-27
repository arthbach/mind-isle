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

## Phase C: Consent, onboarding & memory
- [ ] `Mind Isle/Settings.md` note + Settings page
- [ ] `AGENTS.md` / `CLAUDE.md` onboarding script for the user's AI
- [ ] Session metadata records for every session from an enabled source
- [ ] Pending scrolls: never expire, Dusk batch (Save all / Review / Skip), "Always save" per project
- [ ] Transcript-retention warning at Dawn
- [ ] Summaries pipeline: consent check → redact → CLI summarise → validate → write
- [ ] Durable job queue with retry
- [ ] Session notes feed Codex, Quests, `last_activity`
- [ ] Phase C acceptance checks pass

## Phase D: Worldview
- [ ] Opt-in scan with scope (all / folders / sessions / interview / not now)
- [ ] Owner-only extraction, proposals with evidence
- [ ] Sensitive containment (no /hall, no AI context) + Forget
- [ ] Interview mode at Dusk
- [ ] Phase D acceptance checks pass

## Phase E: Character
- [ ] Attributes v2: 30-day rolling scores, Follow-through, "why?" breakdown
- [ ] Personality avatar: MBTI / Enneagram / Big Five, layered sprites
- [ ] Phase E acceptance checks pass

## Open questions
- [x] Tropical months: built-in table by region, confirmed at onboarding; manual season pick always available
- [x] Unanswered summaries: never expire; pending scrolls batched at Dusk
- [x] Session hours: active time only
