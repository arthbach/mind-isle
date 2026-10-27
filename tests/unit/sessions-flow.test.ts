import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { invalidateSessions, liveSnapshot, scanFolders } from '@/lib/sessions';
import { hookFile } from '@/lib/sessions/hooks';
import { newProjectPath, placeFolder, setSourceEnabled, setSourceHooks } from '@/lib/sessions/manage';
import { discoverRoots } from '@/lib/sessions/roots';
import { eventsDir } from '@/lib/sessions/store';
import { splitFrontmatter } from '@/lib/vault/markdown';
import { makeAgentFixtures, writeRegistry } from '../fixtures/agents';
import { exists, read } from './helpers';

let fx: ReturnType<typeof makeAgentFixtures>;
beforeAll(() => {
  fx = makeAgentFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'palace-flow-')));
  Object.assign(process.env, fx.env);
});

const folder = async (cwd: string) => (await scanFolders()).find((f) => f.cwd === cwd)!;
const repos = (rel: string) => splitFrontmatter(read(rel)).fm.repos;

// One continuous story, in order.
describe('sessions, from consent to the island', () => {
  it('reads nothing until a source is allowed', async () => {
    expect(await scanFolders()).toEqual([]);
    expect((await liveSnapshot()).live).toEqual([]);
  });

  it('maps folders by confidence once Claude Code and Codex are allowed', async () => {
    await setSourceEnabled('claude-code', true);
    await setSourceEnabled('codex', true);
    const folders = await scanFolders();
    expect(folders).toHaveLength(4);
    expect((await folder(fx.cwd.lighthouse)).mapping).toMatchObject({ kind: 'confirmed', project: { name: 'Lighthouse App' } });
    expect((await folder(fx.cwd.solar)).mapping).toMatchObject({ kind: 'auto', reason: 'git remote', project: { name: 'Solar Co-op Dashboard' } });
    expect((await folder(fx.cwd.northwind)).mapping).toMatchObject({ kind: 'ask', project: { name: 'Northwind Routing' } });
    expect((await folder(fx.cwd.scratch)).mapping.kind).toBe('harbor');
    expect((await folder(fx.cwd.lighthouse)).sessions).toBe(3);
    // Unsure folders come first in the review list.
    expect(folders[0].mapping.kind).toBe('ask');
  });

  it('confirming writes the folder into the project note, so the next session maps itself', async () => {
    const rel = '03 Projects/Northwind Routing/Northwind Routing.md';
    await placeFolder(fx.cwd.northwind, { kind: 'project', rel });
    expect(repos(rel)).toEqual(['~/code/northwind-routing']);
    expect((await folder(fx.cwd.northwind)).mapping.kind).toBe('confirmed');
  });

  it('reassigning moves the folder between projects', async () => {
    const from = '03 Projects/Northwind Routing/Northwind Routing.md';
    const to = '03 Projects/Harbor Foods Forecasting/Harbor Foods Forecasting.md';
    await placeFolder(fx.cwd.northwind, { kind: 'project', rel: to });
    expect(repos(from)).toEqual([]);
    expect(repos(to)).toEqual(['~/code/northwind-routing']);
    expect((await folder(fx.cwd.northwind)).mapping.project?.name).toBe('Harbor Foods Forecasting');
  });

  it('undoing an automatic match turns it back into a question', async () => {
    const rel = '03 Projects/Solar Co-op Dashboard/Solar Co-op Dashboard.md';
    await placeFolder(fx.cwd.solar, { kind: 'undo-auto', rel });
    const m = (await folder(fx.cwd.solar)).mapping;
    expect(m.project?.rel).not.toBe(rel);
    expect(m.kind).not.toBe('auto');
  });

  it('can mark a folder as not a project, or create a new project for it', async () => {
    await placeFolder(fx.cwd.scratch, { kind: 'none' });
    expect((await folder(fx.cwd.scratch)).mapping.kind).toBe('ignored');

    await placeFolder(fx.cwd.solar, { kind: 'new', name: 'Solar Field App' });
    const rel = '03 Projects/Solar Field App/Solar Field App.md';
    expect(exists(rel)).toBe(true);
    expect(splitFrontmatter(read(rel)).fm).toMatchObject({ type: 'project', status: 'active', repos: ['~/code/solar-dash'] });
    expect((await folder(fx.cwd.solar)).mapping).toMatchObject({ kind: 'confirmed', project: { name: 'Solar Field App' } });
  });

  it('refuses folders it has never seen', async () => {
    await expect(placeFolder('/etc', { kind: 'none' })).rejects.toThrow(/Unknown folder/);
  });

  it('shows running sessions live: three workers on one project, and who needs you', async () => {
    writeRegistry(fx.claude, ['lh-1', 'lh-2', 'lh-3'].map((id) => ({ pid: process.pid, sessionId: id, cwd: fx.cwd.lighthouse, status: 'busy' })));
    invalidateSessions();
    let snap = await liveSnapshot();
    const lighthouse = snap.live.filter((s) => s.mapping.project?.name === 'Lighthouse App');
    expect(lighthouse).toHaveLength(3);
    expect(lighthouse.every((s) => s.state === 'working')).toBe(true);
    expect(snap.live.find((s) => s.id === 'cx-1')?.state).toBe('working');

    fs.mkdirSync(eventsDir(), { recursive: true });
    fs.appendFileSync(path.join(eventsDir(), 'events-claude.jsonl'), `${JSON.stringify({ ts: Date.now() + 1000, agent: 'claude', session: 'lh-2', event: 'PermissionRequest', tool: 'Bash' })}\n`);
    invalidateSessions();
    snap = await liveSnapshot();
    expect(snap.live[0]).toMatchObject({ id: 'lh-2', state: 'needs_you' });
  });

  it('turning a source off hides its sessions and removes its hooks', async () => {
    await setSourceHooks('claude-code', true);
    const file = hookFile(discoverRoots()['claude-code'][0]);
    expect(fs.readFileSync(file, 'utf8')).toContain('mind-palace-hook');
    await setSourceEnabled('claude-code', false);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('mind-palace-hook');
    expect(fs.readFileSync(file, 'utf8')).toContain('other-tool notify');
    const snap = await liveSnapshot();
    expect(snap.live.every((s) => s.agent === 'codex')).toBe(true);
  });
});

describe('new project notes follow the vault’s layout', () => {
  it('uses one folder per project when the vault does', () => {
    expect(newProjectPath('New App', ['03 Projects/A/A.md', '03 Projects/B/B.md', 'Inbox/x.md'])).toBe('03 Projects/New App/New App.md');
  });
  it('uses flat files when the vault does', () => {
    expect(newProjectPath('New: App?', ['Projects/A.md', 'Projects/B.md'])).toBe('Projects/New App.md');
  });
  it('falls back to Projects/ for an empty vault', () => {
    expect(newProjectPath('X', [])).toBe('Projects/X/X.md');
  });
});
