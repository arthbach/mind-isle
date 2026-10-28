import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '@/lib/config';
import { setSourceEnabled } from '@/lib/sessions/manage';
import { syncRecords } from '@/lib/sessions/records';
import { readSettings, updateSettings } from '@/lib/settings';
import { approve, tick } from '@/lib/summaries';
import { setBeliefStatus } from '@/lib/checkin';
import { splitFrontmatter } from '@/lib/vault/markdown';
import { loadNotes } from '@/lib/vault/reader';
import {
  answerQuestion, chooseScope, forget, ownerPassages, readScanState, rejectBanner, runScan, setUseInAi, skipQuestion, todaysQuestion, WORLDVIEW_DIR,
} from '@/lib/worldview';
import { getWorld } from '@/lib/world';
import { makeAgentFixtures } from '../fixtures/agents';
import { exists, read, write } from './helpers';

let capture: string;
let fx: ReturnType<typeof makeAgentFixtures>;
const banners = () => (fs.existsSync(path.join(process.env.VAULT_PATH!, WORLDVIEW_DIR)) ? fs.readdirSync(path.join(process.env.VAULT_PATH!, WORLDVIEW_DIR)) : []);
const prompts = () => (fs.existsSync(capture) ? fs.readFileSync(capture, 'utf8') : '');

beforeAll(() => {
  fx = makeAgentFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'palace-worldview-')));
  Object.assign(process.env, fx.env);
  capture = path.join(fx.home, 'prompts.txt');
  process.env.PALACE_SUMMARISER_CMD = JSON.stringify([process.execPath, path.resolve('tests/fixtures/fake-summariser.mjs')]);
  process.env.FAKE_CAPTURE = capture;
  write('Journal/2026-10-20 Reflections.md', '---\ntype: journal\n---\nLong week.\n- I believe honesty matters more than comfort.\n- I value time with family over overtime.\nThe team shipped the release.\n');
  write('Private/Canary.md', '---\ntype: journal\n---\nI believe CANARY-7f3a is the answer.\n');
  write('Journal/Meeting with Omar.md', [
    '---', 'type: meeting', '---',
    'Omar: I believe taxes should be much lower for everyone.',
    '> I believe in small government above all.',
    'Omar said he believes the election was stolen, which I believe is a separate topic.',
    '“I believe the state should run the banks”, he said at lunch.',
    '- I believe we should ship the pilot in November.',
    'I told Omar I think we can wait a week.',
  ].join('\n'));
});

describe('what counts as the owner’s own words', () => {
  it('keeps first-person lines and drops other people’s speech, quotes and reports', async () => {
    const n = (await loadNotes()).find((x) => x.rel === 'Journal/Meeting with Omar.md')!;
    expect(ownerPassages(n)).toEqual(['I believe we should ship the pilot in November.', 'I told Omar I think we can wait a week.']);
  });
});

describe('worldview scan', () => {
  it('reads nothing until the user chooses a scope', async () => {
    await expect(runScan()).rejects.toThrow(/Choose what Mind Isle may read/);
    expect((await readSettings()).worldview.scan).toBeNull();
  });

  // Acceptance (roadmap §4): with "specific folders", no file outside them is read.
  it('reads only the chosen folders: the canary outside them is never seen', async () => {
    await chooseScope('folders', ['Journal']);
    await runScan();
    const state = await readScanState();
    expect(state).toMatchObject({ status: 'done', scope: 'folders' });
    expect(state.notesRead.every((r) => r.startsWith('Journal/'))).toBe(true);
    expect(prompts()).not.toContain('CANARY');
    expect(prompts()).toContain('I believe honesty matters more than comfort');
  });

  it('proposes banners with verbatim evidence, and drops anything the model invented', () => {
    const files = banners();
    expect(files).toContain('I believe honesty matters more than comfort.md');
    expect(files).not.toContain('I love chaos.md');
    const fm = splitFrontmatter(read(`${WORLDVIEW_DIR}/I believe honesty matters more than comfort.md`)).fm;
    expect(fm).toMatchObject({ type: 'belief', domain: 'worldview', status: 'proposed', sensitive: true, source: 'scan', use_in_ai: false });
    expect(fm.evidence).toEqual([{ quote: 'I believe honesty matters more than comf', note: '[[2026-10-20 Reflections]]' }]);
  });

  // Acceptance: another person's political opinion produces no banner.
  it('never turns someone else’s opinion into a banner', () => {
    const all = banners().join('\n');
    for (const theirs of ['taxes', 'small government', 'election', 'banks']) expect(all).not.toContain(theirs);
  });

  it('doesn’t propose the same banner twice', async () => {
    const before = banners().length;
    await runScan();
    expect(banners()).toHaveLength(before);
  });

  // Acceptance: sensitive banners never reach /hall, the island, or any summariser prompt.
  it('keeps banners out of the island, the Hall and every AI prompt', async () => {
    const w = await getWorld();
    expect(w.worldview.length).toBeGreaterThan(0);
    expect(w.beliefs.some((b) => b.path.startsWith(WORLDVIEW_DIR))).toBe(false);
    expect(JSON.stringify(w.achievements)).not.toContain('honesty');

    // A session summary afterwards: its prompt holds the transcript, never a banner.
    const dir = path.join(fx.claude, 'projects', fx.cwd.lighthouse.replace(/[^a-zA-Z0-9]/g, '-'));
    const t = Date.now() - 4 * 3_600_000;
    fs.writeFileSync(path.join(dir, 'wv-1.jsonl'),
      `${JSON.stringify({ type: 'user', sessionId: 'wv-1', cwd: fx.cwd.lighthouse, timestamp: new Date(t - 60_000).toISOString(), message: { role: 'user', content: 'Fix the build' } })}\n`
      + `${JSON.stringify({ type: 'assistant', sessionId: 'wv-1', cwd: fx.cwd.lighthouse, timestamp: new Date(t).toISOString(), message: { content: [{ type: 'text', text: 'Fixed.' }] } })}\n`);
    await setSourceEnabled('claude-code', true);
    await syncRecords();
    await updateSettings({ summaries: { since: new Date(Date.now() - 10 * 3_600_000).toISOString() } });
    fs.writeFileSync(capture, '');
    await approve('wv-1');
    await tick(true);
    expect(prompts()).toContain('Fix the build');
    expect(prompts()).not.toContain('honesty');
    expect(prompts()).not.toContain('family');
  });

  it('lets the user allow one banner as AI context, and reject a proposal outright', async () => {
    const rel = `${WORLDVIEW_DIR}/I value time with family over overtime.md`;
    await setUseInAi(rel, true);
    expect(splitFrontmatter(read(rel)).fm.use_in_ai).toBe(true);
    await rejectBanner(rel);
    expect(exists(rel)).toBe(false);
  });

  it('refuses to scan in read-only mode', async () => {
    (config as { readOnly: boolean }).readOnly = true;
    try { await expect(runScan()).rejects.toThrow(/read-only/); } finally { (config as { readOnly: boolean }).readOnly = false; }
  });
});

describe('interview at Dusk', () => {
  it('asks one question a day; the answer becomes a proposed banner in the user’s own words', async () => {
    expect(await todaysQuestion()).toBeNull(); // interview is off
    await updateSettings({ worldview: { interview: true } });
    const q = (await todaysQuestion())!;
    const rel = await answerQuestion(q.index, 'Telling the truth to clients, even when it costs the deal. Everything else is negotiable.');
    const fm = splitFrontmatter(read(rel)).fm;
    expect(fm).toMatchObject({ statement: 'Telling the truth to clients, even when it costs the deal.', source: 'interview', status: 'proposed', sensitive: true });
    expect(read(rel)).toContain(q.text);
    expect(await todaysQuestion()).toBeNull(); // one a day
    await expect(answerQuestion(q.index, 'again')).rejects.toThrow();
    await skipQuestion(q.index); // harmless once answered
  });
});

describe('Forget', () => {
  it('deletes proposals, asks again for confirmed ones, never touches the user’s own, and records the revocation', async () => {
    write(`${WORLDVIEW_DIR}/My own banner.md`, '---\ntype: belief\ndomain: worldview\nstatement: "I wrote this myself"\nstatus: confirmed\nsensitive: true\n---\n');
    const confirmed = `${WORLDVIEW_DIR}/I believe honesty matters more than comfort.md`;
    await setBeliefStatus(confirmed, 'confirmed');
    await forget(false);
    expect(banners().sort()).toEqual(['I believe honesty matters more than comfort.md', 'My own banner.md']);
    expect((await readSettings()).worldview).toMatchObject({ scan: 'revoked', interview: false });
    await forget(true);
    expect(banners()).toEqual(['My own banner.md']);
    expect(await todaysQuestion()).toBeNull();
  });
});
