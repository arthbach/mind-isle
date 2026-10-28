import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '@/lib/config';
import { invalidateSessions } from '@/lib/sessions';
import { placeFolder, setSourceEnabled } from '@/lib/sessions/manage';
import { sessionHistory, syncRecords } from '@/lib/sessions/records';
import { updateSettings } from '@/lib/settings';
import { alwaysSave, approve, pendingSessions, readJob, retentionWarning, retry, skip, summaryViews, tick } from '@/lib/summaries';
import { extractJson, validate } from '@/lib/summaries/summarise';
import { splitFrontmatter } from '@/lib/vault/markdown';
import { getWorld } from '@/lib/world';
import { makeAgentFixtures, SECRET } from '../fixtures/agents';
import { read, write } from './helpers';

let fx: ReturnType<typeof makeAgentFixtures>;
let capture: string;
const LIGHTHOUSE = '03 Projects/Lighthouse App/Lighthouse App.md';
const line = (o: unknown) => `${JSON.stringify(o)}\n`;
const iso = (t: number) => new Date(t).toISOString();
const H = 3_600_000;

/** A finished Claude Code session in a folder, with secrets in it. */
function endedSession(cwd: string, id: string, hoursAgo: number) {
  const dir = path.join(fx.claude, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const t = Date.now() - hoursAgo * H;
  fs.writeFileSync(path.join(dir, `${id}.jsonl`),
    line({ type: 'user', sessionId: id, cwd, gitBranch: 'main', timestamp: iso(t - 8 * 60_000), message: { role: 'user', content: `Fix onboarding. My .env is:\nSTRIPE_KEY=whsec_live_abc123\nand the key ${SECRET}` } })
    + line({ type: 'ai-title', sessionId: id, aiTitle: 'Onboarding fix' })
    + line({ type: 'assistant', sessionId: id, cwd, timestamp: iso(t), message: { content: [{ type: 'text', text: 'Fixed it.' }, { type: 'tool_use', name: 'Edit', input: { file_path: path.join(cwd, 'src/onboarding.ts') } }] } }));
}

const status = async (id: string) => (await summaryViews(await sessionHistory(7))).find((v) => v.id === id)?.status;
const notesIn = (dir: string) => { const d = path.join(process.env.VAULT_PATH!, dir); return fs.existsSync(d) ? fs.readdirSync(d) : []; };

beforeAll(async () => {
  fx = makeAgentFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'palace-summaries-')));
  Object.assign(process.env, fx.env);
  capture = path.join(fx.home, 'prompts.txt');
  process.env.PALACE_SUMMARISER_CMD = JSON.stringify([process.execPath, path.resolve('tests/fixtures/fake-summariser.mjs')]);
  process.env.FAKE_CAPTURE = capture;
  endedSession(fx.cwd.lighthouse, 'old-1', 30); // ended before summaries are turned on
  endedSession(fx.cwd.lighthouse, 'done-1', 5);
  endedSession(fx.cwd.scratch, 'scratch-1', 5);
  await setSourceEnabled('claude-code', true);
  await syncRecords();
  // Summaries "turned on" 20 hours ago.
  await updateSettings({ summaries: { since: iso(Date.now() - 20 * H) } });
});

describe('checking the summariser’s answer', () => {
  it('accepts the fixed shape, cleans it, and rejects anything else', () => {
    expect(validate({ title: ' A title. ', summary: 'x', decisions: [], todos: ['  do it '], files_touched: [], people_mentioned: [] }))
      .toMatchObject({ title: 'A title', todos: ['do it'] });
    expect(validate({ title: 'x', summary: 'y' })).toBeNull();
    expect(validate({ title: 42, summary: 'y', decisions: [], todos: [], files_touched: [], people_mentioned: [] })).toBeNull();
  });
  it('finds the JSON in a fenced answer or a Claude envelope, and surfaces CLI errors', () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```', 'codex')).toEqual({ a: 1 });
    expect(extractJson(JSON.stringify({ structured_output: { a: 2 } }), 'claude')).toEqual({ a: 2 });
    expect(() => extractJson(JSON.stringify({ is_error: true, result: 'Credit balance too low' }), 'claude')).toThrow(/Credit balance/);
  });
});

describe('summaries', () => {
  it('leaves running sessions and those that ended before summaries were on alone', async () => {
    expect(await status('lh-1')).toBe('live');
    expect(await status('old-1')).toBe('before');
    expect(await status('done-1')).toBe('pending'); // default mode is ask
  });

  it('asks before writing anything', async () => {
    await tick(true);
    expect(notesIn('Sessions')).toEqual([]);
    expect(fs.existsSync(capture)).toBe(false); // the CLI was never called
  });

  it('on a yes, writes the note from a redacted transcript and links it into the island', async () => {
    await approve('done-1');
    await tick(true);
    const job = (await readJob('done-1'))!;
    expect(job).toMatchObject({ status: 'done', attempts: 1 });
    const prompt = fs.readFileSync(capture, 'utf8');
    expect(prompt).not.toContain(SECRET);
    expect(prompt).not.toContain('whsec_live_abc123');
    expect(prompt).toContain('STRIPE_KEY=[redacted: env value]');

    const raw = read(job.note!);
    expect(job.note).toMatch(/^Sessions\/\d{4}-\d{2}-\d{2} Lighthouse App Fix the onboarding bug\.md$/);
    expect(splitFrontmatter(raw).fm).toMatchObject({ type: 'session', session_id: 'done-1', project: '[[Lighthouse App]]', cwd: '~/code/lighthouse-app', duration_min: 8 });
    expect(raw).toContain('- [ ] Ask Maya Chen to test on Android');
    expect(raw).toContain('- [[Maya Chen]]\n- Someone Unknown');
    expect(raw).toContain('- `src/onboarding.ts`');

    const w = await getWorld();
    expect(w.quests.some((q) => q.text === 'Ask Maya Chen to test on Android')).toBe(true);
    expect(w.decisions.some((d) => d.title === 'Keep onboarding to three steps')).toBe(true);
    expect(splitFrontmatter(read(LIGHTHOUSE)).fm.last_activity).toBe(new Date(Date.now() - 5 * H).toISOString().slice(0, 10));
  });

  it('records a failure when the answer has the wrong shape twice, and retries on request', async () => {
    endedSession(fx.cwd.lighthouse, 'bad-1', 4);
    await syncRecords();
    process.env.FAKE_MODE = 'bad';
    await approve('bad-1');
    await tick(true);
    expect(await readJob('bad-1')).toMatchObject({ status: 'failed', attempts: 1, error: expect.stringMatching(/expected shape, twice/) });
    expect(notesIn('Sessions')).toHaveLength(1); // nothing half-written
    process.env.FAKE_MODE = 'ok';
    await retry('bad-1');
    await tick(true);
    expect(await readJob('bad-1')).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('never summarises a folder marked “not a project”', async () => {
    await placeFolder(fx.cwd.scratch, { kind: 'none' });
    invalidateSessions();
    expect(await status('scratch-1')).toBe('ignored');
    await expect(approve('scratch-1')).rejects.toThrow();
  });

  it('follows the project note: off never reads, auto needs no yes', async () => {
    endedSession(fx.cwd.lighthouse, 'auto-1', 3);
    await syncRecords();
    write(LIGHTHOUSE, read(LIGHTHOUSE).replace('status: active', 'status: active\nsummaries: off'));
    invalidateSessions();
    expect(await status('auto-1')).toBe('off');
    write(LIGHTHOUSE, read(LIGHTHOUSE).replace('summaries: off', 'summaries: auto'));
    invalidateSessions();
    await tick(true);
    expect(await readJob('auto-1')).toMatchObject({ status: 'done' });
  });

  it('lets the user skip, and says when a transcript is gone', async () => {
    write(LIGHTHOUSE, read(LIGHTHOUSE).replace('summaries: auto', 'summaries: ask'));
    invalidateSessions();
    endedSession(fx.cwd.lighthouse, 'skip-1', 3);
    endedSession(fx.cwd.lighthouse, 'gone-1', 3);
    await syncRecords();
    await skip('skip-1');
    expect(await status('skip-1')).toBe('skipped');
    fs.rmSync(path.join(fx.claude, 'projects', fx.cwd.lighthouse.replace(/[^a-zA-Z0-9]/g, '-'), 'gone-1.jsonl'));
    expect(await status('gone-1')).toBe('unsummarisable');
  });

  it('writes nothing in read-only mode', async () => {
    endedSession(fx.cwd.lighthouse, 'ro-1', 3);
    await syncRecords();
    (config as { readOnly: boolean }).readOnly = true;
    try { await expect(approve('ro-1')).rejects.toThrow(/read-only/); } finally { (config as { readOnly: boolean }).readOnly = false; }
  });

  // Acceptance (roadmap §3.1): off never reads; pending never expires; Save all; Always save; retention warning.
  it('with summaries off for a project, never even opens the transcript', async () => {
    write(LIGHTHOUSE, read(LIGHTHOUSE).replace('summaries: ask', 'summaries: off'));
    invalidateSessions();
    endedSession(fx.cwd.lighthouse, 'off-1', 3);
    await syncRecords();
    const before = fs.readFileSync(capture, 'utf8');
    await tick(true);
    expect(await status('off-1')).toBe('off');
    expect(fs.readFileSync(capture, 'utf8')).toBe(before); // the summariser saw nothing
    write(LIGHTHOUSE, read(LIGHTHOUSE).replace('summaries: off', 'summaries: ask'));
    invalidateSessions();
  });

  it('keeps waiting sessions waiting, however old, and warns before their transcripts go', async () => {
    endedSession(fx.cwd.lighthouse, 'old-wait', 27 * 24); // ended 27 days ago
    await syncRecords();
    await updateSettings({ summaries: { since: iso(Date.now() - 28 * 24 * H) } });
    expect((await pendingSessions()).map((v) => v.id)).toContain('old-wait');
    expect(await retentionWarning()).toEqual({ count: 1, daysLeft: 3, ids: ['old-wait'] });
  });

  it('“Save all” writes one note per waiting session', async () => {
    const waiting = (await pendingSessions()).map((v) => v.id);
    expect(waiting.length).toBeGreaterThan(1);
    const notes = notesIn('Sessions').length;
    await approve(waiting);
    await tick(true);
    for (const id of waiting) expect((await readJob(id))?.status).toBe('done');
    expect(notesIn('Sessions')).toHaveLength(notes + waiting.length);
    expect(await pendingSessions()).toEqual([]);
    expect(await retentionWarning()).toBeNull();
  });

  it('“Always save” switches the project to auto and saves what was waiting', async () => {
    endedSession(fx.cwd.lighthouse, 'always-1', 3);
    await syncRecords();
    expect(await status('always-1')).toBe('pending');
    await alwaysSave(LIGHTHOUSE);
    expect(splitFrontmatter(read(LIGHTHOUSE)).fm.summaries).toBe('auto');
    await tick(true);
    expect(await readJob('always-1')).toMatchObject({ status: 'done' });
  });
});
