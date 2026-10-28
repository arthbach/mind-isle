import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '@/lib/config';
import { invalidateSessions, scanFolders } from '@/lib/sessions';
import { setSourceEnabled, setSourceHooks } from '@/lib/sessions/manage';
import { updateSessionStore } from '@/lib/sessions/store';
import { parseSettings, readSettings, SETTINGS_NOTE, updateSettings } from '@/lib/settings';
import { splitFrontmatter } from '@/lib/vault/markdown';
import { setFrontmatterMap } from '@/lib/vault/writer';
import { makeAgentFixtures } from '../fixtures/agents';
import { exists, read, write } from './helpers';

let fx: ReturnType<typeof makeAgentFixtures>;
beforeAll(() => {
  fx = makeAgentFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'palace-settings-')));
  Object.assign(process.env, fx.env);
});

const fm = () => splitFrontmatter(read(SETTINGS_NOTE)).fm;
const folders = async () => { invalidateSessions(); return (await scanFolders()).map((f) => f.cwd).sort(); };

describe('parsing', () => {
  it('falls back to safe defaults for anything missing or invalid', () => {
    expect(parseSettings({ sources: { codex: 'yes', orca: 'maybe' }, summaries: { default: 'always', cli: 'gpt', sessions_dir: '/Notes/' } })).toEqual({
      sources: { orca: false, 'claude-code': false, codex: true },
      hooks: { orca: false, 'claude-code': false, codex: false },
      summaries: { default: 'ask', cli: 'claude', sessionsDir: 'Notes', since: null, model: null, warnDays: 25 },
      worldview: { scan: null, folders: [], interview: false },
      redaction: { keepContacts: false, patterns: [] },
      personality: { mbti: null, enneagram: null, big5: [] },
      look: { hair: 'black', skin: 2, color: null },
      consentsUpdated: null,
    });
  });

  it('writes a map field without touching anything else', () => {
    const raw = '---\ntype: palace-settings\n# keep me\nsources: { orca: true }\nother: [a, b]\n---\nbody';
    expect(setFrontmatterMap(raw, 'sources', { orca: false, codex: true })).toBe('---\ntype: palace-settings\n# keep me\nsources: { orca: false, codex: true }\nother: [a, b]\n---\nbody');
  });
});

describe('the settings note', () => {
  it('starts from choices made before it existed, without writing anything', async () => {
    await updateSessionStore((st) => { st.sources.orca = true; });
    expect(exists(SETTINGS_NOTE)).toBe(false);
    expect(await readSettings()).toMatchObject({ sources: { orca: true, 'claude-code': false, codex: false }, savedIn: 'vault' });
  });

  it('is created on the first change, with every consent and an explanation', async () => {
    await setSourceEnabled('claude-code', true);
    expect(fm()).toMatchObject({
      type: 'palace-settings',
      sources: { orca: true, 'claude-code': true, codex: false },
      summaries: { default: 'ask', cli: 'claude', sessions_dir: 'Sessions', since: null, model: null, warn_days: 25 },
      consents_updated: '2026-10-26',
    });
    expect(read(SETTINGS_NOTE)).toContain('Never your prompts or code.');
    expect(fm()).toMatchObject({ redaction: { keep_contacts: false }, redact_patterns: [], worldview: { scan: null, folders: [], interview: false } });
  });

  it('records hooks the user agreed to, and forgets them when the source is turned off', async () => {
    await setSourceHooks('claude-code', true);
    expect(fm().hooks).toMatchObject({ 'claude-code': true });
    await setSourceEnabled('codex', true);
    await setSourceEnabled('claude-code', false);
    expect(fm()).toMatchObject({ sources: { 'claude-code': false, codex: true }, hooks: { 'claude-code': false } });
  });

  it('follows edits made in Obsidian', async () => {
    expect(await folders()).toEqual([fx.cwd.solar]); // only Codex is on
    write(SETTINGS_NOTE, read(SETTINGS_NOTE).replace(/sources: \{[^}]*\}/, 'sources: { orca: false, claude-code: true, codex: false }'));
    expect((await readSettings()).sources).toEqual({ orca: false, 'claude-code': true, codex: false });
    expect(await folders()).toEqual([fx.cwd.lighthouse, fx.cwd.northwind, fx.cwd.scratch].sort());
  });

  it('keeps the rest of the note as the user wrote it', async () => {
    write(SETTINGS_NOTE, read(SETTINGS_NOTE) + '\nMy own notes about these settings.\n');
    await updateSettings({ summaries: { default: 'auto' } });
    expect(read(SETTINGS_NOTE)).toContain('My own notes about these settings.');
    expect(fm().summaries).toEqual({ default: 'auto', cli: 'claude', sessions_dir: 'Sessions', since: null, model: null, warn_days: 25 });
  });

  it('in read-only mode, keeps choices in the app’s data and never writes the vault', async () => {
    const before = read(SETTINGS_NOTE);
    (config as { readOnly: boolean }).readOnly = true;
    try {
      await setSourceEnabled('codex', true);
      expect(read(SETTINGS_NOTE)).toBe(before);
      expect(await readSettings()).toMatchObject({ sources: { codex: true }, savedIn: 'app' });
    } finally {
      (config as { readOnly: boolean }).readOnly = false;
    }
  });
});
