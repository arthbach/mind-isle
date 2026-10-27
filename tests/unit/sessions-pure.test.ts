import { describe, expect, it } from 'vitest';
import { mapFolder, normalizeRemote, repoMatches, tildePath, type ProjectRef } from '@/lib/sessions/mapping';
import { LIVE, sessionState } from '@/lib/sessions/state';
import type { HookEvent } from '@/lib/sessions/types';

const NOW = 1_800_000_000_000;
const ev = (event: string, agoMs: number, extra: Partial<HookEvent> = {}): HookEvent => ({ ts: NOW - agoMs, agent: 'claude', session: 's', event, ...extra });

describe('session state', () => {
  it('follows hook events, newest wins', () => {
    expect(sessionState({ now: NOW, mtime: NOW - 5000, hooks: [ev('UserPromptSubmit', 4000), ev('PreToolUse', 3000)] }).state).toBe('working');
    expect(sessionState({ now: NOW, mtime: NOW, hooks: [ev('PreToolUse', 3000), ev('PermissionRequest', 1000)] }).state).toBe('needs_you');
    expect(sessionState({ now: NOW, mtime: NOW, hooks: [ev('PermissionRequest', 3000), ev('PostToolUse', 1000)] }).state).toBe('working');
    expect(sessionState({ now: NOW, mtime: NOW, hooks: [ev('PreToolUse', 3000), ev('Stop', 1000)] }).state).toBe('idle');
    expect(sessionState({ now: NOW, mtime: NOW, hooks: [ev('Stop', 3000), ev('SessionEnd', 1000)] }).state).toBe('ended');
  });

  it('treats permission notifications as needing you, idle notifications as idle', () => {
    expect(sessionState({ now: NOW, mtime: NOW, hooks: [ev('Notification', 1000, { reason: 'permission' })] }).state).toBe('needs_you');
    expect(sessionState({ now: NOW, mtime: NOW, hooks: [ev('Notification', 1000, { reason: 'idle' })] }).state).toBe('idle');
  });

  it('uses the running-session registry, and a dead process means ended', () => {
    expect(sessionState({ now: NOW, mtime: NOW - 3e6, registry: { alive: true, status: 'busy', updatedAt: NOW - 1000 } }).state).toBe('working');
    expect(sessionState({ now: NOW, mtime: NOW - 3e6, registry: { alive: true, status: 'idle', updatedAt: NOW - 1000 } }).state).toBe('idle');
    expect(sessionState({ now: NOW, mtime: NOW, registry: { alive: true, status: 'waiting_for_permission', updatedAt: NOW } }).state).toBe('needs_you');
    expect(sessionState({ now: NOW, mtime: NOW, registry: { alive: false, status: 'busy', updatedAt: NOW } }).state).toBe('ended');
    // A live process is never "ended" just because it has been quiet for hours.
    expect(sessionState({ now: NOW, mtime: NOW - 5 * 3600e3, registry: { alive: true, status: 'idle', updatedAt: NOW - 5 * 3600e3 } }).state).toBe('idle');
  });

  it('reads Codex phases from the log', () => {
    expect(sessionState({ now: NOW, mtime: NOW, log: { phase: 'working', at: NOW - 1000 } }).state).toBe('working');
    expect(sessionState({ now: NOW, mtime: NOW, log: { phase: 'needs_you', at: NOW - 1000 } }).state).toBe('needs_you');
  });

  it('goes idle when "working" goes stale, and ends after long silence', () => {
    const stale = NOW - LIVE.idleAfterMs - 1000;
    expect(sessionState({ now: NOW, mtime: stale, hooks: [ev('PreToolUse', NOW - stale)] }).state).toBe('idle');
    expect(sessionState({ now: NOW, mtime: NOW - LIVE.endAfterMs - 1000 }).state).toBe('ended');
  });

  it('marks pure file-activity guesses as inferred', () => {
    expect(sessionState({ now: NOW, mtime: NOW - 30_000 })).toMatchObject({ state: 'working', inferred: true });
    expect(sessionState({ now: NOW, mtime: NOW - 30 * 60_000 })).toMatchObject({ state: 'idle', inferred: true });
  });
});

describe('mapping folders to projects', () => {
  const HOME = '/home/u';
  const P = (name: string, extra: Partial<ProjectRef> = {}): ProjectRef =>
    ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, rel: `Projects/${name}.md`, aliases: [], repos: [], repoUrls: [], ...extra });
  const projects = [
    P('Lighthouse App', { repos: ['~/code/lighthouse-app'] }),
    P('Northwind Routing', { aliases: ['NW'] }),
    P('Solar Dashboard', { repoUrls: ['https://github.com/acme/solar-dashboard'] }),
    P('Worktrees', { repos: ['~/wt/*/app'] }),
  ];
  const f = (cwd: string, extra: { remote?: string; titles?: string[] } = {}) => ({ cwd, remote: extra.remote ?? null, titles: extra.titles ?? [] });

  it('matches repos paths, sub-folders and globs', () => {
    expect(repoMatches('/home/u/code/lighthouse-app', '~/code/lighthouse-app', HOME)).toBe(true);
    expect(repoMatches('/home/u/code/lighthouse-app/web', '~/code/lighthouse-app/', HOME)).toBe(true);
    expect(repoMatches('/home/u/code/lighthouse-application', '~/code/lighthouse-app', HOME)).toBe(false);
    expect(repoMatches('/home/u/wt/feat-x/app', '~/wt/*/app', HOME)).toBe(true);
    expect(repoMatches('/home/u/wt/a/b/app', '~/wt/*/app', HOME)).toBe(false);
    expect(repoMatches('/home/u/wt/a/b/app', '~/wt/**', HOME)).toBe(true);
    expect(tildePath('/home/u/code/x', HOME)).toBe('~/code/x');
  });

  it('normalises git remotes across https, ssh and scp styles', () => {
    const want = 'github.com/acme/solar-dashboard';
    expect(normalizeRemote('git@github.com:acme/solar-dashboard.git')).toBe(want);
    expect(normalizeRemote('https://github.com/Acme/solar-dashboard/')).toBe(want);
    expect(normalizeRemote('ssh://git@github.com/acme/solar-dashboard.git')).toBe(want);
  });

  it('treats repos as confirmed, git remote as automatic, folder names as a question', () => {
    expect(mapFolder(f('/home/u/code/lighthouse-app'), projects, undefined, HOME).mapping).toMatchObject({ kind: 'confirmed', reason: 'repos' });
    expect(mapFolder(f('/home/u/x/solar', { remote: 'git@github.com:acme/solar-dashboard.git' }), projects, undefined, HOME).mapping)
      .toMatchObject({ kind: 'auto', confidence: 0.95 });
    expect(mapFolder(f('/home/u/code/northwind-routing'), projects, undefined, HOME).mapping)
      .toMatchObject({ kind: 'ask', confidence: 0.7, project: { name: 'Northwind Routing' } });
    expect(mapFolder(f('/home/u/code/nw'), projects, undefined, HOME).mapping.project?.name).toBe('Northwind Routing');
  });

  it('never decides alone on weak or tied evidence', () => {
    expect(mapFolder(f('/home/u/code/scratch'), projects, undefined, HOME).mapping.kind).toBe('harbor');
    expect(mapFolder(f('/home/u/code/scratch', { titles: ['Northwind Routing cleanup'] }), projects, undefined, HOME).mapping).toMatchObject({ kind: 'harbor', confidence: 0.5 });
    const twins = [P('Atlas Web'), P('Atlas-Web', { rel: 'Other/Atlas-Web.md' })];
    expect(mapFolder(f('/home/u/code/atlas-web'), twins, undefined, HOME).mapping.kind).toBe('harbor');
  });

  it("respects the user's decisions, including undoing an automatic match", () => {
    const solar = f('/home/u/x/solar', { remote: 'git@github.com:acme/solar-dashboard.git' });
    expect(mapFolder(f('/home/u/code/scratch'), projects, { project: null, by: 'user', at: '' }, HOME).mapping.kind).toBe('ignored');
    expect(mapFolder(f('/home/u/code/scratch'), projects, { project: 'Projects/Lighthouse App.md', by: 'user', at: '' }, HOME).mapping)
      .toMatchObject({ kind: 'confirmed', project: { name: 'Lighthouse App' } });
    expect(mapFolder(solar, projects, { project: null, by: 'auto', at: '', rejected: ['Projects/Solar Dashboard.md'] }, HOME).mapping.project).toBeNull();
  });
});
