import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { config } from '../config';
import { FRONTMATTER_RE } from './markdown';

export function assertWritable() {
  if (config.readOnly) throw new Error('Mind Isle is in read-only mode (PALACE_READ_ONLY=true).');
}

/** Resolve a vault-relative path, refusing anything that escapes the vault or is not a note. */
export function resolveInVault(rel: string): string {
  const abs = path.resolve(config.vaultPath, rel);
  if (!abs.startsWith(config.vaultPath + path.sep) || !abs.endsWith('.md')) {
    throw new Error('Refusing to touch a file outside the vault.');
  }
  return abs;
}

// ---------------------------------------------------------------- frontmatter

type Scalar = string | number | boolean | null;

function yamlScalar(v: Scalar): string {
  if (v === null || v === '') return '';
  if (typeof v !== 'string') return String(v);
  const plain = /^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(v) && !/^(true|false|null|yes|no|on|off|~)$/i.test(v) && !/ $/.test(v);
  return plain ? v : JSON.stringify(v);
}

/** Strict parse: unlike reading, writing refuses anything the YAML parser had to repair. */
function parseYaml(text: string): Record<string, unknown> {
  const doc = parseDocument(text, { uniqueKeys: false });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const v = doc.toJS();
  if (v === null || v === undefined) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Frontmatter is not a key/value map.');
  return v as Record<string, unknown>;
}

/** Lines [start, end) that belong to a top-level key: its own line plus indented or list continuation lines. */
function keyRange(lines: string[], key: string): [number, number] | null {
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (/^[ \t]+\S/.test(lines[end]) || /^-(\s|$)/.test(lines[end]))) end++;
  return [start, end];
}

/**
 * Edit frontmatter by replacing only the lines of the keys being changed, so comments,
 * ordering and formatting elsewhere survive. The result is re-parsed and refused if it
 * is invalid or if any other key's value changed.
 */
function editFrontmatter(raw: string, keys: string[], mutate: (lines: string[]) => void): string {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const m = raw.match(FRONTMATTER_RE);
  const lines = m ? m[1].split(/\r?\n/) : [];
  let before: Record<string, unknown>;
  try {
    before = m ? parseYaml(m[1]) : {};
  } catch {
    throw new Error('This note’s frontmatter is not valid YAML, so it was left untouched. Fix it in Obsidian first.');
  }
  mutate(lines);
  let after: Record<string, unknown>;
  try {
    after = parseYaml(lines.join('\n'));
  } catch {
    throw new Error('Refusing to save: the edit would produce invalid frontmatter.');
  }
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!keys.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      throw new Error(`Refusing to save: "${k}" would change unexpectedly.`);
    }
  }
  const block = `---${eol}${lines.join(eol)}${eol}---${eol}`;
  return m ? block + raw.slice(m[0].length) : `${block}${eol}${raw}`;
}

/** Set scalar top-level frontmatter fields (replacing any previous value, including block values). */
export function setFrontmatter(raw: string, patch: Record<string, Scalar>): string {
  return editFrontmatter(raw, Object.keys(patch), (lines) => {
    for (const [key, value] of Object.entries(patch)) {
      const v = yamlScalar(value);
      const line = v ? `${key}: ${v}` : `${key}:`;
      const r = keyRange(lines, key);
      if (r) lines.splice(r[0], r[1] - r[0], line);
      else lines.push(line);
    }
  });
}

/** Set a list field, keeping its existing style (flow `[a, b]` or block `- a`). */
export function setFrontmatterList(raw: string, key: string, values: string[]): string {
  return editFrontmatter(raw, [key], (lines) => {
    const r = keyRange(lines, key);
    const item = (v: string) => {
      const s = yamlScalar(v);
      return /[,[\]{}#:]/.test(s) && !s.startsWith('"') ? JSON.stringify(v) : s || '""';
    };
    let rendered: string[];
    const blockItem = r ? lines.slice(r[0] + 1, r[1]).find((l) => /^\s*-\s/.test(l)) : undefined;
    if (r && blockItem && values.length) {
      const indent = blockItem.match(/^(\s*)-/)?.[1] ?? '  ';
      rendered = [`${key}:`, ...values.map((v) => `${indent}- ${item(v)}`)];
    } else {
      rendered = [`${key}: [${values.map(item).join(', ')}]`];
    }
    if (r) lines.splice(r[0], r[1] - r[0], ...rendered);
    else lines.push(...rendered);
  });
}

/** Read a list field from raw note text. */
export function readFrontmatterList(raw: string, key: string): string[] {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return [];
  try {
    const v = parseYaml(m[1])[key];
    return Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- sections

const norm = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();

/** Replace the body of each `## Heading` (creating it at the end if missing). Other sections are left alone. */
export function upsertSections(raw: string, map: Record<string, string>): string {
  const m = raw.match(FRONTMATTER_RE);
  const head = m ? m[0] : '';
  let body = m ? raw.slice(head.length) : raw;
  for (const [heading, content] of Object.entries(map)) {
    const lines = body.split('\n');
    const block = content.trim() ? content.trimEnd().split('\n') : [];
    const start = lines.findIndex((l) => /^##\s+/.test(l) && norm(l.replace(/^##\s+/, '')) === norm(heading));
    if (start >= 0) {
      let end = lines.findIndex((l, i) => i > start && /^#{1,2}\s+/.test(l));
      if (end < 0) end = lines.length;
      lines.splice(start + 1, end - start - 1, ...block, '');
      body = lines.join('\n');
    } else {
      body = `${body.replace(/\s*$/, '')}\n\n## ${heading}\n${block.join('\n')}\n`;
    }
  }
  return head + body;
}

// ---------------------------------------------------------------- safe writes

async function readOrNull(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Write through a temp file in the same folder, then rename, so a crash never leaves half a note. */
async function atomicWrite(abs: string, content: string) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${Date.now()}.palace-tmp`);
  try {
    await fs.writeFile(tmp, content, 'utf8');
    const st = await fs.stat(abs).catch(() => null);
    if (st) await fs.chmod(tmp, st.mode);
    await fs.rename(tmp, abs);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

/**
 * Read a note, transform it, and write it back only if it changed.
 * If the file changes on disk between reading and writing (e.g. Obsidian saved it),
 * the transform is re-applied to the new content. `fn` must be pure: it may run more than once.
 * Returns whether anything was written.
 */
export async function updateNote(rel: string, fn: (raw: string) => string, createWith?: string): Promise<boolean> {
  assertWritable();
  const abs = resolveInVault(rel);
  let current = await readOrNull(abs);
  if (current === null && createWith === undefined) throw new Error(`Note not found: ${rel}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = current ?? (createWith as string);
    const next = fn(base);
    if (current !== null && next === current) return false;
    const latest = await readOrNull(abs);
    if (latest !== current) {
      current = latest;
      continue;
    }
    await atomicWrite(abs, next);
    return true;
  }
  throw new Error(`"${rel}" kept changing while saving. Try again in a moment.`);
}
