# Mind Isle: notes for AI agents

Mind Isle turns an Obsidian vault into a pixel-art island. It's a local Next.js app; everything stays on the user's computer.

## Setting up Mind Isle for a user (onboarding)

Follow this when the user asks you to set up, install or configure Mind Isle, or when `.env.local` doesn't exist yet.
Re-running it later shows the current choices and changes only what the user changes.

Ground rules:

- **Ask before every choice; never guess.** Show what you found, then let the user pick.
- **Write only two places:** `.env.local` in this repo (git-ignored) and the settings note `Mind Isle/Settings.md` in the user's vault, plus `repos:` lines in project notes during step 4. Never commit anything about the user to this repository.
- **Read, don't scrape.** Detecting agents and vaults only lists folders. Don't open session transcripts.

Steps:

1. **Vault.** Find candidate vaults: folders containing `.obsidian/` (look in `~/Documents`, `~/Obsidian`, iCloud's `Mobile Documents/iCloud~md~obsidian/Documents`, and the home folder, two levels deep). Ask which one. Write `VAULT_PATH=<absolute path>` to `.env.local`. If the daily notes folder isn't `01 Daily`, ask for it and write `PALACE_DAILY_DIR`.
2. **Identity.** Ask for a display name (`PALACE_OWNER_NAME`) and confirm the timezone (`PALACE_TIMEZONE`, default: the computer's). If the user has a person note about themselves, it needs `self: true` so they don't become a villager.
3. **First look, read-only.** Add `PALACE_READ_ONLY=true`, run `npm install` and `npm run dev`, and ask the user to open http://localhost:3000 and check that their projects and people appear. When they're happy, remove that line (check-ins, summaries and settings need to write).
4. **Agent sessions.** Tell the user which agent apps you can see: Claude Code (`~/.claude/projects`), Codex (`~/.codex/sessions`), Orca (its app-data folder, e.g. `~/Library/Application Support/orca` on macOS). Ask which ones Mind Isle may read; turn them on in **Settings → Agents** (or set `sources:` in the settings note). Live hooks are a separate yes, in the same place. Then open **Sessions** with the user: confident folder matches are placed automatically; ask the user about each folder under "Needs you" and save their answer.
5. **Summaries.** Explain: when a session ends, Mind Isle can write a short note to `Sessions/` using the user's own `claude` or `codex` CLI, after removing keys, passwords, tokens, `.env` values, emails and phone numbers. Ask: ask first (default), always, or never; and which CLI. Turn on in **Settings → Summaries**. Offer to add words that must always be removed (client names, say) to `redact_patterns` in the settings note.
6. **Worldview.** First check for existing `type: belief` notes with `domain: worldview`. Then explain: Mind Isle can propose banners about the user's values, faith and civic views, using only their own first-person words, kept private in `Mind Isle/Worldview/`, never on the public Hall and never given to an AI. Ask what it may read: all notes, specific folders (list the top-level folders and let them pick), only session notes, interview only (nothing read; one question a day at Dusk), or not now. Save the choice on the **Banners** page (Worldview wing). Never run a scan without that choice, and never read or summarise these notes yourself.
7. **Personality** (optional). Offer to set the avatar on the **Character** page: MBTI (or its 4-question quiz), Enneagram, or the top two Big Five traits, plus hair, skin tone and colour. Only what the user says; never guess a type from their notes.
8. **Phone.** Offer to set `PALACE_PASSCODE` (a long one) and explain `npm run build && npm run start:phone`, then opening `http://<computer-ip>:3000/today` on the same Wi-Fi and *Add to Home Screen*. Recommend a private network such as Tailscale for use away from home; never expose the port to the internet.
9. **Summary.** Print every choice made: vault, name, timezone, read-only or not, sources, hooks, summary mode and CLI, passcode set or not. Point to `Mind Isle/Settings.md` as the one place where every permission can be read and changed.

## Working on the code

- `npm run check` runs typecheck, unit tests and end-to-end tests. Tests never touch real vaults or agent folders.
- The plan is in `docs/ROADMAP-v2.md`, progress in `docs/PROGRESS.md`.
- The repository is shared: no personal data in code, tests, fixtures or docs. Real data comes from the vault and `.palace/` (git-ignored) at runtime.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
