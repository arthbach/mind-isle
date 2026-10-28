import { cleanText, slugify } from '../game';
import { loadNotes } from '../vault/reader';
import { gitRemote } from './git';
import {
  listClaudeSessions, listCodexSessions, parseClaudeTail, parseCodexTail, readClaudeRegistry, readHookEvents, type RegistryEntry,
} from './logs';
import { mapFolder, type ProjectRef } from './mapping';
import { discoverRoots, home, shortPath } from './roots';
import { LIVE, sessionState } from './state';
import { readSettings } from '../settings';
import { eventsDir, readSessionStore } from './store';
import type { FolderGroup, HookEvent, LiveSession, LiveSnapshot, Root, SessionMeta, SourceId } from './types';

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v.flat(Infinity) : v == null || v === '' ? [] : [v]).map((x) => String(x).trim()).filter(Boolean);

// ---------------------------------------------------------------- caches

interface Caches {
  projects: { at: number; value: ProjectRef[] } | null;
  folders: { at: number; days: number; value: FolderGroup[] } | null;
  snapshot: { at: number; value: LiveSnapshot } | null;
}
// Next.js can bundle route handlers (the live stream) and server actions separately, each with its own copy
// of this module. Keeping the caches on globalThis lets invalidateSessions() clear the one every bundle reads.
const caches: Caches = ((globalThis as { __palaceSessionCaches?: Caches }).__palaceSessionCaches ??= { projects: null, folders: null, snapshot: null });

/** Call after anything that changes mappings or sources. */
export function invalidateSessions() {
  caches.projects = null;
  caches.folders = null;
  caches.snapshot = null;
}

export async function projectRefs(): Promise<ProjectRef[]> {
  if (caches.projects && Date.now() - caches.projects.at < 5000) return caches.projects.value;
  const notes = await loadNotes();
  const value = notes
    .filter((n) => String(n.fm.type ?? '').toLowerCase() === 'project')
    .map((n) => {
      const name = cleanText(String(n.fm.title ?? '')) || n.name;
      return { id: slugify(name), name, rel: n.rel, aliases: list(n.fm.aliases).map(cleanText), repos: list(n.fm.repos), repoUrls: list(n.fm.repo_urls), summaries: n.fm.summaries ? String(n.fm.summaries).toLowerCase().trim() : null };
    });
  caches.projects = { at: Date.now(), value };
  return value;
}

export function enabledRoots(sources: Record<SourceId, boolean>): Root[] {
  const roots = discoverRoots();
  return (Object.keys(roots) as SourceId[]).filter((s) => sources[s]).flatMap((s) => roots[s]);
}

export async function sessionsSince(roots: Root[], since: number): Promise<SessionMeta[]> {
  const all = (await Promise.all(roots.map((r) => (r.agent === 'claude' ? listClaudeSessions(r, since) : listCodexSessions(r, since))))).flat();
  // The same session can be visible through two sources; keep the most recently written copy.
  const byId = new Map<string, SessionMeta>();
  for (const m of all) if (!byId.has(m.id) || byId.get(m.id)!.mtime < m.mtime) byId.set(m.id, m);
  return [...byId.values()];
}

// ---------------------------------------------------------------- folders (review table)

export async function scanFolders(days = 90): Promise<FolderGroup[]> {
  if (caches.folders && caches.folders.days === days && Date.now() - caches.folders.at < 30_000) return caches.folders.value;
  const [store, { sources }] = await Promise.all([readSessionStore(), readSettings()]);
  const [metas, projects] = await Promise.all([sessionsSince(enabledRoots(sources), Date.now() - days * 86_400_000), projectRefs()]);
  const groups = new Map<string, SessionMeta[]>();
  for (const m of metas) groups.set(m.cwd, [...(groups.get(m.cwd) ?? []), m]);
  const h = home();
  const value = [...groups.entries()].map(([cwd, ms]) => {
    const remote = ms.find((m) => m.remote)?.remote ?? gitRemote(cwd);
    const titles = [...new Set(ms.map((m) => m.title).filter(Boolean) as string[])].slice(0, 5);
    const { mapping, ranked } = mapFolder({ cwd, remote, titles }, projects, store.decisions[cwd], h);
    return {
      cwd, cwdShort: shortPath(cwd), sessions: ms.length,
      agents: [...new Set(ms.map((m) => m.agent))], sources: [...new Set(ms.map((m) => m.source))],
      lastActive: Math.max(...ms.map((m) => m.mtime)), titles, remote, mapping,
      suggestions: ranked.slice(0, 3).map((r) => ({ id: r.project.id, name: r.project.name, rel: r.project.rel, confidence: r.confidence, reason: r.reason })),
    } satisfies FolderGroup;
  });
  const order = { ask: 0, harbor: 1, auto: 2, confirmed: 3, ignored: 4 } as const;
  value.sort((a, b) => order[a.mapping.kind] - order[b.mapping.kind] || b.lastActive - a.lastActive);
  caches.folders = { at: Date.now(), days, value };
  return value;
}

// ---------------------------------------------------------------- live snapshot

export async function liveSnapshot(): Promise<LiveSnapshot> {
  if (caches.snapshot && Date.now() - caches.snapshot.at < 800) return caches.snapshot.value;
  const now = Date.now();
  const since = now - LIVE.endAfterMs;
  const [store, { sources }] = await Promise.all([readSessionStore(), readSettings()]);
  const roots = enabledRoots(sources);
  if (!roots.length) {
    const empty = { at: now, live: [], pending: 0 };
    caches.snapshot = { at: now, value: empty };
    return empty;
  }

  const [metas, hookEvents, registries, projects, folders] = await Promise.all([
    sessionsSince(roots, since),
    readHookEvents(eventsDir(), since),
    Promise.all(roots.filter((r) => r.agent === 'claude').map((r) => readClaudeRegistry(r).then((e) => e.map((x) => ({ ...x, root: r }))))),
    projectRefs(),
    scanFolders(),
  ]);
  const registry = new Map<string, RegistryEntry & { root: Root }>();
  for (const e of registries.flat()) if (!registry.has(e.sessionId) || e.alive) registry.set(e.sessionId, e);
  const hooksBy = new Map<string, HookEvent[]>();
  for (const e of hookEvents) hooksBy.set(e.session, [...(hooksBy.get(e.session) ?? []), e]);

  // Running sessions whose log hasn't been written recently still count.
  const byId = new Map(metas.map((m) => [m.id, m]));
  for (const [id, e] of registry) {
    if (!e.alive || byId.has(id) || !e.cwd) continue;
    byId.set(id, { id, agent: 'claude', source: e.root.source, rootDir: e.root.dir, file: '', cwd: e.cwd, branch: null, remote: null, startedAt: null, mtime: e.updatedAt ?? now, title: e.name });
  }

  const h = home();
  const mappingFor = new Map<string, LiveSession['mapping']>();
  const live: LiveSession[] = [];
  for (const m of byId.values()) {
    const reg = registry.get(m.id);
    const hooks = hooksBy.get(m.id);
    const codex = m.agent === 'codex' && m.file ? await parseCodexTail(m.file).catch(() => null) : null;
    const st = sessionState({
      now, mtime: m.mtime,
      registry: reg ? { alive: reg.alive, status: reg.status, updatedAt: reg.updatedAt } : undefined,
      hooks, log: codex ? { phase: codex.phase, at: codex.at } : undefined,
    });
    if (st.state === 'ended') continue;
    const tail = m.agent === 'claude' && m.file ? await parseClaudeTail(m.file).catch(() => null) : null;
    const lastHook = hooks?.at(-1);
    if (!mappingFor.has(m.cwd)) {
      const folder = folders.find((f) => f.cwd === m.cwd);
      mappingFor.set(m.cwd, folder?.mapping ?? mapFolder({ cwd: m.cwd, remote: m.remote ?? gitRemote(m.cwd), titles: m.title ? [m.title] : [] }, projects, store.decisions[m.cwd], h).mapping);
    }
    live.push({
      id: m.id, agent: m.agent, source: m.source, cwd: m.cwd, cwdShort: shortPath(m.cwd),
      branch: tail?.branch ?? m.branch, title: reg?.name ?? tail?.title ?? m.title,
      state: st.state, inferred: st.inferred,
      lastAction: lastHook?.detail ?? lastHook?.tool ?? tail?.tool ?? codex?.tool ?? null,
      startedAt: m.startedAt, lastEventAt: Math.max(st.at, m.mtime),
      mapping: mappingFor.get(m.cwd)!,
    });
  }
  const urgency = { needs_you: 0, working: 1, idle: 2 } as const;
  live.sort((a, b) => urgency[a.state] - urgency[b.state] || b.lastEventAt - a.lastEventAt);
  const value = { at: now, live, pending: folders.filter((f) => f.mapping.kind === 'ask' || f.mapping.kind === 'harbor').length };
  caches.snapshot = { at: now, value };
  return value;
}
