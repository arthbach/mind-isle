// Everything the app writes to the vault. Kept free of Next.js APIs so it can be unit-tested.
import fs from 'node:fs/promises';
import { config } from './config';
import { today } from './clock';
import { cleanText, matchPerson, matchProject, slugify, VERDICTS } from './game';
import type { Phase } from './gate';
import { updateStore } from './store';
import type { BeliefStatus, PlanStatus } from './types';
import { section, setTaskStatus, splitFrontmatter, taskLines } from './vault/markdown';
import { loadNotes } from './vault/reader';
import {
  assertWritable, readFrontmatterList, resolveInVault, setFrontmatter, setFrontmatterList, updateNote, upsertSections,
} from './vault/writer';

const dailyRel = () => `${config.dailyDir}/${today()}.md`;
const dailyTemplate = () => `---\ntype: daily\ndate: ${today()}\n---\n`;
const MARK: Record<Exclude<PlanStatus, null>, string> = { done: 'x', partly: '/', moved: '>' };

export function cleanList(items: unknown, max = 30): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((s) => cleanText(String(s)).slice(0, 300)).filter(Boolean).slice(0, max);
}
const cleanOne = (s: unknown) => cleanText(String(s ?? '')).slice(0, 500);
const typeOf = (fm: Record<string, unknown>) => String(fm.type ?? '').toLowerCase();
const aliasesOf = (fm: Record<string, unknown>) => (Array.isArray(fm.aliases) ? fm.aliases.map(String) : []);

async function noteOfType(rel: string, type: string) {
  const { fm } = splitFrontmatter(await fs.readFile(resolveInVault(rel), 'utf8'));
  if (typeOf(fm) !== type) throw new Error(`Not a ${type} note.`);
}

// ---------- Dawn ----------

export async function writeDawn(input: { energy: number | null; items: string[] }) {
  assertWritable();
  const items = cleanList(input.items);
  const e = input.energy;
  const energy = typeof e === 'number' && Number.isInteger(e) && e >= 1 && e <= 5 ? e : null;
  await updateNote(dailyRel(), (raw) =>
    upsertSections(setFrontmatter(raw, { energy, plan_locked: true }), { Plan: items.map((t) => `- [ ] ${t}`).join('\n') }),
  dailyTemplate());
}

export async function unlockDawn() {
  assertWritable();
  await updateNote(dailyRel(), (raw) => setFrontmatter(raw, { plan_locked: false }));
}

// ---------- Skip ----------

export async function skipPhase(phase: Phase) {
  assertWritable();
  if (phase !== 'dawn' && phase !== 'dusk') throw new Error('Unknown check-in.');
  await updateNote(dailyRel(), (raw) => {
    const current = readFrontmatterList(raw, 'skipped');
    return current.includes(phase) ? raw : setFrontmatterList(raw, 'skipped', [...current, phase]);
  }, dailyTemplate());
}

// ---------- Dusk ----------

export interface DuskInput {
  statuses: PlanStatus[];
  extra: string[];
  people: string[];
  decision: string;
  reflection: string;
}

export async function writeDusk(input: DuskInput) {
  assertWritable();
  const date = today();
  const rel = dailyRel();
  const notes = await loadNotes();
  const extra = cleanList(input.extra);
  const decision = cleanOne(input.decision);
  const reflection = cleanOne(input.reflection);

  const people = notes
    .filter((n) => typeOf(n.fm) === 'person')
    .map((n) => ({ name: n.name, rel: n.rel, aliases: aliasesOf(n.fm) }));
  const said = cleanList(input.people).flatMap((s) => s.split(/,|\band\b|\bdan\b/i)).map((s) => s.trim()).filter(Boolean);
  const met = said.map((s) => ({ said: s, person: matchPerson(s, people) }));

  // Plan text comes from the note itself, so the phone can't rewrite the plan.
  const daily = notes.find((n) => n.rel === rel);
  const plan = daily ? taskLines(section(daily.body, 'plan')).map((t) => cleanText(t.text)) : [];
  const statuses = plan.map((_, i) => {
    const s = input.statuses?.[i];
    return s === 'done' || s === 'partly' || s === 'moved' ? s : null;
  });

  await updateNote(rel, (raw) => {
    const prevReflections = section(splitFrontmatter(raw).body, 'reflections').trim();
    const sections: Record<string, string> = {
      Plan: plan.map((t, i) => {
        const s = statuses[i];
        return `- [${s ? MARK[s] : ' '}] ${t}${s === 'done' ? ` ✅ ${date}` : ''}`;
      }).join('\n'),
      Done: extra.map((t) => `- ${t}`).join('\n'),
      People: met.map(({ said: s, person }) => `- ${person ? `[[${person.name}]]` : s}`).join('\n'),
    };
    if (decision) sections.Decisions = `- ${decision}`;
    if (reflection && !prevReflections.includes(`- ${reflection}`)) {
      sections.Reflections = [prevReflections, `- ${reflection}`].filter(Boolean).join('\n');
    }
    return upsertSections(setFrontmatter(raw, { closed: true }), sections);
  }, dailyTemplate());

  // Lanterns.
  for (const { person } of met) {
    if (person) await updateNote(person.rel, (raw) => setFrontmatter(raw, { last_contact: date }));
  }

  // Construction sites that moved.
  const projects = notes
    .filter((n) => typeOf(n.fm) === 'project')
    .map((n) => {
      const name = cleanText(String(n.fm.title ?? '')) || n.name;
      return { id: slugify(name), name, rel: n.rel, aliases: aliasesOf(n.fm) };
    });
  const moved = [...plan.filter((_, i) => statuses[i] === 'done' || statuses[i] === 'partly'), ...extra];
  const touched = new Set(moved.map((t) => matchProject(t, projects)?.rel).filter(Boolean) as string[]);
  for (const p of touched) await updateNote(p, (raw) => setFrontmatter(raw, { last_activity: date }));

  // A planned item that matches an open task elsewhere completes it.
  const doneTexts = new Set(plan.filter((_, i) => statuses[i] === 'done').map((t) => t.toLowerCase()));
  for (const n of notes) {
    if (n.rel === rel || !doneTexts.size) continue;
    if (!taskLines(n.raw).some((t) => t.status === ' ' && doneTexts.has(cleanText(t.text).toLowerCase()))) continue;
    const isProject = typeOf(n.fm) === 'project';
    let matched = new Set<string>();
    await updateNote(n.rel, (raw) => {
      matched = new Set(); // updateNote may re-run this on fresher content
      const lines = raw.split('\n');
      for (const t of taskLines(raw)) {
        const key = cleanText(t.text).toLowerCase();
        if (t.status === ' ' && doneTexts.has(key) && !matched.has(key)) {
          lines[t.line] = `${setTaskStatus(lines[t.line].trimEnd(), 'x')} ✅ ${date}`;
          matched.add(key);
        }
      }
      const next = lines.join('\n');
      // Finishing a project's own task counts as movement on that project.
      return isProject && matched.size ? setFrontmatter(next, { last_activity: date }) : next;
    });
    for (const key of matched) doneTexts.delete(key);
  }
}

export async function reopenDusk() {
  assertWritable();
  await updateNote(dailyRel(), (raw) => setFrontmatter(raw, { closed: false }));
}

// ---------- Boards ----------

export async function completeQuest(id: string, expected: string) {
  assertWritable();
  const hash = id.lastIndexOf('#');
  const rel = id.slice(0, hash);
  const line = Number(id.slice(hash + 1));
  if (hash < 0 || !Number.isInteger(line)) throw new Error('Unknown task.');
  await updateNote(rel, (raw) => {
    const lines = raw.split('\n');
    const t = taskLines(lines[line] ?? '')[0];
    // The note may have changed since the page loaded; only tick the exact task we showed.
    if (!t || t.status !== ' ' || cleanText(t.text) !== cleanText(expected)) {
      throw new Error('That task changed in the vault. Refresh and try again.');
    }
    lines[line] = `${setTaskStatus(lines[line].trimEnd(), 'x')} ✅ ${today()}`;
    const next = lines.join('\n');
    return typeOf(splitFrontmatter(next).fm) === 'project' ? setFrontmatter(next, { last_activity: today() }) : next;
  });
}

export async function touchPerson(rel: string) {
  assertWritable();
  await noteOfType(rel, 'person');
  await updateNote(rel, (raw) => setFrontmatter(raw, { last_contact: today() }));
}

export async function setBeliefStatus(rel: string, status: BeliefStatus) {
  assertWritable();
  if (!['confirmed', 'adjusted', 'rejected', 'proposed'].includes(status)) throw new Error('Unknown status.');
  await noteOfType(rel, 'belief');
  await updateNote(rel, (raw) => setFrontmatter(raw, { status }));
}

export async function setVerdict(id: string, rel: string, verdict: string) {
  assertWritable();
  if (!(VERDICTS as readonly string[]).includes(verdict)) throw new Error('Unknown verdict.');
  if (id.startsWith('n-')) {
    await noteOfType(rel, 'decision');
    await updateNote(rel, (raw) => setFrontmatter(raw, { verdict, judged_on: today() }));
  } else {
    await updateStore((s) => { s.verdicts[id] = verdict; });
  }
}
