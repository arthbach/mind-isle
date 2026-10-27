import fs from 'node:fs';
import path from 'node:path';

const cache = new Map<string, string | null>();

/** The `origin` URL of the git repo containing `cwd`, read from .git/config (handles worktrees). No git binary needed. */
export function gitRemote(cwd: string): string | null {
  if (cache.has(cwd)) return cache.get(cwd) as string | null;
  let result: string | null = null;
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    const dotgit = path.join(dir, '.git');
    let config: string | null = null;
    try {
      const st = fs.statSync(dotgit);
      if (st.isDirectory()) config = path.join(dotgit, 'config');
      else {
        // Worktree / submodule: ".git" is a file pointing at the real git dir.
        const target = fs.readFileSync(dotgit, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
        if (target) {
          const gitdir = path.resolve(dir, target);
          const common = path.join(gitdir, 'commondir');
          const base = fs.existsSync(common) ? path.resolve(gitdir, fs.readFileSync(common, 'utf8').trim()) : gitdir;
          config = path.join(base, 'config');
        }
      }
    } catch { /* no .git here */ }
    if (config) {
      try {
        const text = fs.readFileSync(config, 'utf8');
        const origin = text.match(/\[remote "origin"\][^[]*?url\s*=\s*(.+)/)?.[1] ?? text.match(/\[remote "[^"]+"\][^[]*?url\s*=\s*(.+)/)?.[1];
        result = origin?.trim() ?? null;
      } catch { /* unreadable */ }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cache.set(cwd, result);
  return result;
}
