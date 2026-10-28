import { describe, expect, it } from 'vitest';
import { addLogLine, bullets, firstParagraph, projectLog, section, setTaskStatus, splitFrontmatter, taskLines } from '@/lib/vault/markdown';

describe('splitFrontmatter', () => {
  it('keeps dates as strings and returns the body', () => {
    const { fm, body } = splitFrontmatter('---\ntype: project\nstarted: 2026-01-12\n---\n# Title\n');
    expect(fm).toEqual({ type: 'project', started: '2026-01-12' });
    expect(body).toBe('# Title\n');
  });

  it('reads malformed YAML leniently instead of throwing (writing is strict, see writer tests)', () => {
    expect(() => splitFrontmatter('---\ntype: [unclosed\n---\nbody')).not.toThrow();
    expect(splitFrontmatter('---\n: : :\n  - [\n---\nbody').body).toBe('body');
  });

  it('handles notes without frontmatter', () => {
    expect(splitFrontmatter('just text').fm).toEqual({});
  });
});

describe('section', () => {
  const body = '## Plan\n- [ ] a\n### Sub\nsub text\n## Done\n- b\n';
  it('includes deeper headings and stops at the next same-level heading', () => {
    expect(section(body, 'plan')).toBe('- [ ] a\n### Sub\nsub text');
    expect(section(body, 'done')).toBe('- b\n');
  });
  it('ignores emoji and case in headings', () => {
    expect(section('## ✅ Decisions\n- x\n', 'decisions')).toBe('- x\n');
  });
  it('returns empty when missing', () => {
    expect(section(body, 'reflections')).toBe('');
  });
});

describe('bullets & paragraphs', () => {
  it('returns top-level non-task bullets only', () => {
    expect(bullets('- one\n  - nested\n- [ ] task\n1. two\n')).toEqual(['one', 'two']);
  });
  it('skips headings, callouts and code when finding the first paragraph', () => {
    expect(firstParagraph('# H\n> [!info] x\n```\ncode\n```\nHello\nworld\n\nNext')).toBe('Hello world');
  });
});

describe('tasks', () => {
  it('finds tasks with their line numbers and statuses', () => {
    expect(taskLines('x\n- [ ] a\n  - [x] b\n- [/] c')).toEqual([
      { line: 1, status: ' ', text: 'a' },
      { line: 2, status: 'x', text: 'b' },
      { line: 3, status: '/', text: 'c' },
    ]);
  });
  it('changes only the status character', () => {
    expect(setTaskStatus('  - [ ] do it 📅 2026-01-01', 'x')).toBe('  - [x] do it 📅 2026-01-01');
  });
});

describe('project log', () => {
  it('matches the Log heading exactly, not Logistics', () => {
    const body = '## Logistics\n- trucks\n## Log\n- 2026-10-01 Kickoff';
    expect(section(body, 'log', true).trim()).toBe('- 2026-10-01 Kickoff');
    expect(section(body, 'log').trim()).toBe('- trucks');
  });

  it('reads dated lines in common shapes, newest first', () => {
    expect(projectLog('- 2026-09-01 A\n- **2026-10-02**: B\n- 2026-10-01 — C\nloose text\n- no date')).toEqual([
      { date: '2026-10-02', text: 'B' }, { date: '2026-10-01', text: 'C' }, { date: '2026-09-01', text: 'A' },
    ]);
  });

  it('inserts by date and ignores exact repeats', () => {
    let t = addLogLine('', '2026-10-01', 'A');
    t = addLogLine(t, '2026-10-05', 'B');
    t = addLogLine(t, '2026-09-01', 'C');
    t = addLogLine(t, '2026-10-01', 'A');
    expect(t).toBe('- 2026-10-05 B\n- 2026-10-01 A\n- 2026-09-01 C');
    expect(addLogLine('Some intro\n- 2026-10-01 A', '2026-10-03', 'B')).toBe('Some intro\n- 2026-10-03 B\n- 2026-10-01 A');
  });
});
