import { parse } from 'yaml';

export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { fm: {}, body: raw };
  let fm: Record<string, unknown> = {};
  try {
    // YAML 1.2 core schema: dates stay strings, which is what we want.
    const v = parse(m[1], { strict: false, uniqueKeys: false, logLevel: 'silent' });
    if (v && typeof v === 'object' && !Array.isArray(v)) fm = v as Record<string, unknown>;
  } catch {
    // Malformed frontmatter: treat the note as untyped rather than failing the whole vault.
  }
  return { fm, body: raw.slice(m[0].length) };
}

const norm = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();

/**
 * Text under a `##`/`###` heading whose name starts with `name` (or is exactly `name`),
 * up to the next heading of the same or higher level.
 */
export function section(body: string, name: string, exact = false): string {
  const lines = body.split(/\r?\n/);
  const want = norm(name);
  const start = lines.findIndex((l) => {
    if (!/^#{2,3}\s+/.test(l)) return false;
    const h = norm(l.replace(/^#+\s+/, ''));
    return exact ? h === want : h.startsWith(want);
  });
  if (start < 0) return '';
  const level = (lines[start].match(/^#+/) as RegExpMatchArray)[0].length;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s+/);
    if (h && h[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

const LOG_LINE = /^[-*+]\s+(?:\*\*)?(\d{4}-\d{2}-\d{2})(?:\*\*)?\s*[:\u2013\u2014-]?\s*(.+)$/;

/** `- 2026-10-24 What happened` lines (bold dates and a colon or dash after the date are fine), newest first. */
export function projectLog(text: string): { date: string; text: string }[] {
  const out: { date: string; text: string }[] = [];
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(LOG_LINE);
    if (m) out.push({ date: m[1], text: m[2].trim() });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Add a dated line to a `## Log` body: after any lines from the same day or later, before older ones. Exact repeats are ignored. */
export function addLogLine(text: string, date: string, entry: string): string {
  const line = `- ${date} ${entry}`;
  const lines = text.trim() ? text.trim().split(/\r?\n/) : [];
  if (lines.some((l) => l.trim() === line)) return text;
  let at = lines.findIndex((l) => { const m = l.match(LOG_LINE); return m !== null && m[1] < date; });
  if (at < 0) {
    // Newer than nothing: go after the last dated line, or first if there are none.
    const last = lines.map((l) => LOG_LINE.test(l)).lastIndexOf(true);
    at = last + 1;
  }
  lines.splice(at, 0, line);
  return lines.join('\n').trim();
}

/** Top-level list items that are not tasks. */
export function bullets(text: string): string[] {
  const out: string[] = [];
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (m && !/^\[[ xX/>-]\]\s/.test(m[1])) out.push(m[1].trim());
  }
  return out;
}

export function firstParagraph(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;
  for (const l of lines) {
    if (/^\s*```/.test(l)) { inFence = !inFence; if (out.length) break; continue; }
    if (inFence) continue;
    const t = l.trim();
    if (!t) { if (out.length) break; continue; }
    if (/^(#|\||>\s*\[!|---|<!--|%%)/.test(t)) { if (out.length) break; continue; }
    out.push(t.replace(/^>\s?/, '').replace(/^[-*+]\s+(\[.\]\s+)?/, ''));
  }
  return out.join(' ');
}

export type TaskLine = { line: number; status: string; text: string };

const TASK_RE = /^\s*[-*+]\s+\[(.)\]\s+(.*)$/;

export function taskLines(raw: string): TaskLine[] {
  const out: TaskLine[] = [];
  raw.split(/\r?\n/).forEach((l, i) => {
    const m = l.match(TASK_RE);
    if (m) out.push({ line: i, status: m[1], text: m[2] });
  });
  return out;
}

export function setTaskStatus(line: string, status: string): string {
  return line.replace(/^(\s*[-*+]\s+\[).(\])/, `$1${status}$2`);
}
