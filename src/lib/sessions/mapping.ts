// Which project a working folder belongs to, with a confidence score. Pure.
import path from 'node:path';
import type { Mapping } from './types';

export interface ProjectRef { id: string; name: string; rel: string; aliases: string[]; repos: string[]; repoUrls: string[]; /** The note's own `summaries:` mode, if set. */ summaries?: string | null }
export interface Decision { project: string | null; by: 'user' | 'auto'; at: string; rejected?: string[] }

export const THRESHOLD = { auto: 0.9, ask: 0.6 };

export function expandHome(p: string, home: string): string {
  return p === '~' ? home : p.startsWith('~/') || p.startsWith('~\\') ? path.join(home, p.slice(2)) : p;
}

export function tildePath(p: string, home: string): string {
  return p === home ? '~' : p.startsWith(home + path.sep) ? `~/${p.slice(home.length + 1).split(path.sep).join('/')}` : p;
}

const trimSep = (p: string) => p.replace(/[\\/]+$/, '');

/** `~/code/app`, `~/code/app/*`, `~/code/**` — a folder also matches everything inside it. */
export function repoMatches(cwd: string, pattern: string, home: string): boolean {
  const p = trimSep(expandHome(pattern.trim(), home));
  const c = trimSep(cwd);
  if (!p) return false;
  if (!p.includes('*')) return c === p || c.startsWith(p + '/') || c.startsWith(p + '\\');
  const re = p.split(/(\*\*|\*)/).map((part) => (part === '**' ? '.*' : part === '*' ? '[^/\\\\]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`^${re}(?:[/\\\\].*)?$`).test(c);
}

/** github.com/acme/app for https, ssh and scp-style remotes. */
export function normalizeRemote(url: string): string {
  return url.trim().toLowerCase()
    .replace(/^[a-z+]+:\/\//, '')
    .replace(/^[^@/]+@/, '')
    .replace(/^([^/:]+):(?!\d)/, '$1/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

function folderScore(cwd: string, home: string, p: ProjectRef): { confidence: number; reason: string } | null {
  const rel = cwd.startsWith(home) ? cwd.slice(home.length) : cwd;
  const segs = rel.split(/[\\/]+/).map(norm).filter(Boolean);
  const names = [p.name, ...p.aliases, p.id].map(norm).filter((n) => n.length >= 2);
  if (segs.some((s) => names.includes(s))) return { confidence: 0.7, reason: 'folder name' };
  if (segs.some((s) => names.some((n) => (n.length >= 5 && s.includes(n)) || (s.length >= 5 && n.includes(s))))) {
    return { confidence: 0.62, reason: 'similar folder name' };
  }
  return null;
}

export function mapFolder(
  folder: { cwd: string; remote: string | null; titles: string[] },
  projects: ProjectRef[],
  decision: Decision | undefined,
  home: string,
): { mapping: Mapping; ranked: { project: ProjectRef; confidence: number; reason: string }[] } {
  const ref = (p: ProjectRef) => ({ id: p.id, name: p.name, rel: p.rel });

  if (decision?.by === 'user') {
    if (decision.project === null) {
      return { mapping: { project: null, confidence: 1, reason: 'not a project', kind: 'ignored' }, ranked: [] };
    }
    const p = projects.find((x) => x.rel === decision.project);
    if (p) return { mapping: { project: ref(p), confidence: 1, reason: 'confirmed', kind: 'confirmed' }, ranked: [{ project: p, confidence: 1, reason: 'confirmed' }] };
  }

  const rejected = new Set(decision?.rejected ?? []);
  const remote = folder.remote ? normalizeRemote(folder.remote) : null;
  const ranked = projects
    .filter((p) => !rejected.has(p.rel))
    .map((p) => {
      const hits: { confidence: number; reason: string }[] = [];
      if (p.repos.some((r) => repoMatches(folder.cwd, r, home))) hits.push({ confidence: 1, reason: 'repos' });
      if (remote && p.repoUrls.some((u) => normalizeRemote(u) === remote)) hits.push({ confidence: 0.95, reason: 'git remote' });
      if (decision?.by === 'auto' && decision.project === p.rel) hits.push({ confidence: 0.95, reason: 'mapped before' });
      const f = folderScore(folder.cwd, home, p);
      if (f) hits.push(f);
      const words = [p.name, ...p.aliases].filter((n) => n.length >= 3);
      if (folder.titles.some((t) => words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(t)))) {
        hits.push({ confidence: 0.5, reason: 'mentioned in session title' });
      }
      const best = hits.sort((a, b) => b.confidence - a.confidence)[0];
      return best ? { project: p, ...best } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b!.confidence - a!.confidence) as { project: ProjectRef; confidence: number; reason: string }[];

  if (ranked.length > 1 && ranked[0].confidence - ranked[1].confidence < 0.05) {
    // Two projects look equally right: never decide alone.
    ranked[0] = { ...ranked[0], confidence: Math.max(0, ranked[0].confidence - 0.2), reason: `${ranked[0].reason}, tied` };
  }
  const top = ranked[0];
  if (!top || top.confidence < THRESHOLD.ask) {
    return { mapping: { project: null, confidence: top?.confidence ?? 0, reason: top ? `weak match (${top.reason})` : 'no match', kind: 'harbor' }, ranked };
  }
  // A folder listed in the project's own `repos:` was placed there by the user: that's a confirmation.
  const kind = top.reason === 'repos' ? 'confirmed' : top.confidence >= THRESHOLD.auto ? 'auto' : 'ask';
  return { mapping: { project: ref(top.project), confidence: top.confidence, reason: top.reason, kind }, ranked };
}
