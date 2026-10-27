// Installs Mind Isle's metadata hook next to whatever hooks are already there (Orca installs its own).
// Only entries carrying MARKER are ever added or removed; everything else in the file is preserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import { eventsDir } from './store';
import type { Root } from './types';

export const MARKER = '--mind-palace-hook';

const EVENTS: Record<Root['agent'], string[]> = {
  claude: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Notification', 'Stop', 'SessionEnd'],
  codex: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop'],
};

/** Claude Code reads hooks from settings.json; Codex from hooks.json. Same schema. */
export const hookFile = (root: Root) => path.join(root.dir, root.agent === 'claude' ? 'settings.json' : 'hooks.json');

const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
export function hookCommand(agent: Root['agent']): string {
  return `node ${q(path.resolve('scripts/palace-hook.mjs'))} ${MARKER} ${agent} ${q(eventsDir())}`;
}

interface HookEntry { type?: string; command?: string; [k: string]: unknown }
interface HookGroup { matcher?: string; hooks?: HookEntry[]; [k: string]: unknown }
type Settings = { hooks?: Record<string, HookGroup[]>; [k: string]: unknown };

const ours = (g: HookGroup) => (g.hooks ?? []).some((h) => typeof h.command === 'string' && h.command.includes(MARKER));

async function readSettings(file: string): Promise<{ data: Settings; raw: string | null }> {
  let raw: string | null = null;
  try { raw = await fs.readFile(file, 'utf8'); } catch { return { data: {}, raw: null }; }
  try {
    const data = raw.trim() ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
    return { data, raw };
  } catch {
    throw new Error(`${path.basename(file)} is not valid JSON, so it was left untouched.`);
  }
}

async function writeSettings(file: string, data: Settings, raw: string | null) {
  // One backup of the original, taken before our first change.
  if (raw !== null) await fs.writeFile(`${file}.mind-palace-bak`, raw, { flag: 'wx' }).catch(() => {});
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await fs.rename(tmp, file);
}

export async function hooksInstalled(root: Root): Promise<boolean> {
  try {
    const { data } = await readSettings(hookFile(root));
    return Object.values(data.hooks ?? {}).some((groups) => Array.isArray(groups) && groups.some(ours));
  } catch {
    return false;
  }
}

export async function installHooks(root: Root): Promise<void> {
  const file = hookFile(root);
  const { data, raw } = await readSettings(file);
  const hooks = (data.hooks && typeof data.hooks === 'object' ? data.hooks : {}) as Record<string, HookGroup[]>;
  const command = hookCommand(root.agent);
  for (const event of EVENTS[root.agent]) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
    const kept = groups.filter((g) => !ours(g)); // replace a stale copy of ours, keep everyone else's
    kept.push({ hooks: [{ type: 'command', command, timeout: 10 }] });
    hooks[event] = kept;
  }
  data.hooks = hooks;
  await writeSettings(file, data, raw);
}

export async function uninstallHooks(root: Root): Promise<void> {
  const file = hookFile(root);
  const { data, raw } = await readSettings(file);
  if (!data.hooks || raw === null) return;
  let changed = false;
  for (const [event, groups] of Object.entries(data.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = groups.filter((g) => !ours(g));
    if (kept.length !== groups.length) {
      changed = true;
      if (kept.length) data.hooks[event] = kept;
      else delete data.hooks[event];
    }
  }
  if (changed) await writeSettings(file, data, raw);
}
