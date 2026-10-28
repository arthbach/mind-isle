import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setSourceEnabled } from '@/lib/sessions/manage';
import { readRecord, readRecords, recordsDir, scanLog, sessionHistory, syncRecords, unionMs } from '@/lib/sessions/records';
import { makeAgentFixtures, SECRET } from '../fixtures/agents';

let fx: ReturnType<typeof makeAgentFixtures>;
beforeAll(() => {
  fx = makeAgentFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'palace-records-')));
  Object.assign(process.env, fx.env);
});

const line = (o: unknown) => `${JSON.stringify(o)}\n`;
const iso = (t: number) => new Date(t).toISOString();

describe('active time', () => {
  it('counts gaps of up to 10 minutes and skips longer ones, also across reads', async () => {
    const file = path.join(fx.home, 'times.jsonl');
    const at = (min: number) => line({ type: 'user', timestamp: iso(Date.UTC(2026, 9, 26, 9) + min * 60_000) });
    fs.writeFileSync(file, at(0) + at(5) + at(60));
    const first = await scanLog(file, 'claude');
    expect(first.tally.activeMs / 60_000).toBe(5); // the 55-minute break doesn't count
    fs.appendFileSync(file, at(62) + '{"type":"user","timest'); // a half-written line is left for later
    const next = await scanLog(file, 'claude', first.offset, first.tally);
    expect(next.tally.activeMs / 60_000).toBe(7);
    expect(next.offset).toBe(fs.statSync(file).size - '{"type":"user","timest'.length);
  });
});

describe('reading a whole log keeps metadata only', () => {
  it('takes file paths from Codex patches, never their contents', async () => {
    const file = path.join(fx.home, 'patch.jsonl');
    const now = Date.now();
    fs.writeFileSync(file,
      line({ timestamp: iso(now - 120_000), type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: `*** Begin Patch\n*** Update File: src/solver.ts\n+const key = "${SECRET}"\n*** Add File: docs/notes.md\n*** End Patch` } })
      + line({ timestamp: iso(now - 60_000), type: 'event_msg', payload: { type: 'patch_apply_begin', changes: { '/abs/lib/x.ts': { add: { content: SECRET } } } } }));
    const { tally: log } = await scanLog(file, 'codex');
    expect(log.files.sort()).toEqual(['/abs/lib/x.ts', 'docs/notes.md', 'src/solver.ts']);
    expect(log.toolCalls).toBe(1);
    expect(JSON.stringify(log)).not.toContain(SECRET);
  });
});

describe('session records', () => {
  it('records nothing until a source is allowed', async () => {
    expect(await syncRecords()).toBe(0);
    expect(fs.existsSync(recordsDir())).toBe(false);
  });

  it('records every session from an allowed source, with no prompt or code in it', async () => {
    await setSourceEnabled('claude-code', true);
    expect(await syncRecords()).toBe(5);
    const r = (await readRecord('lh-1'))!;
    expect(r).toMatchObject({ agent: 'claude', source: 'claude-code', cwd: fx.cwd.lighthouse, title: 'Fix the onboarding bug', branch: 'feat/x', files: ['src/app.ts'], toolCalls: 1, activeMin: 9 });
    for (const n of fs.readdirSync(recordsDir())) expect(fs.readFileSync(path.join(recordsDir(), n), 'utf8')).not.toContain(SECRET);
  });

  it('skips logs that haven’t changed, and re-reads one that has', async () => {
    expect(await syncRecords()).toBe(0);
    const log = (await readRecord('lh-2'))!.transcript;
    fs.appendFileSync(log, line({ type: 'assistant', sessionId: 'lh-2', timestamp: iso(Date.now()), message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: path.join(fx.cwd.lighthouse, 'README.md') } }] } }));
    expect(await syncRecords()).toBe(1);
    expect((await readRecord('lh-2'))!.files).toEqual(['src/app.ts', 'README.md']);
  });

  it('backfills a source allowed later', async () => {
    await setSourceEnabled('codex', true);
    expect(await syncRecords()).toBe(1);
    expect(await readRecord('cx-1')).toMatchObject({ agent: 'codex', cwd: fx.cwd.solar, toolCalls: 1, activeMin: 3 });
  });

  it('keeps the record after the agent deletes its log', async () => {
    fs.rmSync((await readRecord('sc-1'))!.transcript);
    await syncRecords();
    expect(await readRecord('sc-1')).not.toBeNull();
    expect(await readRecords()).toHaveLength(6);
  });

  it('shows history with each folder’s current project', async () => {
    const h = await sessionHistory(7);
    expect(h).toHaveLength(6);
    expect(h.find((x) => x.id === 'lh-1')!.project?.name).toBe('Lighthouse App');
    expect(h.find((x) => x.id === 'sc-1')!.project).toBeNull(); // scratch isn't placed
    expect(JSON.stringify(h)).not.toContain('transcript');
  });
});

describe('what counts as activity', () => {
  it('only conversation turns, not bookkeeping lines written when a session is reopened', async () => {
    const file = path.join(fx.home, 'reopened.jsonl');
    const t0 = Date.UTC(2026, 9, 26, 9);
    fs.writeFileSync(file,
      line({ type: 'user', timestamp: iso(t0) }) + line({ type: 'assistant', timestamp: iso(t0 + 5 * 60_000) })
      + line({ type: 'pr-link', timestamp: iso(t0 + 9 * 60_000) }) + line({ type: 'system', timestamp: iso(t0 + 3 * 3_600_000) }));
    const { tally } = await scanLog(file, 'claude');
    expect(tally.last).toBe(t0 + 5 * 60_000);
    expect(tally.activeMs).toBe(5 * 60_000);
  });
});

describe('reader upgrades', () => {
  it('re-reads every record written by an older reader, not just recent ones', async () => {
    const dir = recordsDir();
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      const r = JSON.parse(fs.readFileSync(f, 'utf8'));
      fs.writeFileSync(f, JSON.stringify({ ...r, v: 1, lastEventAt: r.lastEventAt - 40 * 86_400_000 }));
    }
    const live = (await readRecords()).filter((r) => fs.existsSync(r.transcript)).length;
    expect(await syncRecords()).toBe(live);
    expect((await readRecords()).filter((r) => fs.existsSync(r.transcript)).every((r) => (r.v ?? 0) > 1)).toBe(true);
  });
});

describe('overlapping sessions', () => {
  it('counts time once when sessions run in parallel', () => {
    const h = 3_600_000;
    expect(unionMs([[0, 2 * h], [h, 3 * h], [5 * h, 6 * h]])).toBe(4 * h);
    expect(unionMs([[0, 2 * h], [0, 2 * h]])).toBe(2 * h);
    expect(unionMs([[0, 4 * h]], h, 2 * h)).toBe(h); // clipped to a window
  });

  it('keeps active spans in each record', async () => {
    const file = path.join(fx.home, 'spans.jsonl');
    const t0 = Date.UTC(2026, 9, 26, 9);
    const at = (min: number) => line({ type: 'user', timestamp: iso(t0 + min * 60_000) });
    fs.writeFileSync(file, at(0) + at(5) + at(60) + at(62));
    expect((await scanLog(file, 'claude')).tally.spans).toEqual([[t0, t0 + 5 * 60_000], [t0 + 60 * 60_000, t0 + 62 * 60_000]]);
  });
});
