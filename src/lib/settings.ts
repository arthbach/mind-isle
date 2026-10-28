// Every consent, in one note the user can read and edit in Obsidian: `Mind Isle/Settings.md`.
// The note is the source of truth. In read-only mode (nothing may be written to the vault) choices are kept
// in the app's own data instead, and win over the note until writing is allowed again.
import fs from 'node:fs/promises';
import { parseLook, parsePersonality, type Look, type Personality } from './avatar';
import { today } from './clock';
import { config } from './config';
import { readSessionStore, updateSessionStore } from './sessions/store';
import type { SourceId } from './sessions/types';
import { splitFrontmatter } from './vault/markdown';
import { resolveInVault, setFrontmatter, setFrontmatterMap, updateNote } from './vault/writer';

export const SETTINGS_NOTE = 'Mind Isle/Settings.md';
export const SOURCES: SourceId[] = ['orca', 'claude-code', 'codex'];
export type SummaryMode = 'off' | 'ask' | 'auto';
export type SummaryCli = 'claude' | 'codex';
export type WorldviewScan = 'all' | 'folders' | 'sessions' | 'interview' | 'off' | 'revoked';
export const WORLDVIEW_SCANS: WorldviewScan[] = ['all', 'folders', 'sessions', 'interview', 'off', 'revoked'];

export interface Settings {
  /** Which agent apps Mind Isle may read sessions from. */
  sources: Record<SourceId, boolean>;
  /** Live hooks the user agreed to install. */
  hooks: Record<SourceId, boolean>;
  /**
   * `since`: when the user turned summaries on (ISO time). Sessions that ended earlier are never summarised.
   * `model`: passed to the CLI; null uses the CLI's own default.
   * `warnDays`: Atlas warns at Dawn when a waiting session's transcript is this old (Claude Code deletes them at 30 days).
   */
  summaries: { default: SummaryMode; cli: SummaryCli; sessionsDir: string; since: string | null; model: string | null; warnDays: number };
  /**
   * Worldview banners (values, faith, civic views). `scan`: never chosen (null), what may be read, or revoked.
   * `interview`: one question a day at Dusk. Nothing here is ever used as AI context unless a banner says so.
   */
  worldview: { scan: WorldviewScan | null; folders: string[]; interview: boolean };
  /** What redaction may keep, and extra patterns to remove (regular expressions). */
  redaction: { keepContacts: boolean; patterns: string[] };
  /** Self-reported only, never inferred: drives the avatar's outfit, emblem and companion. */
  personality: Personality;
  /** The avatar's free choices: hair, skin tone, outfit colour. */
  look: Look;
  consentsUpdated: string | null;
  /** Where these settings live right now. */
  savedIn: 'vault' | 'app';
  /** The note exists (it's created on the first change). */
  noteExists: boolean;
}

const DEFAULTS = { summaries: { default: 'ask' as SummaryMode, cli: 'claude' as SummaryCli, sessionsDir: 'Sessions' } };
const DEFAULT_MODEL: Record<SummaryCli, string | null> = { claude: 'haiku', codex: null };
const bool = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 'on';
const flags = (v: unknown, fallback: Partial<Record<SourceId, boolean>> = {}) => {
  const m = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(SOURCES.map((s) => [s, s in m ? bool(m[s]) : !!fallback[s]])) as Record<SourceId, boolean>;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/** Parse the note's frontmatter. Anything missing or invalid falls back to the defaults. Exported for tests. */
export function parseSettings(fm: Record<string, unknown>, legacySources: Partial<Record<SourceId, boolean>> = {}): Omit<Settings, 'savedIn' | 'noteExists'> {
  const sum = (fm.summaries && typeof fm.summaries === 'object' ? fm.summaries : {}) as Record<string, unknown>;
  const dir = typeof sum.sessions_dir === 'string' && sum.sessions_dir.trim() ? sum.sessions_dir.trim().replace(/^\/+|\/+$/g, '') : DEFAULTS.summaries.sessionsDir;
  return {
    sources: flags(fm.sources, 'sources' in fm ? {} : legacySources),
    hooks: flags(fm.hooks),
    summaries: {
      default: oneOf(sum.default, ['off', 'ask', 'auto'] as const, DEFAULTS.summaries.default),
      cli: oneOf(sum.cli, ['claude', 'codex'] as const, DEFAULTS.summaries.cli),
      sessionsDir: dir,
      since: sum.since && !Number.isNaN(Date.parse(String(sum.since))) ? String(sum.since) : null,
      model: typeof sum.model === 'string' && sum.model.trim() ? sum.model.trim() : null,
      warnDays: Number.isFinite(Number(sum.warn_days)) && Number(sum.warn_days) > 0 ? Math.min(29, Math.round(Number(sum.warn_days))) : 25,
    },
    worldview: (() => {
      const w = (fm.worldview && typeof fm.worldview === 'object' ? fm.worldview : {}) as Record<string, unknown>;
      return {
        scan: oneOf<WorldviewScan | 'none'>(w.scan, [...WORLDVIEW_SCANS, 'none'], 'none') === 'none' ? null : (w.scan as WorldviewScan),
        folders: Array.isArray(w.folders) ? w.folders.map(String).map((f) => f.replace(/^\/+|\/+$/g, '')).filter(Boolean) : [],
        interview: bool(w.interview),
      };
    })(),
    redaction: {
      keepContacts: bool((fm.redaction as Record<string, unknown> | undefined)?.keep_contacts),
      patterns: Array.isArray(fm.redact_patterns) ? fm.redact_patterns.map(String).filter(Boolean) : [],
    },
    personality: parsePersonality(fm.personality),
    look: parseLook(fm.avatar),
    consentsUpdated: fm.consents_updated ? String(fm.consents_updated) : null,
  };
}

// The live stream asks every second; the note is re-read only when it changes on disk.
// Kept on globalThis so every Next.js bundle shares one copy (like the session caches). That copy also
// survives a dev-server code reload, so the key carries the shape version: bump it when Settings changes.
const SHAPE = 6;
const memo = ((globalThis as { __palaceSettings?: { entry: { key: string; value: Settings } | null } }).__palaceSettings ??= { entry: null });

export async function readSettings(): Promise<Settings> {
  const abs = resolveInVault(SETTINGS_NOTE);
  const st = await fs.stat(abs).catch(() => null);
  const store = await readSessionStore();
  const key = `${SHAPE}:${st?.mtimeMs ?? 'none'}:${st?.size}:${config.readOnly}:${JSON.stringify(store.sources)}`;
  if (memo.entry?.key === key) return memo.entry.value;
  const fm = st ? splitFrontmatter(await fs.readFile(abs, 'utf8')).fm : {};
  // Before the note exists, choices made earlier (kept in the app's data) still count.
  const parsed = parseSettings(fm, store.sources);
  const value: Settings = config.readOnly
    ? { ...parsed, sources: { ...parsed.sources, ...store.sources }, savedIn: 'app', noteExists: !!st }
    : { ...parsed, savedIn: 'vault', noteExists: !!st };
  memo.entry = { key, value };
  return value;
}

const NOTE_BODY = `
# Mind Isle settings

Every permission you've given Mind Isle, in one place. Edit this note or use Settings in the app; both work.

- **sources**: which agent apps Mind Isle may read sessions from (Orca, Claude Code, Codex). It only reads metadata: folders, times, file names and the agent's own titles. Never your prompts or code.
- **hooks**: live hooks you agreed to install. To remove them, use Settings → Agents in the app (editing this line doesn't uninstall them).
- **summaries**: what happens when a session ends. \`ask\` waits for your yes, \`auto\` writes a summary note, \`off\` never reads the transcript. \`cli\` is the agent CLI that writes summaries on this computer (\`model\` picks its model; empty uses the CLI's default); \`sessions_dir\` is the folder for session notes; \`since\` is when you turned summaries on (sessions that ended before then are left alone); \`warn_days\` is when Atlas warns that a waiting session's transcript will soon be deleted by Claude Code (after 30 days). A project note can override the mode with its own \`summaries:\` line.
- **worldview**: whether Mind Isle may look for your values, faith and civic views. \`scan\` is what it may read (\`all\`, \`folders\` listed in \`folders\`, \`sessions\` for session notes only, \`interview\` to read nothing and ask you instead, \`off\`, or \`revoked\` after you used Forget). \`interview: true\` asks one question a day at Dusk. What it finds is only ever a proposal, kept in \`Mind Isle/Worldview/\`, never shown on the public Hall and never sent to an AI.
- **personality** and **avatar**: what your character looks like. Only what you enter yourself (MBTI, Enneagram 1–9, or your top two Big Five traits as letters O, C, E, A, N); nothing is guessed from your notes. \`avatar\` holds hair, skin tone (1–6) and outfit colour.
- **redaction**: before a transcript is summarised, keys, passwords, tokens, \`.env\` values, emails and phone numbers are removed on this computer. Set \`keep_contacts: true\` to keep emails and phone numbers. Add your own words or regular expressions to \`redact_patterns\` (for example a client's name) and they're removed too.
`;

const initialNote = (s: Omit<Settings, 'savedIn' | 'noteExists'>) => [
  '---',
  'type: palace-settings',
  `sources: { ${SOURCES.map((x) => `${x}: ${s.sources[x]}`).join(', ')} }`,
  `hooks: { ${SOURCES.map((x) => `${x}: ${s.hooks[x]}`).join(', ')} }`,
  `summaries: { default: ${s.summaries.default}, cli: ${s.summaries.cli}, sessions_dir: ${JSON.stringify(s.summaries.sessionsDir)}, since: ${s.summaries.since ? JSON.stringify(s.summaries.since) : 'null'}, model: ${s.summaries.model ? JSON.stringify(s.summaries.model) : 'null'}, warn_days: ${s.summaries.warnDays} }`,
  `worldview: { scan: ${s.worldview.scan ?? 'null'}, folders: [${s.worldview.folders.map((f) => JSON.stringify(f)).join(', ')}], interview: ${s.worldview.interview} }`,
  `redaction: { keep_contacts: ${s.redaction.keepContacts} }`,
  `personality: { mbti: ${s.personality.mbti ?? 'null'}, enneagram: ${s.personality.enneagram ?? 'null'}, big5: [${s.personality.big5.join(', ')}] }`,
  `avatar: { hair: ${s.look.hair}, skin: ${s.look.skin}, color: ${s.look.color ?? 'null'} }`,
  'redact_patterns: []',
  `consents_updated: ${today()}`,
  '---',
  NOTE_BODY,
].join('\n');

export interface SettingsPatch {
  sources?: Partial<Record<SourceId, boolean>>;
  hooks?: Partial<Record<SourceId, boolean>>;
  summaries?: Partial<Settings['summaries']>;
  worldview?: Partial<Settings['worldview']>;
  personality?: Personality;
  look?: Look;
}

/** Change settings. Writes the vault note (creating it on first use), or the app's data in read-only mode. */
export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  if (config.readOnly) {
    // Only source consents are needed while read-only; everything else waits until the vault can be written.
    if (patch.sources) await updateSessionStore((st) => { Object.assign(st.sources, patch.sources); });
    return readSettings();
  }
  const current = await readSettings();
  const next = {
    sources: { ...current.sources, ...patch.sources },
    hooks: { ...current.hooks, ...patch.hooks },
    summaries: { ...current.summaries, ...patch.summaries },
    worldview: { ...current.worldview, ...patch.worldview },
    personality: patch.personality ?? current.personality,
    look: patch.look ?? current.look,
  };
  await updateNote(SETTINGS_NOTE, (raw) => {
    let out = raw;
    if (patch.sources) out = setFrontmatterMap(out, 'sources', next.sources);
    if (patch.hooks) out = setFrontmatterMap(out, 'hooks', next.hooks);
    if (patch.summaries) {
      out = setFrontmatterMap(out, 'summaries', {
        default: next.summaries.default, cli: next.summaries.cli, sessions_dir: next.summaries.sessionsDir,
        since: next.summaries.since, model: next.summaries.model, warn_days: next.summaries.warnDays,
      });
    }
    if (patch.worldview) out = setFrontmatterMap(out, 'worldview', { scan: next.worldview.scan, folders: next.worldview.folders, interview: next.worldview.interview });
    if (patch.personality) out = setFrontmatterMap(out, 'personality', { mbti: next.personality.mbti, enneagram: next.personality.enneagram, big5: next.personality.big5 });
    if (patch.look) out = setFrontmatterMap(out, 'avatar', { hair: next.look.hair, skin: next.look.skin, color: next.look.color });
    return setFrontmatter(out, { consents_updated: today() });
  }, initialNote({ ...current, ...next, consentsUpdated: today() }));
  memo.entry = null;
  return readSettings();
}

/** The model to pass to the CLI: the setting, or a small fast default. */
export const summaryModel = (s: Settings['summaries']) => s.model ?? DEFAULT_MODEL[s.cli];
