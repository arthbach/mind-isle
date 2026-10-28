// The session note: `<sessions_dir>/YYYY-MM-DD <project> <title>.md`, in the vault.
// Decisions are read by the Codex, follow-ups (`- [ ]`) by the quest board; the project's last_activity moves forward.
import path from 'node:path';
import { config } from '../config';
import { tildePath } from '../sessions/mapping';
import type { SessionRecord } from '../sessions/records';
import { home } from '../sessions/roots';
import { loadNotes } from '../vault/reader';
import { setFrontmatter, updateNote } from '../vault/writer';
import { splitFrontmatter } from '../vault/markdown';
import type { Summary } from './summarise';

const localDate = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: config.timeZone });
const localTime = (t: number) => `${localDate(t)}T${new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: config.timeZone })}`;
const safeName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
const q = (s: string) => JSON.stringify(s);

/** Note path for a session. Exported for tests. */
export function sessionNotePath(dir: string, r: Pick<SessionRecord, 'startedAt' | 'lastEventAt' | 'cwd'>, project: string | null, title: string): string {
  const name = safeName(`${localDate(r.startedAt ?? r.lastEventAt)} ${project ?? path.basename(r.cwd)} ${title}`).slice(0, 120).trim();
  return `${dir}/${name}.md`;
}

export function renderSessionNote(r: SessionRecord, project: { name: string; link: string } | null, s: Summary, by: string, people: Map<string, string>): string {
  const list = (xs: string[], fmt: (x: string) => string = (x) => x) => (xs.length ? xs.map((x) => `- ${fmt(x)}`).join('\n') : '- none');
  const files = [...new Set([...r.files, ...s.files_touched])].slice(0, 40);
  const person = (n: string) => (people.has(n.toLowerCase()) ? `[[${people.get(n.toLowerCase())}]]` : n);
  return [
    '---',
    'type: session',
    `source: ${r.source}`,
    `agent: ${r.agent}`,
    `session_id: ${q(r.id)}`,
    `project: ${project ? q(`[[${project.link}]]`) : 'null'}`,
    `cwd: ${q(tildePath(r.cwd, home()))}`,
    `branch: ${r.branch ? q(r.branch) : 'null'}`,
    `started: ${r.startedAt ? localTime(r.startedAt) : 'null'}`,
    `ended: ${localTime(r.lastEventAt)}`,
    `duration_min: ${r.activeMin}`,
    `summarised_by: ${q(by)}`,
    '---',
    '',
    `# ${s.title}`,
    '',
    '## Summary',
    s.summary,
    '',
    '## Decisions',
    s.decisions.length ? list(s.decisions) : '',
    '',
    '## Follow-ups',
    s.todos.map((t) => `- [ ] ${t.replace(/^\[[ x]\]\s*/i, '')}`).join('\n'),
    '',
    '## Files touched',
    list(files, (f) => `\`${f}\``),
    ...(s.people_mentioned.length ? ['', '## People', list(s.people_mentioned, person)] : []),
    '',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Write (or rewrite) the note for a session; returns its vault path. */
export async function writeSessionNote(
  r: SessionRecord, project: { rel: string; name: string } | null, s: Summary, by: string, dir: string,
): Promise<string> {
  const notes = await loadNotes();
  const people = new Map<string, string>();
  for (const n of notes) if (String(n.fm.type ?? '').toLowerCase() === 'person') people.set(n.name.toLowerCase(), n.name);
  // Summarising the same session again replaces its note rather than adding a second one.
  const existing = notes.find((n) => String(n.fm.type ?? '') === 'session' && String(n.fm.session_id ?? '') === r.id);
  const proj = project ? { name: project.name, link: path.basename(project.rel, '.md') } : null;
  let rel = existing?.rel ?? sessionNotePath(dir, r, proj?.name ?? null, s.title);
  if (!existing) {
    const taken = new Set(notes.map((n) => n.rel));
    for (let i = 2; taken.has(rel); i++) rel = rel.replace(/(?: \d+)?\.md$/, ` ${i}.md`);
  }
  const content = renderSessionNote(r, proj, s, by, people);
  await updateNote(rel, () => content, content);

  if (project) {
    const day = localDate(r.lastEventAt);
    await updateNote(project.rel, (raw) => {
      const last = String(splitFrontmatter(raw).fm.last_activity ?? '');
      return last >= day ? raw : setFrontmatter(raw, { last_activity: day });
    });
  }
  return rel;
}
