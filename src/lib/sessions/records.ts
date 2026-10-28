// Session records: one small metadata file per session from an enabled source, kept in .palace/sessions/records/.
// They outlive the agents' own log cleanup, so history stays after a transcript is deleted.
// Only times, paths and counts are kept; prompt text, code and tool output are parsed past and never stored.
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { enabledRoots, projectRefs, scanFolders, sessionsSince } from './index';
import { gitRemote } from './git';
import { mapFolder } from './mapping';
import { home, shortPath } from './roots';
import { readSettings } from '../settings';
import { readSessionStore } from './store';
import type { Agent, Mapping, SessionMeta, SourceId } from './types';

export interface SessionRecord {
  id: string;
  agent: Agent;
  source: SourceId;
  cwd: string;
  branch: string | null;
  /** The agent's own generated title, never the user's prompt. */
  title: string | null;
  startedAt: number | null;
  lastEventAt: number;
  /** Time with activity; a gap of more than 10 minutes between events doesn't count. */
  activeMs: number;
  /** When the session was active, [start, end] in ms; lets parallel sessions be counted once. */
  spans?: [number, number][];
  activeMin: number;
  /** Files the agent edited or created, relative to cwd when inside it. */
  files: string[];
  toolCalls: number;
  transcript: string;
  /** How far the log has been read. Logs only grow at the end, so the next sync reads from `offset`. */
  seen: { mtime: number; size: number; offset: number };
  /** How the log was read; a record from an older reader is read again from the start. */
  v?: number;
}

export const RECORDS = {
  /** First sync looks back this far. */
  backfillDays: 90,
  /** Gaps longer than this between events aren't active time. */
  idleGapMs: 10 * 60_000,
  /** At most one sync per this interval. */
  syncEveryMs: 60_000,
  maxFiles: 60,
  maxSpans: 400,
};

/** Version of the log reader; bump it to re-read every log once with new rules. */
const READER = 3;

export const recordsDir = () => path.join(config.dataDir, 'sessions', 'records');
const fileFor = (id: string) => path.join(recordsDir(), `${id.replace(/[^\w.-]/g, '_')}.json`);

/** What a log adds up to so far. Built line by line, so a later read can continue from where this one stopped. */
export interface LogTally {
  /** Stretches of activity, [start, end] in ms, oldest first; a gap over 10 minutes starts a new one. */
  spans: [number, number][];
  first: number | null;
  last: number | null;
  activeMs: number;
  files: string[];
  toolCalls: number;
  title: string | null;
  branch: string | null;
}
export const emptyTally = (): LogTally => ({ spans: [], first: null, last: null, activeMs: 0, files: [], toolCalls: 0, title: null, branch: null });

function addTime(t: LogTally, ts: number) {
  if (t.last !== null && ts > t.last && ts - t.last <= RECORDS.idleGapMs) t.activeMs += ts - t.last;
  const span = t.spans.at(-1);
  if (span && ts >= span[1] && ts - span[1] <= RECORDS.idleGapMs) span[1] = ts;
  else if (!span || ts > span[1]) t.spans.push([ts, ts]);
  if (t.first === null || ts < t.first) t.first = ts;
  if (t.last === null || ts > t.last) t.last = ts;
}

// apply_patch bodies name their files in "*** Update File: path" headers; only the paths are kept.
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
const patchPaths = (text: unknown) => (typeof text === 'string' ? [...text.matchAll(PATCH_FILE)].map((m) => m[1].trim()) : []);

const TS_KEY = Buffer.from('"timestamp":"');
// In Claude Code logs only conversation turns are activity. Bookkeeping lines (api-request, pr-link, system,
// cost-state…) are also written when a session is merely reopened, and would make an idle session look busy.
const CLAUDE_TURN = [Buffer.from('"type":"user"'), Buffer.from('"type":"assistant"')];
const BRANCH_KEY = Buffer.from('"gitBranch":"');
const WANTED = {
  claude: [Buffer.from('"tool_use"'), Buffer.from('"ai-title"')],
  codex: [Buffer.from('"function_call"'), Buffer.from('"custom_tool_call"'), Buffer.from('"patch_apply_begin"')],
};
/** The string value right after `key` in a line, read from a few bytes only. */
const valueAfter = (line: Buffer, at: number, key: Buffer) => {
  const v = line.toString('utf8', at + key.length, Math.min(line.length, at + key.length + 200));
  const end = v.indexOf('"');
  return end > 0 ? v.slice(0, end) : null;
};

/**
 * Read a log from byte `from` and add what it holds to `tally`. Returns the offset after the last complete line.
 * Logs can be hundreds of MB, so lines stay bytes: the time and branch are found with a byte search, and only
 * lines that can hold a tool call or a title are decoded and parsed.
 */
export async function scanLog(file: string, agent: Agent, from = 0, tally: LogTally = emptyTally()): Promise<{ tally: LogTally; offset: number }> {
  const files = new Set(tally.files);
  let pos = from;
  let rest: Buffer = Buffer.alloc(0);
  for await (const chunk of createReadStream(file, { start: from, highWaterMark: 1 << 20 })) {
    const buf: Buffer = rest.length ? Buffer.concat([rest, chunk as Buffer]) : (chunk as Buffer);
    let start = 0, nl: number;
    while ((nl = buf.indexOf(10, start)) !== -1) {
      const line = buf.subarray(start, nl);
      start = nl + 1;
      // Claude Code writes the timestamp last, Codex first.
      const at = agent === 'claude' ? (CLAUDE_TURN.some((k) => line.includes(k)) ? line.lastIndexOf(TS_KEY) : -1) : line.indexOf(TS_KEY);
      if (at !== -1) { const ts = Date.parse(valueAfter(line, at, TS_KEY) ?? ''); if (Number.isFinite(ts)) addTime(tally, ts); }
      if (agent === 'claude') { const b = line.indexOf(BRANCH_KEY); if (b !== -1) tally.branch = valueAfter(line, b, BRANCH_KEY) || tally.branch; }
      if (!WANTED[agent].some((k) => line.includes(k))) continue;
      let d: Record<string, unknown>;
      try { d = JSON.parse(line.toString('utf8')); } catch { continue; }
      if (agent === 'claude') {
        if (d.type === 'ai-title' && typeof d.aiTitle === 'string') tally.title = d.aiTitle;
        const content = (d.message as { content?: unknown } | undefined)?.content;
        if (d.type !== 'assistant' || !Array.isArray(content)) continue;
        for (const c of content as { type?: string; name?: string; input?: Record<string, unknown> }[]) {
          if (c?.type !== 'tool_use') continue;
          tally.toolCalls++;
          if (!/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(c.name ?? '')) continue;
          const p = c.input?.file_path ?? c.input?.notebook_path;
          if (typeof p === 'string') files.add(p);
        }
      } else {
        const p = (d.payload ?? {}) as Record<string, unknown>;
        if (d.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call')) {
          tally.toolCalls++;
          if (p.name === 'apply_patch') for (const f of patchPaths(p.input ?? p.arguments)) files.add(f);
        } else if (d.type === 'event_msg' && p.type === 'patch_apply_begin' && p.changes && typeof p.changes === 'object') {
          for (const f of Object.keys(p.changes)) files.add(f);
        }
      }
    }
    pos += start;
    rest = buf.subarray(start);
  }
  // A half-written last line stays unread until it's complete.
  tally.files = [...files];
  return { tally, offset: pos };
}

const relTo = (cwd: string, f: string) => {
  const abs = path.isAbsolute(f) ? f : path.join(cwd, f);
  const rel = path.relative(cwd, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
};

/** A new record, or the old one continued from where its log was last read. */
async function buildRecord(m: SessionMeta, st: { mtime: number; size: number }, old: SessionRecord | null): Promise<SessionRecord> {
  // A log that shrank was rewritten: read it again from the start.
  const resume = old && old.v === READER && old.seen.offset !== undefined && st.size >= old.seen.offset;
  const prev: LogTally = resume
    ? { spans: old.spans ?? [], first: old.startedAt, last: old.lastEventAt, activeMs: old.activeMs ?? 0, files: old.files, toolCalls: old.toolCalls, title: old.title, branch: old.branch }
    : emptyTally();
  const { tally, offset } = await scanLog(m.file, m.agent, resume ? old.seen.offset : 0, prev);
  return {
    id: m.id, agent: m.agent, source: m.source, cwd: m.cwd,
    branch: tally.branch ?? m.branch, title: tally.title ?? m.title,
    startedAt: m.startedAt ?? tally.first, lastEventAt: tally.last ?? m.mtime,
    activeMs: tally.activeMs, activeMin: Math.round(tally.activeMs / 60_000),
    // Only spans with some length matter for overlap; keep the most recent ones so records stay small.
    spans: tally.spans.filter(([a, b]) => b > a).slice(-RECORDS.maxSpans),
    files: [...new Set(tally.files.map((f) => relTo(m.cwd, f)))].slice(0, RECORDS.maxFiles),
    toolCalls: tally.toolCalls, transcript: m.file, seen: { ...st, offset }, v: READER,
  };
}

export async function readRecord(id: string): Promise<SessionRecord | null> {
  try { return JSON.parse(await fs.readFile(fileFor(id), 'utf8')); } catch { return null; }
}

export async function readRecords(since = 0): Promise<SessionRecord[]> {
  let names: string[];
  try { names = (await fs.readdir(recordsDir())).filter((n) => n.endsWith('.json')); } catch { return []; }
  const all = await Promise.all(names.map(async (n) => {
    try { return JSON.parse(await fs.readFile(path.join(recordsDir(), n), 'utf8')) as SessionRecord; } catch { return null; }
  }));
  return (all.filter(Boolean) as SessionRecord[]).filter((r) => r.lastEventAt >= since).sort((a, b) => b.lastEventAt - a.lastEventAt);
}

async function writeRecord(r: SessionRecord) {
  await fs.mkdir(recordsDir(), { recursive: true });
  const file = fileFor(r.id);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(r, null, 2));
  await fs.rename(tmp, file);
}

/** Record every session from the enabled sources whose log is new or changed. Returns how many were written. */
export async function syncRecords(): Promise<number> {
  const roots = enabledRoots((await readSettings()).sources);
  if (!roots.length) return 0;
  const existing = new Map((await readRecords()).map((r) => [r.id, r]));
  // A source seen for the first time is backfilled; after that, only logs touched since its newest record
  // (minus a day of slack) can have changed.
  const newest = new Map<SourceId, number>();
  const outdated = new Set<SourceId>();
  for (const r of existing.values()) {
    newest.set(r.source, Math.max(newest.get(r.source) ?? 0, r.lastEventAt));
    // Records read by an older reader: look back over the whole window once, so they're all read again.
    if (r.v !== READER) outdated.add(r.source);
  }
  for (const s of outdated) newest.delete(s);
  const backfill = Date.now() - RECORDS.backfillDays * 86_400_000;
  const metas = (await Promise.all([...new Set(roots.map((r) => r.source))].map((source) =>
    sessionsSince(roots.filter((r) => r.source === source), newest.has(source) ? newest.get(source)! - 86_400_000 : backfill)))).flat();
  let written = 0;
  for (const m of metas) {
    if (!m.file) continue;
    let st;
    try { st = await fs.stat(m.file); } catch { continue; }
    const seen = { mtime: st.mtimeMs, size: st.size };
    const old = existing.get(m.id) ?? null;
    if (old && old.v === READER && old.seen.mtime === seen.mtime && old.seen.size === seen.size) continue;
    try { await writeRecord(await buildRecord(m, seen, old)); written++; } catch { /* a log rotating mid-read: next sync */ }
  }
  return written;
}

// One sync at a time, at most once a minute; shared across Next.js bundles like the session caches.
const gate = ((globalThis as { __palaceRecordSync?: { at: number; running: Promise<number> | null } }).__palaceRecordSync ??= { at: 0, running: null });

/** True while a sync is running (the first backfill can take a while on a big history). */
export const syncingRecords = () => !!gate.running;

/** Throttled sync for request paths: runs at most once a minute and shares a sync already running. */
export function syncRecordsSoon(force = false): Promise<number> {
  if (gate.running) return gate.running;
  if (!force && Date.now() - gate.at < RECORDS.syncEveryMs) return Promise.resolve(0);
  gate.at = Date.now();
  gate.running = syncRecords().catch(() => 0).finally(() => { gate.running = null; });
  return gate.running;
}

export interface HistoryItem extends Omit<SessionRecord, 'seen' | 'transcript'> {
  cwdShort: string;
  /** Only confirmed or automatic matches; anything else shows the folder. */
  project: Mapping['project'];
  /** How the folder is placed right now ('ignored' = the user said it's not a project). */
  placement: Mapping['kind'];
}

/** Recorded sessions from the last `days` days, newest first, each with the project its folder maps to now. */
export async function sessionHistory(days = 7): Promise<HistoryItem[]> {
  return historySince(Date.now() - days * 86_400_000);
}

/** Recorded sessions active since `since`, newest first, each with the project its folder maps to now. */
export async function historySince(since: number): Promise<HistoryItem[]> {
  const records = await readRecords(since);
  if (!records.length) return [];
  const [folders, projects, store] = await Promise.all([scanFolders(), projectRefs(), readSessionStore()]);
  const h = home();
  const mappings = new Map<string, Mapping>();
  const mappingOf = (cwd: string) => {
    if (!mappings.has(cwd)) {
      mappings.set(cwd, folders.find((f) => f.cwd === cwd)?.mapping
        ?? mapFolder({ cwd, remote: gitRemote(cwd), titles: [] }, projects, store.decisions[cwd], h).mapping);
    }
    return mappings.get(cwd)!;
  };
  return records.map(({ seen: _seen, transcript: _t, ...r }) => {
    const m = mappingOf(r.cwd);
    return { ...r, cwdShort: shortPath(r.cwd), project: m.kind === 'confirmed' || m.kind === 'auto' ? m.project : null, placement: m.kind };
  });
}

/** Total time covered by any of the spans, counting overlaps once (parallel agents are one hour of yours, not three). */
export function unionMs(spans: [number, number][], from = -Infinity, to = Infinity): number {
  const clipped = spans.map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, end = -Infinity;
  for (const [a, b] of clipped) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}
