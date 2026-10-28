// Session summaries: who may be summarised, the durable job queue in .palace/jobs/, and the worker.
// Consent is checked when a job is created and again right before the transcript is read.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { projectRefs } from '../sessions';
import { LIVE } from '../sessions/state';
import { historySince, readRecord, type HistoryItem, type SessionRecord } from '../sessions/records';
import { readSettings, summaryModel, updateSettings, type Settings, type SummaryMode } from '../settings';
import { invalidateSessions } from '../sessions';
import { assertWritable, setFrontmatter, updateNote } from '../vault/writer';
import { writeSessionNote } from './note';
import { redact } from './redact';
import { summarise } from './summarise';
import { transcriptText } from './transcript';

export type SummaryStatus =
  | 'live' // still running
  | 'before' // ended before summaries were turned on
  | 'off' // the project (or the default) says never
  | 'ignored' // the folder is marked "not a project"
  | 'pending' // waiting for the user's yes
  | 'unsummarisable' // the transcript is gone
  | Job['status'];

export interface Job {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'skipped';
  attempts: number;
  error: string | null;
  note: string | null;
  by: string | null;
  createdAt: number;
  updatedAt: number;
}

export const jobsDir = () => path.join(config.dataDir, 'jobs');
const jobFile = (id: string) => path.join(jobsDir(), `${id.replace(/[^\w.-]/g, '_')}.json`);

export async function readJob(id: string): Promise<Job | null> {
  try { return JSON.parse(await fs.readFile(jobFile(id), 'utf8')); } catch { return null; }
}

export async function readJobs(): Promise<Map<string, Job>> {
  let names: string[];
  try { names = (await fs.readdir(jobsDir())).filter((n) => n.endsWith('.json')); } catch { return new Map(); }
  const jobs = await Promise.all(names.map(async (n) => {
    try { return JSON.parse(await fs.readFile(path.join(jobsDir(), n), 'utf8')) as Job; } catch { return null; }
  }));
  return new Map((jobs.filter(Boolean) as Job[]).map((j) => [j.id, j]));
}

async function saveJob(j: Job) {
  await fs.mkdir(jobsDir(), { recursive: true });
  const file = jobFile(j.id);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ ...j, updatedAt: Date.now() }, null, 2));
  await fs.rename(tmp, file);
}

const exists = (f: string) => fs.access(f).then(() => true, () => false);

/** A session counts as ended after this long without activity (the live tracker's rule). */
export const endedAt = (r: Pick<SessionRecord, 'lastEventAt'>) => r.lastEventAt + LIVE.endAfterMs;

/** The mode that applies to a session: its project note's `summaries:` line, or the default. */
export async function modeFor(item: Pick<HistoryItem, 'project' | 'placement'>, settings: Settings): Promise<SummaryMode | 'ignored'> {
  if (item.placement === 'ignored') return 'ignored';
  const own = item.project ? (await projectRefs()).find((p) => p.rel === item.project!.rel)?.summaries : null;
  return own === 'off' || own === 'ask' || own === 'auto' ? own : settings.summaries.default;
}

/** Where a session stands. Pure apart from the mode lookup and a file check. */
export async function statusOf(item: HistoryItem, job: Job | null, settings: Settings, now = Date.now()): Promise<SummaryStatus> {
  if (job) return job.status;
  if (now < endedAt(item)) return 'live';
  const since = settings.summaries.since ? Date.parse(settings.summaries.since) : null;
  if (since === null || endedAt(item) < since) return 'before';
  const mode = await modeFor(item, settings);
  if (mode === 'ignored') return 'ignored';
  if (mode === 'off') return 'off';
  const rec = await readRecord(item.id);
  if (!rec || !(await exists(rec.transcript))) return 'unsummarisable';
  return 'pending'; // 'auto' sessions are queued by tick() and show as queued from then on
}

export interface SessionSummaryView extends HistoryItem { status: SummaryStatus; job: Job | null }

/** History with each session's summary status, for the UI. */
export async function summaryViews(items: HistoryItem[]): Promise<SessionSummaryView[]> {
  const [jobs, settings] = await Promise.all([readJobs(), readSettings()]);
  return Promise.all(items.map(async (it) => {
    const job = jobs.get(it.id) ?? null;
    return { ...it, job, status: await statusOf(it, job, settings) };
  }));
}

/** Sessions waiting for a yes, oldest first. */
export async function pendingSessions(): Promise<SessionSummaryView[]> {
  const settings = await readSettings();
  if (!settings.summaries.since) return [];
  const views = await summaryViews(await historySince(Date.parse(settings.summaries.since) - LIVE.endAfterMs));
  return views.filter((v) => v.status === 'pending').reverse();
}

// ---------------------------------------------------------------- user actions

async function viewsOf(ids: string[]): Promise<SessionSummaryView[]> {
  const settings = await readSettings();
  const since = settings.summaries.since ? Date.parse(settings.summaries.since) - LIVE.endAfterMs : 0;
  const all = await summaryViews(await historySince(since));
  return ids.map((id) => {
    const v = all.find((x) => x.id === id);
    if (!v) throw new Error('Unknown session. Refresh and try again.');
    return v;
  });
}

const newJob = (id: string, status: Job['status']): Job => ({ id, status, attempts: 0, error: null, note: null, by: null, createdAt: Date.now(), updatedAt: Date.now() });

/** The user said yes: queue these sessions (one, or "Save all"). */
export async function approve(ids: string | string[]) {
  assertWritable();
  const list = [ids].flat();
  const views = await viewsOf(list);
  if (views.some((v) => v.status !== 'pending' && v.status !== 'skipped')) throw new Error('A session can’t be summarised right now. Refresh and try again.');
  for (const v of views) await saveJob(newJob(v.id, 'queued'));
  kick();
}

/** The user said no: never ask again for these sessions. */
export async function skip(ids: string | string[]) {
  const views = await viewsOf([ids].flat());
  if (views.some((v) => v.status !== 'pending')) throw new Error('Only a session waiting for you can be skipped.');
  for (const v of views) await saveJob(newJob(v.id, 'skipped'));
}

/** "Always save for this project": the project note gets `summaries: auto`, and its waiting sessions are queued. */
export async function alwaysSave(projectRel: string) {
  assertWritable();
  if (!(await projectRefs()).some((p) => p.rel === projectRel)) throw new Error('Unknown project.');
  await updateNote(projectRel, (raw) => setFrontmatter(raw, { summaries: 'auto' }));
  invalidateSessions();
  const waiting = (await pendingSessions()).filter((v) => v.project?.rel === projectRel);
  for (const v of waiting) await saveJob(newJob(v.id, 'queued'));
  kick();
}

export async function retry(id: string) {
  assertWritable();
  const job = await readJob(id);
  if (job?.status !== 'failed') throw new Error('Only a failed summary can be retried.');
  await saveJob({ ...job, status: 'queued', error: null });
  kick();
}

/** Turn summaries on (from now) or change how they work. */
export async function configure(patch: Partial<Pick<Settings['summaries'], 'default' | 'cli'>> & { start?: boolean }) {
  const { start, ...rest } = patch;
  await updateSettings({ summaries: { ...rest, ...(start ? { since: new Date().toISOString() } : {}) } });
}

// ---------------------------------------------------------------- worker

const worker = ((globalThis as { __palaceSummaryWorker?: { running: Promise<void> | null; recovered: boolean; tickAt: number } })
  .__palaceSummaryWorker ??= { running: null, recovered: false, tickAt: 0 });

/** Summarise one queued session. Exported for tests. */
export async function runJob(job: Job): Promise<Job> {
  await saveJob({ ...job, status: 'running', attempts: job.attempts + 1 });
  try {
    const settings = await readSettings();
    const rec = await readRecord(job.id);
    if (!rec) throw new Error('The session record is gone.');
    const v = (await historySince(rec.lastEventAt - 1)).find((x) => x.id === job.id);
    if (!v) throw new Error('The session record is gone.');
    // Consent again, right before reading: the user may have changed their mind since queueing.
    const mode = await modeFor(v, settings);
    if (mode === 'off' || mode === 'ignored') {
      const skipped = { ...job, status: 'skipped' as const, error: 'Summaries were turned off for this project or folder.' };
      await saveJob(skipped);
      return skipped;
    }
    if (!(await exists(rec.transcript))) throw new Error('The agent has deleted this session’s transcript, so it can’t be summarised.');
    const text = await transcriptText(rec.transcript, rec.agent);
    if (!text.trim()) throw new Error('The transcript has no conversation in it.');
    const redacted = redact(text, settings.redaction).text;
    const { summary, by } = await summarise(redacted, {
      project: v.project?.name ?? null, folder: v.cwdShort, branch: rec.branch, files: rec.files,
      started: rec.startedAt ? new Date(rec.startedAt).toISOString() : null, ended: new Date(rec.lastEventAt).toISOString(),
    }, { cli: settings.summaries.cli, model: summaryModel(settings.summaries), redaction: settings.redaction });
    const note = await writeSessionNote(rec, v.project ? { rel: v.project.rel, name: v.project.name } : null, summary, by, settings.summaries.sessionsDir);
    const done = { ...job, attempts: job.attempts + 1, status: 'done' as const, error: null, note, by };
    await saveJob(done);
    return done;
  } catch (e) {
    const failed = { ...job, attempts: job.attempts + 1, status: 'failed' as const, error: e instanceof Error ? e.message : String(e) };
    await saveJob(failed);
    return failed;
  }
}

/** Work through the queue, one summary at a time. */
function kick(): Promise<void> {
  if (worker.running) return worker.running;
  worker.running = (async () => {
    // After a restart, a job left "running" was interrupted: put it back in the queue.
    if (!worker.recovered) {
      worker.recovered = true;
      for (const j of (await readJobs()).values()) if (j.status === 'running') await saveJob({ ...j, status: 'queued' });
    }
    for (;;) {
      const next = [...(await readJobs()).values()].filter((j) => j.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!next || config.readOnly) break;
      await runJob(next);
    }
  })().finally(() => { worker.running = null; });
  return worker.running;
}

/** Queue sessions from `auto` projects that have ended, then run the queue. Throttled; called from the live stream. */
export async function tick(force = false): Promise<void> {
  if (!force && Date.now() - worker.tickAt < 60_000) return;
  worker.tickAt = Date.now();
  if (config.readOnly) return;
  const settings = await readSettings();
  if (settings.summaries.since) {
    for (const v of await summaryViews(await historySince(Date.parse(settings.summaries.since) - LIVE.endAfterMs))) {
      if (v.status === 'pending' && (await modeFor(v, settings)) === 'auto') await saveJob(newJob(v.id, 'queued'));
    }
  }
  await kick();
}

// ---------------------------------------------------------------- transcript retention

/** Claude Code deletes transcripts after `cleanupPeriodDays` (30 by default). Codex keeps them. */
export const CLAUDE_KEEPS_DAYS = 30;

export interface RetentionWarning { count: number; daysLeft: number; ids: string[] }

/**
 * Waiting sessions whose transcript the agent will delete soon: shown by Atlas at Dawn.
 * A session is at risk from `warnDays` after it ended.
 */
export async function retentionWarning(now = Date.now()): Promise<RetentionWarning | null> {
  const settings = await readSettings();
  const risky = (await pendingSessions()).filter((v) => v.agent === 'claude' && now - v.lastEventAt >= settings.summaries.warnDays * 86_400_000);
  if (!risky.length) return null;
  const oldest = Math.min(...risky.map((v) => v.lastEventAt));
  return { count: risky.length, daysLeft: Math.max(0, Math.ceil(CLAUDE_KEEPS_DAYS - (now - oldest) / 86_400_000)), ids: risky.map((v) => v.id) };
}
