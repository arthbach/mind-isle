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

/** Text under a `##`/`###` heading whose name starts with `name`, up to the next heading of the same or higher level. */
export function section(body: string, name: string): string {
  const lines = body.split(/\r?\n/);
  const want = norm(name);
  const start = lines.findIndex((l) => /^#{2,3}\s+/.test(l) && norm(l.replace(/^#+\s+/, '')).startsWith(want));
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
