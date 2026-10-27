import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Root, SourceId } from './types';

// Every location can be overridden (tests point these at fixtures, never at real agent configs).
export const home = () => process.env.PALACE_HOME_DIR || os.homedir();

function appData() {
  if (process.platform === 'darwin') return path.join(home(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || path.join(home(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || path.join(home(), '.config');
}

export const claudeDir = () => process.env.PALACE_CLAUDE_DIR || process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude');
export const codexDir = () => process.env.PALACE_CODEX_DIR || process.env.CODEX_HOME || path.join(home(), '.codex');
export const orcaDir = () => process.env.PALACE_ORCA_DIR || path.join(appData(), 'orca');

const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const list = (p: string) => { try { return fs.readdirSync(p); } catch { return []; } };

export function shortPath(p: string): string {
  const h = home();
  return p === h ? '~' : p.startsWith(h + path.sep) ? `~${p.slice(h.length)}` : p;
}

/** Where each source keeps its sessions on this machine. Detection only reads directory listings. */
export function discoverRoots(): Record<SourceId, Root[]> {
  const out: Record<SourceId, Root[]> = { orca: [], 'claude-code': [], codex: [] };
  const cd = claudeDir();
  if (isDir(path.join(cd, 'projects')) || isDir(path.join(cd, 'sessions'))) {
    out['claude-code'].push({ source: 'claude-code', agent: 'claude', dir: cd, label: shortPath(cd) });
  }
  const xd = codexDir();
  if (isDir(path.join(xd, 'sessions'))) out.codex.push({ source: 'codex', agent: 'codex', dir: xd, label: shortPath(xd) });

  const od = orcaDir();
  for (const profile of list(path.join(od, 'claude-profiles'))) {
    const h = path.join(od, 'claude-profiles', profile, 'home');
    if (isDir(path.join(h, 'projects')) || isDir(path.join(h, 'sessions'))) {
      out.orca.push({ source: 'orca', agent: 'claude', dir: h, label: `Orca · Claude (${profile.slice(0, 8)})` });
    }
  }
  const oc = path.join(od, 'codex-runtime-home', 'home');
  if (isDir(path.join(oc, 'sessions'))) out.orca.push({ source: 'orca', agent: 'codex', dir: oc, label: 'Orca · Codex' });
  return out;
}
