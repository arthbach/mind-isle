// Worldview banners: values, faith and spirituality, civic views. The most sensitive thing Mind Isle can hold.
// Rules (roadmap §4): opt-in with a scope, owner only, proposals with verbatim evidence, no demographic inference,
// contained (own folder, never on /hall or the island, never AI context unless a banner allows it), and Forget.
import fs from 'node:fs/promises';
import path from 'node:path';
import { today } from '../clock';
import { config } from '../config';
import { readSettings, summaryModel, updateSettings, type WorldviewScan } from '../settings';
import { redact } from '../summaries/redact';
import { askCli } from '../summaries/summarise';
import type { WorldviewArea } from '../types';
import { loadNotes, type Note } from '../vault/reader';
import { assertWritable, resolveInVault, setFrontmatter, updateNote } from '../vault/writer';

export const WORLDVIEW_DIR = 'Mind Isle/Worldview';
export const WORLDVIEW = {
  /** Most proposals one scan may add. */
  maxProposals: 12,
  /** Text per CLI call. */
  chunkChars: 120_000,
  minPassage: 20,
  maxPassage: 600,
};

// ---------------------------------------------------------------- choosing what may be read

const isMindIsle = (n: Note) => n.rel.startsWith('Mind Isle/');
const typeOf = (n: Note) => String(n.fm.type ?? '').toLowerCase().trim();

/** The notes a scope allows. Person notes are never read: nothing is ever inferred about other people. */
export function notesInScope(notes: Note[], scan: WorldviewScan | null, folders: string[]): Note[] {
  const usable = notes.filter((n) => !isMindIsle(n) && typeOf(n) !== 'person');
  if (scan === 'all') return usable;
  if (scan === 'folders') return usable.filter((n) => folders.some((f) => n.rel.startsWith(`${f}/`)));
  if (scan === 'sessions') return usable.filter((n) => typeOf(n) === 'session');
  return []; // interview, off, revoked, or never chosen: nothing is read
}

const FIRST_PERSON = /\bI\b|\bI['’](?:m|ve|d|ll)\b|\b[Mm](?:y|e|yself|ine)\b/;
// Someone else speaking: "Maya: …", "> quote", "she said…". The owner's own reported speech ("I said") is kept.
const SPEAKER = /^\s*(?:[-*+]\s+)?\**[A-Z][^:\n]{0,40}?\**\s*:\s/;
// Reporting verbs; such a line is dropped unless every one of them has "I" as its subject.
const REPORTED = /(\S+)\s+(?:said|says|told|argued|argues|thinks|believes|claims|asked|feels)\b|\baccording to\b/gi;
const reportsOthers = (line: string) => [...line.matchAll(REPORTED)].some((m) => m[1] !== 'I');
const QUOTED = /“[^”]{8,}”|"[^"]{8,}"/g;

/**
 * Lines the owner wrote about themself, in the first person. Exported for tests.
 * Session notes are about the owner by design, so their Decisions are kept as they are.
 */
export function ownerPassages(n: Note): string[] {
  const body = n.body;
  const out: string[] = [];
  if (typeOf(n) === 'session') {
    const m = body.match(/## Decisions\n([\s\S]*?)(?:\n## |$)/);
    for (const l of (m?.[1] ?? '').split('\n')) { const t = l.replace(/^\s*-\s+/, '').trim(); if (t.length >= WORLDVIEW.minPassage) out.push(t); }
    return out;
  }
  let fenced = false;
  for (const raw of body.split('\n')) {
    if (/^\s*```/.test(raw)) { fenced = !fenced; continue; }
    if (fenced || /^\s*(>|#|\|)/.test(raw) || SPEAKER.test(raw)) continue;
    if (reportsOthers(raw)) continue;
    const line = raw.replace(QUOTED, '…').replace(/^\s*(?:[-*+]|\d+\.)\s+(\[.\]\s+)?/, '').trim();
    if (line.length < WORLDVIEW.minPassage || !FIRST_PERSON.test(line)) continue;
    out.push(line.length > WORLDVIEW.maxPassage ? `${line.slice(0, WORLDVIEW.maxPassage)}…` : line);
  }
  return out;
}

// ---------------------------------------------------------------- the scan

export interface Proposal { statement: string; area: WorldviewArea; evidence: { quote: string; note: string }[] }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['banners'],
  properties: {
    banners: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement', 'area', 'quotes'],
        properties: {
          statement: { type: 'string', description: 'The belief in the first person, one short sentence, in the owner’s own spirit' },
          area: { type: 'string', enum: ['values', 'faith', 'civic'] },
          quotes: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['passage', 'quote'],
              properties: { passage: { type: 'integer' }, quote: { type: 'string', description: 'Exact words copied from that passage' } },
            },
          },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `WORLDVIEW SCAN. You help one person notice their own values, faith or spirituality, and civic or political views,
from passages they wrote themselves. Propose at most ${WORLDVIEW.maxProposals} beliefs, only where their own words clearly show one.
Rules you must follow:
- Only the writer's own views. Ignore anything that describes, quotes or reports what other people think.
- Every belief needs at least one quote copied word for word from a passage, with that passage's number.
- Never infer race, ethnicity, nationality, gender, sexuality, health or any other personal trait. Beliefs only.
- Write each statement in the first person ("I …"), plain and short. Don't moralise or judge.
- If nothing clearly qualifies, return an empty list. Answer with JSON only.`;

const DEMOGRAPHIC = /\b(race|racial|ethnic|ethnicity|ancestry|skin colou?r|caste|sexual orientation|sexuality|gender identity)\b/i;
const norm = (s: string) => s.replace(/[“”"’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

/** Keep only proposals whose quotes really are in the passages they cite. Exported for tests. */
export function checkProposals(v: unknown, passages: { note: string; text: string }[]): Proposal[] | null {
  if (!v || typeof v !== 'object' || !Array.isArray((v as { banners?: unknown }).banners)) return null;
  const out: Proposal[] = [];
  for (const b of (v as { banners: unknown[] }).banners) {
    const o = (b ?? {}) as Record<string, unknown>;
    const statement = typeof o.statement === 'string' ? o.statement.replace(/\s+/g, ' ').trim() : '';
    const area = o.area === 'faith' || o.area === 'civic' || o.area === 'values' ? o.area : null;
    if (!statement || statement.length > 160 || !area || DEMOGRAPHIC.test(statement)) continue;
    const evidence = (Array.isArray(o.quotes) ? o.quotes : []).flatMap((q) => {
      const { passage, quote } = (q ?? {}) as { passage?: unknown; quote?: unknown };
      const p = typeof passage === 'number' ? passages[passage] : undefined;
      if (!p || typeof quote !== 'string' || quote.trim().length < 12) return [];
      // Evidence must be the owner's words, exactly: anything the model paraphrased or invented is dropped.
      return norm(p.text).includes(norm(quote)) ? [{ quote: quote.trim(), note: p.note }] : [];
    });
    if (evidence.length) out.push({ statement, area, evidence });
  }
  return out;
}

export interface ScanState {
  status: 'idle' | 'running' | 'done' | 'failed';
  scope: WorldviewScan | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Notes the scan was allowed to read (vault paths), for transparency and tests. */
  notesRead: string[];
  proposed: number;
  error: string | null;
}

const stateFile = () => path.join(config.dataDir, 'worldview', 'scan.json');
export async function readScanState(): Promise<ScanState> {
  try { return JSON.parse(await fs.readFile(stateFile(), 'utf8')); } catch {
    return { status: 'idle', scope: null, startedAt: null, finishedAt: null, notesRead: [], proposed: 0, error: null };
  }
}
async function saveScanState(s: ScanState) {
  await fs.mkdir(path.dirname(stateFile()), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify(s, null, 2));
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100).replace(/[. ]+$/, '');
const noteLink = (rel: string) => `[[${path.basename(rel, '.md')}]]`;

/** Write one proposed banner note in the worldview folder. */
export async function writeBanner(p: { statement: string; area: WorldviewArea; source: 'scan' | 'interview'; evidence: { quote: string; note: string | null }[]; question?: string }) {
  const rel = `${WORLDVIEW_DIR}/${safeName(p.statement) || 'Banner'}.md`;
  const q = (s: string) => JSON.stringify(s);
  const content = [
    '---',
    'type: belief',
    'domain: worldview',
    `area: ${p.area}`,
    `statement: ${q(p.statement)}`,
    'status: proposed',
    'sensitive: true',
    `source: ${p.source}`,
    'use_in_ai: false',
    `created: ${today()}`,
    'evidence:',
    ...p.evidence.flatMap((e) => [`  - quote: ${q(e.quote)}`, `    note: ${e.note ? q(noteLink(e.note)) : 'null'}`]),
    '---',
    '',
    `# ${p.statement}`,
    '',
    p.source === 'interview' ? `Your answer at Dusk${p.question ? ` to “${p.question}”` : ''}:` : 'Proposed by Mind Isle from your own words. Confirm, adjust or reject it on the Banner Wall.',
    '',
    ...p.evidence.map((e) => `> ${e.quote.replace(/\n/g, '\n> ')}${e.note ? `\n> — ${noteLink(e.note)}` : ''}\n`),
  ].join('\n');
  await updateNote(rel, (raw) => raw, content);
  return rel;
}

const running = ((globalThis as { __palaceWorldviewScan?: { p: Promise<void> | null } }).__palaceWorldviewScan ??= { p: null });

/** Read the notes in scope and propose banners. Runs in the background; progress is in readScanState(). */
export async function runScan(): Promise<void> {
  assertWritable();
  if (running.p) return running.p;
  const settings = await readSettings();
  const { scan, folders } = settings.worldview;
  if (scan !== 'all' && scan !== 'folders' && scan !== 'sessions') throw new Error('Choose what Mind Isle may read first.');
  running.p = (async () => {
    const state: ScanState = { status: 'running', scope: scan, startedAt: Date.now(), finishedAt: null, notesRead: [], proposed: 0, error: null };
    await saveScanState(state);
    try {
      const notes = notesInScope(await loadNotes(), scan, folders);
      state.notesRead = notes.map((n) => n.rel);
      const passages = notes.flatMap((n) => ownerPassages(n).map((t) => ({ note: n.rel, text: redact(t, settings.redaction).text })));
      const existing = new Set((await loadNotes()).filter((n) => n.rel.startsWith(`${WORLDVIEW_DIR}/`)).map((n) => norm(String(n.fm.statement ?? n.name))));
      const found: Proposal[] = [];
      for (let i = 0; i < passages.length;) {
        const batch: string[] = [];
        let size = 0;
        const start = i;
        while (i < passages.length && size + passages[i].text.length < WORLDVIEW.chunkChars) { batch.push(`[${i}] ${passages[i].text}`); size += passages[i].text.length; i++; }
        if (i === start) i++; // a single passage over the limit is skipped
        const prompt = `${INSTRUCTIONS}\n\n<passages>\n${batch.join('\n')}\n</passages>`;
        const { value } = await askCli(settings.summaries.cli, summaryModel(settings.summaries), prompt, SCHEMA, (v) => checkProposals(v, passages));
        found.push(...value);
      }
      const seen = new Set(existing);
      const fresh = found.filter((p) => { const k = norm(p.statement); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => b.evidence.length - a.evidence.length).slice(0, WORLDVIEW.maxProposals);
      for (const p of fresh) await writeBanner({ ...p, source: 'scan' });
      Object.assign(state, { status: 'done', finishedAt: Date.now(), proposed: fresh.length });
    } catch (e) {
      Object.assign(state, { status: 'failed', finishedAt: Date.now(), error: e instanceof Error ? e.message : String(e) });
    }
    await saveScanState(state);
  })().finally(() => { running.p = null; });
  return running.p;
}

// ---------------------------------------------------------------- choices, banners, Forget

/** The user's answer to "may Mind Isle look?". Scanning starts only when they press Scan. */
export async function chooseScope(scan: WorldviewScan, folders: string[] = [], interview?: boolean) {
  if (!['all', 'folders', 'sessions', 'interview', 'off'].includes(scan)) throw new Error('Unknown choice.');
  const top = new Set((await loadNotes()).map((n) => n.rel.split('/')[0]).filter((f) => !f.endsWith('.md')));
  const chosen = scan === 'folders' ? folders.filter((f) => top.has(f)) : [];
  if (scan === 'folders' && !chosen.length) throw new Error('Pick at least one folder.');
  await updateSettings({ worldview: { scan, folders: chosen, ...(interview === undefined ? { interview: scan === 'interview' } : { interview }) } });
}

async function worldviewNote(rel: string): Promise<Note> {
  if (!rel.startsWith(`${WORLDVIEW_DIR}/`)) throw new Error('Not a worldview banner.');
  const n = (await loadNotes()).find((x) => x.rel === rel);
  if (!n) throw new Error('Banner not found. Refresh and try again.');
  return n;
}

/** "Not me": a proposal is deleted outright rather than kept as rejected. One the user wrote is only marked. */
export async function rejectBanner(rel: string) {
  assertWritable();
  const n = await worldviewNote(rel);
  if (String(n.fm.source ?? '') === 'scan' || String(n.fm.source ?? '') === 'interview') await fs.unlink(resolveInVault(rel));
  else await updateNote(rel, (raw) => setFrontmatter(raw, { status: 'rejected' }));
}

export async function setUseInAi(rel: string, on: boolean) {
  assertWritable();
  await worldviewNote(rel);
  await updateNote(rel, (raw) => setFrontmatter(raw, { use_in_ai: on }));
}

/**
 * Forget: delete every banner Mind Isle proposed. Banners the user already confirmed or adjusted are deleted
 * only with `includeConfirmed` (the UI asks a second time). Banners the user wrote are never touched.
 */
export async function forget(includeConfirmed: boolean): Promise<number> {
  assertWritable();
  const mine = (await loadNotes()).filter((n) => n.rel.startsWith(`${WORLDVIEW_DIR}/`) && ['scan', 'interview'].includes(String(n.fm.source ?? '')));
  let removed = 0;
  for (const n of mine) {
    const decided = ['confirmed', 'adjusted'].includes(String(n.fm.status ?? ''));
    if (decided && !includeConfirmed) continue;
    await fs.unlink(resolveInVault(n.rel));
    removed++;
  }
  await updateSettings({ worldview: { scan: 'revoked', folders: [], interview: false } });
  await fs.rm(path.dirname(stateFile()), { recursive: true, force: true });
  return removed;
}

// ---------------------------------------------------------------- interview at Dusk

export const QUESTIONS = [
  'What would you never compromise on, even for money?',
  'What does a good society look like to you?',
  'What do you do when your faith or values and your work disagree?',
  'Who do you feel you owe something to, and why?',
  'What makes a life well lived?',
  'When is it right to break a rule?',
  'What should people in power owe everyone else?',
  'What gives you a sense of meaning when work doesn’t?',
  'What did you believe five years ago that you don’t now?',
  'What is something you think most people get wrong about fairness?',
  'Where do you find peace when things are hard?',
  'What do you want your work to stand for?',
];

const interviewFile = () => path.join(config.dataDir, 'worldview', 'interview.json');
type InterviewLog = Record<string, { q: number; status: 'answered' | 'skipped' }>;
async function readInterview(): Promise<InterviewLog> {
  try { return JSON.parse(await fs.readFile(interviewFile(), 'utf8')); } catch { return {}; }
}

/** Today's question, or null when the interview is off or today's is done. */
export async function todaysQuestion(): Promise<{ index: number; text: string } | null> {
  const s = await readSettings();
  if (!s.worldview.interview || s.worldview.scan === 'revoked' || config.readOnly) return null;
  const log = await readInterview();
  const day = today();
  if (log[day]) return null;
  const used = new Set(Object.values(log).map((e) => e.q));
  const dayNo = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const order = QUESTIONS.map((_, i) => (dayNo + i) % QUESTIONS.length);
  const index = order.find((i) => !used.has(i)) ?? order[0];
  return { index, text: QUESTIONS[index] };
}

async function logInterview(index: number, status: 'answered' | 'skipped') {
  const log = await readInterview();
  log[today()] = { q: index, status };
  await fs.mkdir(path.dirname(interviewFile()), { recursive: true });
  await fs.writeFile(interviewFile(), JSON.stringify(log, null, 2));
}

/** The answer becomes a proposed banner, in the user's own words. */
export async function answerQuestion(index: number, answer: string): Promise<string> {
  assertWritable();
  const q = await todaysQuestion();
  if (!q || q.index !== index) throw new Error('This question has already been answered today.');
  const text = answer.replace(/\s+/g, ' ').trim();
  if (text.length < 3) throw new Error('Write a few words first.');
  const first = text.match(/^.{3,160}?[.!?](?=\s|$)/)?.[0] ?? text.slice(0, 160);
  const area: WorldviewArea = /faith|god|pray|spirit|religio|church|mosque|temple/i.test(`${q.text} ${text}`) ? 'faith'
    : /society|power|govern|politic|vote|law|fair/i.test(q.text) ? 'civic' : 'values';
  const rel = await writeBanner({ statement: first, area, source: 'interview', evidence: [{ quote: text.slice(0, 1000), note: null }], question: q.text });
  await logInterview(index, 'answered');
  return rel;
}

export async function skipQuestion(index: number) {
  const q = await todaysQuestion();
  if (q?.index === index) await logInterview(index, 'skipped');
}
