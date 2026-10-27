import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readFrontmatterList, resolveInVault, setFrontmatter, setFrontmatterList, updateNote, upsertSections,
} from '@/lib/vault/writer';
import { read, vault, write } from './helpers';

const NOTE = `---
type: person   # keep this comment
aliases:
  - Maya
  - M
company: Northwind
---
## Context
Body stays.
`;

describe('setFrontmatter', () => {
  it('replaces only the target line and keeps comments and other keys', () => {
    const out = setFrontmatter(NOTE, { company: 'Acme Corp' });
    expect(out).toContain('type: person   # keep this comment');
    expect(out).toContain('  - Maya\n  - M\n');
    expect(out).toContain('company: Acme Corp');
    expect(out.endsWith('## Context\nBody stays.\n')).toBe(true);
  });

  it('adds missing keys at the end of the frontmatter', () => {
    expect(setFrontmatter(NOTE, { last_contact: '2026-10-26' })).toContain('company: Northwind\nlast_contact: 2026-10-26\n---');
  });

  it('replaces a block value entirely instead of leaving orphan list items', () => {
    const out = setFrontmatter(NOTE, { aliases: 'Maya' });
    expect(out).toContain('aliases: Maya\ncompany: Northwind');
    expect(out).not.toContain('  - M');
  });

  it('quotes values that YAML would misread', () => {
    const out = setFrontmatter('---\ntype: x\n---\n', { a: 'yes', b: 'has: colon', c: true, d: 3 });
    expect(out).toContain('a: "yes"');
    expect(out).toContain('b: "has: colon"');
    expect(out).toContain('c: true');
    expect(out).toContain('d: 3');
  });

  it('creates frontmatter when the note has none', () => {
    expect(setFrontmatter('Hello', { type: 'daily' })).toBe('---\ntype: daily\n---\n\nHello');
  });

  it('refuses to edit invalid frontmatter', () => {
    expect(() => setFrontmatter('---\ntype: [oops\n---\n', { a: 'b' })).toThrow(/not valid YAML/);
  });

  it('keeps CRLF line endings', () => {
    const out = setFrontmatter('---\r\ntype: x\r\n---\r\nbody\r\n', { a: 'b' });
    expect(out).toBe('---\r\ntype: x\r\na: b\r\n---\r\nbody\r\n');
  });
});

describe('setFrontmatterList', () => {
  it('keeps block style for existing block lists', () => {
    const out = setFrontmatterList(NOTE, 'aliases', ['Maya', 'M', 'Maya C']);
    expect(out).toContain('aliases:\n  - Maya\n  - M\n  - Maya C\ncompany: Northwind');
  });

  it('writes flow style for new lists and quotes risky items', () => {
    const out = setFrontmatterList('---\ntype: project\n---\n', 'repos', ['~/code/app', 'a, b']);
    expect(out).toContain('repos: ["~/code/app", "a, b"]');
    expect(readFrontmatterList(out, 'repos')).toEqual(['~/code/app', 'a, b']);
  });

  it('reads scalars as single-item lists', () => {
    expect(readFrontmatterList('---\nskipped: dawn\n---\n', 'skipped')).toEqual(['dawn']);
  });
});

describe('upsertSections', () => {
  it('replaces existing sections and appends new ones, leaving others alone', () => {
    const raw = '---\ntype: daily\n---\n## Log\nmine\n## Plan\n- [ ] old\n## Notes\nkeep\n';
    const out = upsertSections(raw, { Plan: '- [ ] new', Done: '- it' });
    expect(out).toContain('## Log\nmine\n## Plan\n- [ ] new\n\n## Notes\nkeep');
    expect(out.trimEnd().endsWith('## Done\n- it')).toBe(true);
    expect(out).not.toContain('old');
  });
});

describe('updateNote (write safety)', () => {
  it('refuses paths outside the vault', () => {
    expect(() => resolveInVault('../outside.md')).toThrow(/outside the vault/);
    expect(() => resolveInVault('note.txt')).toThrow(/outside the vault/);
  });

  it('creates a note from a template when missing, and reports no-op writes', async () => {
    expect(await updateNote('tmp/new.md', (r) => `${r}x`, '---\ntype: daily\n---\n')).toBe(true);
    expect(read('tmp/new.md')).toBe('---\ntype: daily\n---\nx');
    expect(await updateNote('tmp/new.md', (r) => r)).toBe(false);
  });

  it('re-applies the edit when the file changes underneath, keeping both edits', async () => {
    write('tmp/race.md', 'line one\n');
    let calls = 0;
    await updateNote('tmp/race.md', (raw) => {
      calls++;
      // Simulate Obsidian saving between our read and our write — only on the first pass.
      if (calls === 1) write('tmp/race.md', 'line one\nadded in Obsidian\n');
      return `${raw}added by palace\n`;
    });
    expect(calls).toBe(2);
    expect(read('tmp/race.md')).toBe('line one\nadded in Obsidian\nadded by palace\n');
  });

  it('gives up with an error if the file never stops changing', async () => {
    write('tmp/busy.md', '0');
    let n = 0;
    await expect(updateNote('tmp/busy.md', (raw) => { write('tmp/busy.md', String(++n)); return `${raw}!`; })).rejects.toThrow(/kept changing/);
  });

  it('leaves no temp files behind', async () => {
    await updateNote('tmp/clean.md', () => 'ok', '');
    const leftovers = fs.readdirSync(path.join(vault(), 'tmp')).filter((f) => f.endsWith('.palace-tmp'));
    expect(leftovers).toEqual([]);
  });

  it('does not write when the transform throws', async () => {
    write('tmp/guard.md', 'safe');
    await expect(updateNote('tmp/guard.md', () => { throw new Error('nope'); })).rejects.toThrow('nope');
    expect(read('tmp/guard.md')).toBe('safe');
  });
});
