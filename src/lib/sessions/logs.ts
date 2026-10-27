// Reading agent logs. Only metadata is kept: ids, folders, branches, times, titles the agent generated,
// tool names and event types. Prompt text, code and tool output are parsed past and never stored.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { HookEvent, Root, SessionMeta } from './types';

async function readSlice(file: string, from: 'head' | 'tail', bytes: number): Promise<string> {
  const fh = await fs.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const len = Math.min(bytes, size);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, from === 'head' ? 0 : size - len);
    let text = buf.toString('utf8');
    // Drop the partial line at the cut.
    if (from === 'head' && len < size) text = text.slice(0, text.lastIndexOf('\n') + 1);
    if (from === 'tail' && len < size) text = text.slice(text.indexOf('\n') + 1);
    return text;
  } finally {
    await fh.close();
  }
}

function* jsonLines(text: string): Generator<Record<string, unknown>> {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* partial or corrupt line */ }
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const time = (v: unknown) => { const t = typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(t) ? t : null; };

// Parsed results are cached by file + mtime + size, so each log is read once per change.
const cache = new Map<string, { key: string; value: unknown }>();
async function cached<T>(file: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const st = await fs.stat(file);
    const key = `${st.mtimeMs}:${st.size}`;
    const hit = cache.get(file);
    if (hit?.key === key) return hit.value as T;
    const value = await fn();
    cache.set(file, { key, value });
    return value;
  } catch {
    return null;
  }
}

async function filesSince(dir: string, since: number, match: (name: string) => boolean): Promise<{ file: string; mtime: number }[]> {
  const out: { file: string; mtime: number }[] = [];
  let names: string[];
  try { names = await fs.readdir(dir); } catch { return out; }
  await Promise.all(names.filter(match).map(async (n) => {
    const file = path.join(dir, n);
    try {
      const st = await fs.stat(file);
      if (st.isFile() && st.mtimeMs >= since) out.push({ file, mtime: st.mtimeMs });
    } catch { /* vanished */ }
  }));
  return out;
}

// ---------------------------------------------------------------- Claude Code

export async function parseClaudeHead(file: string) {
  const head = await readSlice(file, 'head', 96 * 1024);
  let id: string | null = null, cwd: string | null = null, branch: string | null = null, startedAt: number | null = null, title: string | null = null;
  for (const d of jsonLines(head)) {
    id ??= str(d.sessionId);
    if (!cwd && str(d.cwd)) { cwd = str(d.cwd); branch = str(d.gitBranch); }
    startedAt ??= time(d.timestamp);
    if (d.type === 'ai-title') title = str(d.aiTitle) ?? title;
  }
  return { id: id ?? path.basename(file, '.jsonl'), cwd, branch, startedAt, title };
}

/** Last tool the agent used, and latest title/branch — from the end of the log. */
export async function parseClaudeTail(file: string) {
  const tail = await readSlice(file, 'tail', 64 * 1024);
  let tool: string | null = null, title: string | null = null, branch: string | null = null;
  for (const d of jsonLines(tail)) {
    if (d.type === 'ai-title') title = str(d.aiTitle) ?? title;
    if (str(d.gitBranch)) branch = str(d.gitBranch);
    const content = (d.message as { content?: unknown } | undefined)?.content;
    if (d.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) if (c && typeof c === 'object' && (c as { type?: string }).type === 'tool_use') tool = str((c as { name?: string }).name) ?? tool;
    }
  }
  return { tool, title, branch };
}

export async function listClaudeSessions(root: Root, since: number): Promise<SessionMeta[]> {
  const projects = path.join(root.dir, 'projects');
  let dirs: string[];
  try { dirs = await fs.readdir(projects); } catch { return []; }
  const files = (await Promise.all(dirs.map((d) => filesSince(path.join(projects, d), since, (n) => n.endsWith('.jsonl'))))).flat();
  const metas = await Promise.all(files.map(async ({ file, mtime }) => {
    const h = await cached(file, () => parseClaudeHead(file));
    if (!h?.cwd) return null;
    return { id: h.id, agent: root.agent, source: root.source, rootDir: root.dir, file, cwd: h.cwd, branch: h.branch, remote: null, startedAt: h.startedAt, mtime, title: h.title } satisfies SessionMeta;
  }));
  return metas.filter(Boolean) as SessionMeta[];
}

export interface RegistryEntry { pid: number; sessionId: string; cwd: string; status: string; updatedAt: number | null; alive: boolean; name: string | null }

const alive = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};

/** Claude Code's own list of running sessions (`sessions/<pid>.json`). */
export async function readClaudeRegistry(root: Root): Promise<RegistryEntry[]> {
  const dir = path.join(root.dir, 'sessions');
  let names: string[];
  try { names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')); } catch { return []; }
  const entries = await Promise.all(names.map(async (n) => {
    try {
      const d = JSON.parse(await fs.readFile(path.join(dir, n), 'utf8'));
      if (typeof d.pid !== 'number' || !str(d.sessionId)) return null;
      return {
        pid: d.pid, sessionId: d.sessionId, cwd: str(d.cwd) ?? '', status: str(d.status) ?? 'idle',
        updatedAt: time(d.statusUpdatedAt) ?? time(d.updatedAt), alive: alive(d.pid), name: str(d.name),
      } satisfies RegistryEntry;
    } catch { return null; }
  }));
  return entries.filter(Boolean) as RegistryEntry[];
}

// ---------------------------------------------------------------- Codex

export type CodexPhase = 'working' | 'idle' | 'needs_you';

export async function parseCodexHead(file: string) {
  // The first line (session_meta) can be large: it carries the base instructions.
  const head = await readSlice(file, 'head', 512 * 1024);
  for (const d of jsonLines(head)) {
    if (d.type !== 'session_meta') continue;
    const p = (d.payload ?? {}) as Record<string, unknown>;
    const git = (p.git ?? {}) as Record<string, unknown>;
    return { id: str(p.id), cwd: str(p.cwd), branch: str(git.branch), remote: str(git.repository_url), startedAt: time(p.timestamp) ?? time(d.timestamp) };
  }
  return null;
}

export async function parseCodexTail(file: string) {
  const tail = await readSlice(file, 'tail', 64 * 1024);
  let phase: CodexPhase | null = null, at: number | null = null, tool: string | null = null;
  for (const d of jsonLines(tail)) {
    const p = (d.payload ?? {}) as Record<string, unknown>;
    const t = str(p.type) ?? '';
    const ts = time(d.timestamp);
    if (d.type === 'event_msg') {
      if (t === 'task_started') { phase = 'working'; at = ts; }
      else if (t === 'task_complete' || t === 'turn_aborted') { phase = 'idle'; at = ts; }
      else if (/approval_request/.test(t)) { phase = 'needs_you'; at = ts; }
      else if (t === 'patch_apply_end') tool = 'apply_patch';
    } else if (d.type === 'response_item' && t === 'function_call') {
      tool = str(p.name) ?? tool;
      if (phase === 'needs_you') { phase = 'working'; at = ts; }
    }
  }
  return { phase, at, tool };
}

export async function listCodexSessions(root: Root, since: number): Promise<SessionMeta[]> {
  // sessions/YYYY/MM/DD/rollout-*.jsonl — only walk day folders that can contain recent files.
  const base = path.join(root.dir, 'sessions');
  const sinceDay = new Date(since - 86_400_000).toISOString().slice(0, 10);
  const days: string[] = [];
  const ls = async (p: string) => { try { return await fs.readdir(p); } catch { return []; } };
  for (const y of await ls(base)) for (const m of await ls(path.join(base, y))) for (const d of await ls(path.join(base, y, m))) {
    if (`${y}-${m}-${d}` >= sinceDay) days.push(path.join(base, y, m, d));
  }
  const files = (await Promise.all(days.map((d) => filesSince(d, since, (n) => n.startsWith('rollout-') && n.endsWith('.jsonl'))))).flat();
  const metas = await Promise.all(files.map(async ({ file, mtime }) => {
    const h = await cached(file, () => parseCodexHead(file));
    if (!h?.cwd || !h.id) return null;
    return { id: h.id, agent: root.agent, source: root.source, rootDir: root.dir, file, cwd: h.cwd, branch: h.branch, remote: h.remote, startedAt: h.startedAt, mtime, title: null } satisfies SessionMeta;
  }));
  return metas.filter(Boolean) as SessionMeta[];
}

// ---------------------------------------------------------------- Hook events

export async function readHookEvents(dir: string, since: number): Promise<HookEvent[]> {
  let names: string[];
  try { names = (await fs.readdir(dir)).filter((n) => /^events-.*\.jsonl$/.test(n)); } catch { return []; }
  const out: HookEvent[] = [];
  for (const n of names) {
    let text: string;
    try { text = await readSlice(path.join(dir, n), 'tail', 512 * 1024); } catch { continue; }
    for (const d of jsonLines(text)) {
      if (typeof d.ts === 'number' && d.ts >= since && str(d.session) && str(d.event)) out.push(d as unknown as HookEvent);
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}
