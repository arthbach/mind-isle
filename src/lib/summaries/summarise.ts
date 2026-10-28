// Summarising one session with the user's own agent CLI, headless and isolated:
// no tools, no saved session, no user settings or hooks, run from an empty folder.
// The text it gets is already redacted; the answer is checked against a fixed shape and redacted again.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SummaryCli } from '../settings';
import { redact, type RedactOptions } from './redact';

export interface Summary {
  title: string;
  summary: string;
  decisions: string[];
  todos: string[];
  files_touched: string[];
  people_mentioned: string[];
}

export const SUMMARY = {
  /** Longer transcripts are summarised in parts of this size, then merged. */
  chunkChars: 300_000,
  timeoutMs: 5 * 60_000,
  maxItems: 12,
  /** Follow-ups become quests; more than a few per session would crowd the quest board. */
  maxTodos: 5,
};

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'decisions', 'todos', 'files_touched', 'people_mentioned'],
  properties: {
    title: { type: 'string', description: 'What the session was about, 3 to 8 words, no trailing period' },
    summary: { type: 'string', description: '2 to 5 plain sentences: what was done and where it ended' },
    decisions: { type: 'array', items: { type: 'string' }, description: 'Choices the user made or approved, one line each' },
    todos: { type: 'array', items: { type: 'string' }, description: 'At most 5 concrete follow-ups left open at the end, the most important first, one line each, starting with a verb' },
    files_touched: { type: 'array', items: { type: 'string' }, description: 'Main files changed, as paths' },
    people_mentioned: { type: 'array', items: { type: 'string' }, description: 'Full names of real people mentioned by the user' },
  },
} as const;

export interface SessionContext {
  project: string | null;
  folder: string;
  branch: string | null;
  started: string | null;
  ended: string;
  files: string[];
}

const INSTRUCTIONS = `You summarise one working session between a person and their AI coding agent, for the person's own notes.
Write in plain English, past tense, about what happened. Be specific and short. Never invent anything that isn't in the transcript.
Markers like [redacted: api key] stand for removed secrets: you may say a key was set, never guess its value.
Decisions are choices the person made or approved. Follow-ups are the few most important things left open at the end (at most 5). Leave a list empty when there is nothing.
Answer with JSON only, matching the schema.`;

export function buildPrompt(ctx: SessionContext, transcript: string, part?: { index: number; of: number }): string {
  return [
    INSTRUCTIONS,
    '',
    `Project: ${ctx.project ?? 'not set'} · Folder: ${ctx.folder}${ctx.branch ? ` · Branch: ${ctx.branch}` : ''}`,
    `Time: ${ctx.started ?? '?'} → ${ctx.ended}`,
    ctx.files.length ? `Files the agent edited: ${ctx.files.slice(0, 30).join(', ')}` : '',
    part ? `This is part ${part.index} of ${part.of} of a long session; summarise only this part.` : '',
    '',
    '<transcript>',
    transcript,
    '</transcript>',
  ].filter((l) => l !== '').join('\n');
}

const MERGE = `These are summaries of consecutive parts of one long session, as JSON, oldest first.
Merge them into one summary of the whole session with the same JSON shape. Drop follow-ups that a later part resolved.`;

const items = (v: unknown, max = SUMMARY.maxItems) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, max) : null;

/** Check the CLI's answer has the right shape. Returns null when it doesn't. Exported for tests. */
export function validate(v: unknown): Summary | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim() : '';
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  const lists = ['decisions', 'todos', 'files_touched', 'people_mentioned'].map((k) => items(o[k], k === 'files_touched' ? 40 : k === 'todos' ? SUMMARY.maxTodos : SUMMARY.maxItems));
  if (!title || title.length > 120 || !summary || lists.some((l) => l === null)) return null;
  const [decisions, todos, files_touched, people_mentioned] = lists as string[][];
  return { title, summary, decisions, todos, files_touched, people_mentioned };
}

/** Find the JSON object in a CLI answer (structured output, a bare object, or one inside a code fence). */
export function extractJson(stdout: string, cli: SummaryCli): unknown {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
  if (cli === 'claude') {
    const env = tryParse(stdout.trim());
    if (env && typeof env === 'object') {
      if (env.is_error) throw new Error(`The summariser reported an error: ${String(env.result ?? env.subtype ?? 'unknown').slice(0, 200)}`);
      if (env.structured_output) return env.structured_output;
      if (typeof env.result === 'string') return extractJson(env.result, 'codex');
    }
  }
  const text = stdout.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  return start >= 0 && end > start ? tryParse(body.slice(start, end + 1)) : undefined;
}

export interface CliRun { command: string; args: string[]; label: string }

/** Where a CLI is installed: the PATH, then the usual install folders (a server started from a GUI may have a short PATH). */
export async function findCli(cmd: SummaryCli): Promise<string | null> {
  // PALACE_SUMMARISER_CMD stands in for either CLI (see cliCommand).
  const custom = process.env.PALACE_SUMMARISER_CMD;
  if (custom) return (JSON.parse(custom) as string[])[0];
  const dirs = [
    ...(process.env.PATH ?? '').split(path.delimiter),
    path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin'), path.join(os.homedir(), '.bun', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin',
  ].filter(Boolean);
  const names = process.platform === 'win32' ? [`${cmd}.cmd`, `${cmd}.exe`, cmd] : [cmd];
  for (const d of dirs) for (const n of names) {
    const f = path.join(d, n);
    try { await fs.access(f, fs.constants.X_OK); return f; } catch { /* keep looking */ }
  }
  return null;
}

/** The command line for a CLI. PALACE_SUMMARISER_CMD (a JSON array) replaces it, for tests or another tool. */
export async function cliCommand(cli: SummaryCli, model: string | null, schemaFile: string, outFile: string): Promise<CliRun> {
  const custom = process.env.PALACE_SUMMARISER_CMD;
  if (custom) {
    const [command, ...args] = JSON.parse(custom) as string[];
    return { command, args, label: path.basename(command) };
  }
  const bin = (await findCli(cli)) ?? cli;
  if (cli === 'claude') {
    return {
      command: bin,
      args: ['-p', ...(model ? ['--model', model] : []), '--tools', '', '--no-session-persistence', '--setting-sources', '',
        '--strict-mcp-config', '--output-format', 'json', '--json-schema', await fs.readFile(schemaFile, 'utf8')],
      label: `claude -p${model ? ` (${model})` : ''}`,
    };
  }
  return {
    command: bin,
    args: ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-c', 'notify=[]',
      ...(model ? ['-m', model] : []), '--output-schema', schemaFile, '--output-last-message', outFile, '-'],
    label: `codex exec${model ? ` (${model})` : ''}`,
  };
}

function run(r: CliRun, input: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(r.command, r.args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, MIND_ISLE_SUMMARISER: '1' } });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('The summariser took longer than 5 minutes.')); }, SUMMARY.timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error((e as NodeJS.ErrnoException).code === 'ENOENT' ? `"${path.basename(r.command)}" isn't installed on this computer, or Mind Isle can't find it.` : e.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${r.label} exited with code ${code}: ${(err || out).trim().slice(-300)}`));
    });
    child.stdin.end(input);
  });
}

/**
 * One isolated CLI call that must answer JSON matching `schema`, checked by `check`; retried once on a bad answer.
 * Also used by the worldview scan.
 */
export async function askCli<T>(
  cli: SummaryCli, model: string | null, prompt: string, schema: object, check: (v: unknown) => T | null,
): Promise<{ value: T; by: string }> {
  // An empty folder of our own: no project files, CLAUDE.md or AGENTS.md get pulled in.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mind-isle-summary-'));
  try {
    const schemaFile = path.join(dir, 'schema.json');
    const outFile = path.join(dir, 'answer.json');
    await fs.writeFile(schemaFile, JSON.stringify(schema));
    const r = await cliCommand(cli, model, schemaFile, outFile);
    let last = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const stdout = await run(r, prompt, dir);
      const answer = cli === 'codex' && !process.env.PALACE_SUMMARISER_CMD ? await fs.readFile(outFile, 'utf8').catch(() => stdout) : stdout;
      const v = check(extractJson(answer, cli));
      if (v) return { value: v, by: r.label };
      last = answer.trim().slice(0, 200);
    }
    throw new Error(`The summariser's answer didn't have the expected shape, twice. It began: ${last || '(empty)'}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const ask = async (cli: SummaryCli, model: string | null, prompt: string) => {
  const { value, by } = await askCli(cli, model, prompt, SCHEMA, validate);
  return { summary: value, by };
};

/** Summarise a redacted transcript. Long ones go in parts, then one merge call. */
export async function summarise(
  redacted: string, ctx: SessionContext, opts: { cli: SummaryCli; model: string | null; redaction: RedactOptions },
): Promise<{ summary: Summary; by: string }> {
  let result: { summary: Summary; by: string };
  if (redacted.length <= SUMMARY.chunkChars) {
    result = await ask(opts.cli, opts.model, buildPrompt(ctx, redacted));
  } else {
    const parts: string[] = [];
    for (let i = 0; i < redacted.length; i += SUMMARY.chunkChars) parts.push(redacted.slice(i, i + SUMMARY.chunkChars));
    const partial: Summary[] = [];
    for (const [i, p] of parts.entries()) partial.push((await ask(opts.cli, opts.model, buildPrompt(ctx, p, { index: i + 1, of: parts.length }))).summary);
    result = await ask(opts.cli, opts.model, `${MERGE}\n\n${JSON.stringify(partial, null, 1)}`);
    result.by = `${result.by}, ${parts.length} parts`;
  }
  // The input had no secrets, but check the answer too.
  const clean = (t: string) => redact(t, opts.redaction).text;
  const s = result.summary;
  return {
    by: result.by,
    summary: {
      title: clean(s.title), summary: clean(s.summary), decisions: s.decisions.map(clean), todos: s.todos.map(clean),
      files_touched: s.files_touched, people_mentioned: s.people_mentioned.map(clean),
    },
  };
}
