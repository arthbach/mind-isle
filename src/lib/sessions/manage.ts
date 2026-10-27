// Everything the Sessions page changes. Kept free of Next.js APIs so it can be unit-tested.
import path from 'node:path';
import { today } from '../clock';
import { assertWritable, readFrontmatterList, setFrontmatterList, updateNote } from '../vault/writer';
import { invalidateSessions, projectRefs, scanFolders } from './index';
import { hooksInstalled, installHooks, uninstallHooks } from './hooks';
import { expandHome, repoMatches, tildePath } from './mapping';
import { discoverRoots, home } from './roots';
import { updateSessionStore } from './store';
import type { SourceId } from './types';

const SOURCES: SourceId[] = ['orca', 'claude-code', 'codex'];
const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, '') === b.replace(/[\\/]+$/, '');
const assertSource = (s: string): SourceId => {
  if (!SOURCES.includes(s as SourceId)) throw new Error('Unknown source.');
  return s as SourceId;
};

export async function setSourceEnabled(source: string, on: boolean) {
  const s = assertSource(source);
  // Turning a source off also removes any hooks we installed for it.
  if (!on) for (const root of discoverRoots()[s]) await uninstallHooks(root);
  await updateSessionStore((st) => { st.sources[s] = on; });
  invalidateSessions();
}

export async function setSourceHooks(source: string, on: boolean) {
  const s = assertSource(source);
  for (const root of discoverRoots()[s]) await (on ? installHooks(root) : uninstallHooks(root));
}

export async function sourceStatus() {
  const roots = discoverRoots();
  return Promise.all(SOURCES.map(async (s) => ({
    source: s,
    roots: await Promise.all(roots[s].map(async (r) => ({ label: r.label, agent: r.agent, hooks: await hooksInstalled(r) }))),
  })));
}

/** Where new project notes go: next to the existing ones, in the same one-folder-per-project style if that's what the vault uses. */
export function newProjectPath(name: string, existing: string[]): string {
  const safe = name.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!safe) throw new Error('Give the project a name.');
  const styles = new Map<string, number>();
  for (const rel of existing) {
    const parts = rel.split('/');
    const stem = parts.at(-1)!.replace(/\.md$/, '');
    const key = parts.length >= 2 && parts.at(-2) === stem ? `${parts.slice(0, -2).join('/')}|folder` : `${parts.slice(0, -1).join('/')}|flat`;
    styles.set(key, (styles.get(key) ?? 0) + 1);
  }
  const [base, style] = ([...styles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Projects|folder').split('|');
  const prefix = base ? `${base}/` : '';
  return style === 'folder' ? `${prefix}${safe}/${safe}.md` : `${prefix}${safe}.md`;
}

export type Placement =
  | { kind: 'project'; rel: string }
  | { kind: 'new'; name: string }
  | { kind: 'none' }
  | { kind: 'undo-auto'; rel: string };

/** Put a working folder in a project (writing it to the project's `repos:`), or mark it as not a project. */
export async function placeFolder(cwd: string, choice: Placement): Promise<{ rel: string | null }> {
  assertWritable();
  // Only folders we actually saw sessions in can be placed.
  if (!(await scanFolders()).some((f) => f.cwd === cwd)) throw new Error('Unknown folder. Refresh and try again.');
  const h = home();
  const projects = await projectRefs();
  const entry = tildePath(cwd, h);

  if (choice.kind === 'undo-auto') {
    await updateSessionStore((st) => {
      const d = st.decisions[cwd];
      st.decisions[cwd] = { project: null, by: 'auto', at: today(), rejected: [...new Set([...(d?.rejected ?? []), choice.rel])] };
    });
    invalidateSessions();
    return { rel: null };
  }

  let target: string | null = null;
  if (choice.kind === 'project') {
    if (!projects.some((p) => p.rel === choice.rel)) throw new Error('Unknown project.');
    target = choice.rel;
  } else if (choice.kind === 'new') {
    target = newProjectPath(choice.name, projects.map((p) => p.rel));
    if (projects.some((p) => p.rel === target)) throw new Error('A project with that name already exists.');
    const name = path.basename(target, '.md');
    await updateNote(target, (raw) => raw, [
      '---', 'type: project', 'status: active', `started: ${today()}`, `last_activity: ${today()}`, `repos: [${JSON.stringify(entry)}]`, '---',
      '', `# ${name}`, '', '## Objective', '', '## Current state', '',
    ].join('\n'));
  }

  // A folder belongs to one project: drop exact entries for it everywhere else.
  for (const p of projects) {
    if (p.rel === target) continue;
    const exact = p.repos.filter((r) => samePath(expandHome(r, h), cwd));
    if (exact.length) await updateNote(p.rel, (raw) => setFrontmatterList(raw, 'repos', readFrontmatterList(raw, 'repos').filter((r) => !exact.includes(r))));
  }
  if (target && choice.kind === 'project') {
    await updateNote(target, (raw) => {
      const repos = readFrontmatterList(raw, 'repos');
      return repos.some((r) => repoMatches(cwd, r, h)) ? raw : setFrontmatterList(raw, 'repos', [...repos, entry]);
    });
  }
  await updateSessionStore((st) => { st.decisions[cwd] = { project: target, by: 'user', at: today() }; });
  invalidateSessions();
  return { rel: target };
}

/** Accept every automatic mapping in one go. */
export async function confirmAllAuto(): Promise<number> {
  const autos = (await scanFolders()).filter((f) => f.mapping.kind === 'auto' && f.mapping.project);
  for (const f of autos) await placeFolder(f.cwd, { kind: 'project', rel: f.mapping.project!.rel });
  return autos.length;
}
