import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { hookFile, hooksInstalled, installHooks, MARKER, uninstallHooks } from '@/lib/sessions/hooks';
import { listClaudeSessions, listCodexSessions, parseClaudeTail, parseCodexTail, readClaudeRegistry, readHookEvents } from '@/lib/sessions/logs';
import { discoverRoots } from '@/lib/sessions/roots';
import type { Root } from '@/lib/sessions/types';
import { makeAgentFixtures, SECRET, writeRegistry } from '../fixtures/agents';

let fx: ReturnType<typeof makeAgentFixtures>;
let claudeRoot: Root;
let codexRoot: Root;

beforeAll(() => {
  fx = makeAgentFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'palace-agents-')));
  Object.assign(process.env, fx.env);
  const roots = discoverRoots();
  claudeRoot = roots['claude-code'][0];
  codexRoot = roots.codex[0];
});

describe('discovery', () => {
  it('finds every installed source and Orca profiles', () => {
    const roots = discoverRoots();
    expect(roots['claude-code']).toHaveLength(1);
    expect(roots.codex).toHaveLength(1);
    expect(roots.orca.map((r) => r.agent).sort()).toEqual(['claude', 'codex']);
  });
});

describe('reading logs keeps metadata only', () => {
  it('lists Claude Code sessions with folder, branch and the agent’s own title', async () => {
    const all = await listClaudeSessions(claudeRoot, 0);
    expect(all).toHaveLength(5);
    const s = all.find((x) => x.id === 'lh-1')!;
    expect(s).toMatchObject({ cwd: fx.cwd.lighthouse, branch: 'main', title: 'Fix the onboarding bug', agent: 'claude', source: 'claude-code' });
    expect(JSON.stringify(all)).not.toContain(SECRET);
    expect(await parseClaudeTail(s.file)).toEqual({ tool: 'Edit', title: 'Fix the onboarding bug', branch: 'feat/x' });
  });

  it('lists Codex sessions with remote and live phase', async () => {
    const [s] = await listCodexSessions(codexRoot, 0);
    expect(s).toMatchObject({ id: 'cx-1', cwd: fx.cwd.solar, remote: 'git@github.com:acme/solar-dashboard.git' });
    const tail = await parseCodexTail(s.file);
    expect(tail.phase).toBe('working');
    expect(tail.tool).toBe('shell');
    expect(JSON.stringify([s, tail])).not.toContain(SECRET);
  });

  it('skips sessions older than the window', async () => {
    expect(await listClaudeSessions(claudeRoot, Date.now() + 60_000)).toEqual([]);
  });

  it('reads the running-session registry and checks the process is alive', async () => {
    writeRegistry(fx.claude, [
      { pid: process.pid, sessionId: 'lh-1', cwd: fx.cwd.lighthouse, status: 'busy' },
      { pid: 2_147_483_000, sessionId: 'nw-1', cwd: fx.cwd.northwind, status: 'idle' },
    ]);
    const reg = await readClaudeRegistry(claudeRoot);
    expect(reg.find((r) => r.sessionId === 'lh-1')).toMatchObject({ alive: true, status: 'busy' });
    expect(reg.find((r) => r.sessionId === 'nw-1')?.alive).toBe(false);
  });
});

describe('the hook script', () => {
  const run = (input: string, agent = 'claude') => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'palace-events-'));
    const r = spawnSync('node', ['scripts/palace-hook.mjs', MARKER, agent, out], { input, encoding: 'utf8', timeout: 5000 });
    const file = path.join(out, `events-${agent}.jsonl`);
    return { r, lines: fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [], out };
  };

  it('records metadata only, prints nothing and exits 0', () => {
    const { r, lines } = run(JSON.stringify({
      session_id: 'lh-1', cwd: fx.cwd.lighthouse, hook_event_name: 'PreToolUse', tool_name: 'Edit',
      tool_input: { file_path: path.join(fx.cwd.lighthouse, 'src/app.ts'), new_string: SECRET }, prompt: SECRET, transcript_path: '/x',
    }));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0]).sort()).toEqual(['agent', 'cwd', 'detail', 'event', 'session', 'tool', 'ts']);
    expect(lines[0]).toMatchObject({ session: 'lh-1', event: 'PreToolUse', tool: 'Edit', detail: path.join('src', 'app.ts') });
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });

  it('labels shell commands without recording them, and classifies permission notifications', () => {
    expect(run(JSON.stringify({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `curl -H ${SECRET}` } })).lines[0].detail).toBe('shell command');
    expect(run(JSON.stringify({ session_id: 's', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' })).lines[0].reason).toBe('permission');
  });

  it('never fails the agent on bad input', () => {
    for (const bad of ['', 'not json', '{"hook_event_name":"Stop"}']) {
      const { r, lines } = run(bad);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
      expect(lines).toEqual([]);
    }
  });

  it('writes events the app can read back', async () => {
    const { out } = run(JSON.stringify({ session_id: 'cx-1', hook_event_name: 'PermissionRequest', tool_name: 'shell' }), 'codex');
    const events = await readHookEvents(out, 0);
    expect(events).toMatchObject([{ session: 'cx-1', event: 'PermissionRequest', agent: 'codex' }]);
  });
});

describe('installing hooks', () => {
  const read = (root: Root) => JSON.parse(fs.readFileSync(hookFile(root), 'utf8'));

  it('adds ours next to existing hooks, once, and backs up the original', async () => {
    const before = fs.readFileSync(hookFile(claudeRoot), 'utf8');
    await installHooks(claudeRoot);
    await installHooks(claudeRoot); // idempotent
    const s = read(claudeRoot);
    expect(s.theme).toBe('dark');
    expect(s.hooks.Stop).toHaveLength(2);
    expect(s.hooks.Stop[0].hooks[0].command).toBe('other-tool notify');
    expect(s.hooks.PermissionRequest).toHaveLength(1);
    expect(s.hooks.PermissionRequest[0].hooks[0].command).toContain(MARKER);
    expect(fs.readFileSync(`${hookFile(claudeRoot)}.mind-palace-bak`, 'utf8')).toBe(before);
    expect(await hooksInstalled(claudeRoot)).toBe(true);
  });

  it('removes only ours', async () => {
    await uninstallHooks(claudeRoot);
    const s = read(claudeRoot);
    expect(s.hooks).toEqual({ Stop: [{ hooks: [{ type: 'command', command: 'other-tool notify' }] }] });
    expect(await hooksInstalled(claudeRoot)).toBe(false);
  });

  it('creates Codex hooks.json when missing', async () => {
    await installHooks(codexRoot);
    expect(Object.keys(read(codexRoot).hooks)).toContain('PermissionRequest');
    await uninstallHooks(codexRoot);
    expect(read(codexRoot).hooks).toEqual({});
  });

  it('refuses to touch a settings file that is not valid JSON', async () => {
    const root = { ...claudeRoot, dir: fs.mkdtempSync(path.join(os.tmpdir(), 'palace-bad-')) };
    fs.writeFileSync(hookFile(root), '{ "hooks": ');
    await expect(installHooks(root)).rejects.toThrow(/not valid JSON/);
    expect(fs.readFileSync(hookFile(root), 'utf8')).toBe('{ "hooks": ');
  });
});
