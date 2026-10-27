// Fake Claude Code / Codex / Orca installs for tests. Never touches real agent folders.
import fs from 'node:fs';
import path from 'node:path';

const line = (o: unknown) => `${JSON.stringify(o)}\n`;
const iso = (t: number) => new Date(t).toISOString();

export const SECRET = 'sk-test-SECRET-do-not-store';

export function makeAgentFixtures(base: string) {
  const home = path.join(base, 'home');
  const claude = path.join(home, '.claude');
  const codex = path.join(home, '.codex');
  const orca = path.join(base, 'orca');
  const cwd = {
    lighthouse: path.join(home, 'code', 'lighthouse-app'),
    northwind: path.join(home, 'code', 'northwind-routing'),
    scratch: path.join(home, 'code', 'scratch'),
    solar: path.join(home, 'code', 'solar-dash'),
  };
  for (const d of Object.values(cwd)) fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(cwd.solar, '.git'), { recursive: true });
  fs.writeFileSync(path.join(cwd.solar, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:acme/solar-dashboard.git\n');

  const now = Date.now();
  const transcript = (dir: string, id: string, title: string) => {
    const folder = path.join(claude, 'projects', dir.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `${id}.jsonl`),
      line({ type: 'permission-mode', permissionMode: 'default', sessionId: id })
      + line({ type: 'user', sessionId: id, cwd: dir, gitBranch: 'main', timestamp: iso(now - 600_000), message: { role: 'user', content: `please use ${SECRET}` } })
      + line({ type: 'ai-title', sessionId: id, aiTitle: title })
      + line({ type: 'assistant', sessionId: id, cwd: dir, gitBranch: 'feat/x', timestamp: iso(now - 60_000), message: { content: [{ type: 'text', text: SECRET }, { type: 'tool_use', name: 'Edit', input: { file_path: path.join(dir, 'src/app.ts'), new_string: SECRET } }] } }));
  };
  transcript(cwd.lighthouse, 'lh-1', 'Fix the onboarding bug');
  transcript(cwd.lighthouse, 'lh-2', 'Write the pricing copy');
  transcript(cwd.lighthouse, 'lh-3', 'Refactor auth');
  transcript(cwd.northwind, 'nw-1', 'Route solver spike');
  transcript(cwd.scratch, 'sc-1', 'Try a regex');

  const [y, m, d] = iso(now).slice(0, 10).split('-');
  const rollouts = path.join(codex, 'sessions', y, m, d);
  fs.mkdirSync(rollouts, { recursive: true });
  fs.writeFileSync(path.join(rollouts, `rollout-${iso(now).slice(0, 10)}-cx-1.jsonl`),
    line({ timestamp: iso(now - 300_000), type: 'session_meta', payload: { id: 'cx-1', cwd: cwd.solar, git: { branch: 'main', repository_url: 'git@github.com:acme/solar-dashboard.git' }, base_instructions: 'x'.repeat(5000) } })
    + line({ timestamp: iso(now - 200_000), type: 'event_msg', payload: { type: 'task_started' } })
    + line({ timestamp: iso(now - 100_000), type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: `{"cmd":"echo ${SECRET}"}` } }));

  // Someone else's hook (Orca installs its own) that must survive our install/uninstall.
  fs.writeFileSync(path.join(claude, 'settings.json'), JSON.stringify({ theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other-tool notify' }] }] } }, null, 2));

  fs.mkdirSync(path.join(orca, 'claude-profiles', 'profile1', 'home', 'projects'), { recursive: true });
  fs.mkdirSync(path.join(orca, 'codex-runtime-home', 'home', 'sessions'), { recursive: true });

  const env = { PALACE_HOME_DIR: home, PALACE_CLAUDE_DIR: claude, PALACE_CODEX_DIR: codex, PALACE_ORCA_DIR: orca };
  return { home, claude, codex, orca, cwd, env };
}

/** Claude Code's running-session registry. Use a live pid (e.g. process.pid) to make a session "running". */
export function writeRegistry(claudeDir: string, entries: { pid: number; sessionId: string; cwd: string; status: string }[]) {
  const dir = path.join(claudeDir, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  for (const e of entries) {
    fs.writeFileSync(path.join(dir, `${e.sessionId}.json`), JSON.stringify({ ...e, kind: 'interactive', statusUpdatedAt: Date.now(), updatedAt: Date.now(), name: null }));
  }
}
