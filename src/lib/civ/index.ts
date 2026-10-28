// Civilization (roadmap §12): reads the vault into game inputs, runs the Owner's nights, and shapes what the UI shows.
import fs from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import { config } from '../config';
import { cleanText } from '../game';
import { projectLog, section, taskLines } from '../vault/markdown';
import { loadNotes, type Note } from '../vault/reader';
import { getWorld } from '../world';
import { updateNote } from '../vault/writer';
import { addDays, daysBetween } from '../game';
import { earnings, total, type CivInputs, type Earning, type Villager } from './earn';
import { chronicleNote, eraNote } from './era';
import {
  balanceOf, buildingLabel, challengeProgress, choiceLabel, eraRecord, festivalOnFor, graceOn, levelCount, livesOn, migrate, newState, openOnFor, rankChoices,
  runNights, wonderProgress, type Challenge, type Choice, type EraRecord, type IsleState, type NightReport,
} from './owner';
import { BACKFILL_DAYS, BUILDINGS, CLOCK, LEVELS, sizeOf, WONDER_GOAL, WONDERS, type BuildingKey, type Circle, type Levelled, type Life, type WonderKey } from './rules';

export { BUILDINGS, CLOCK } from './rules';
export type { BuildingKey, Circle, Life } from './rules';

const FILE = () => path.join(config.dataDir, 'isle.json');
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const isoDate = (v: unknown) => str(v).trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
const list = (v: unknown) => (Array.isArray(v) ? v.map(str) : str(v) ? [str(v)] : []);
const bool = (v: unknown) => v === true || v === 'true' || v === 'yes';
const typeOf = (n: Note) => str(n.fm.type).toLowerCase().trim();
const dateOf = (n: Note) => isoDate(n.fm.date) ?? n.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
/** `[[Name]]`, `[[Name|shown]]` or `[[Name#part]]` → `name`. */
const links = (s: string) => [...s.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim().toLowerCase());
const CIRCLES: Circle[] = ['close', 'client', 'network'];
/** `1990-04-12`, `04-12` or a YAML date → `04-12`. */
const monthDay = (v: unknown) => {
  const t = v instanceof Date ? v.toISOString().slice(0, 10) : str(v).trim();
  const m = t.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : null;
};
const PRIORITY: [RegExp, 'high' | 'medium' | 'low'][] = [[/[⏫🔺]/u, 'high'], [/🔼/u, 'medium'], [/[🔽⏬]/u, 'low']];

/** Everything the game needs from the vault, as plain dated facts. */
export async function civInputs(): Promise<CivInputs> {
  const [w, notes] = await Promise.all([getWorld(), loadNotes()]);
  const byRel = new Map(notes.map((n) => [n.rel, n]));
  const villageOf = new Map<string, string>();
  for (const v of w.villages) for (const p of v.people) villageOf.set(p.id, v.name);
  // Clients of projects still in play keep the client clock; once a project is done or stopped, its people are network.
  const clients = w.projects.filter((p) => !['done', 'stopped'].includes(p.status) && p.client).map((p) => p.client.toLowerCase());

  // Who was there, and when: meetings' attendees and daily notes' People.
  const seen: { date: string; names: string[]; title: string | null }[] = [];
  for (const n of notes) {
    const date = dateOf(n);
    if (!date) continue;
    if (typeOf(n) === 'meeting') seen.push({ date, names: links(list(n.fm.attendees).join(' ')), title: n.name.replace(/^\d{4}-\d{2}-\d{2}\s*/, '') });
    else if (typeOf(n) === 'daily') seen.push({ date, names: links(section(n.body, 'people')), title: null });
  }
  seen.sort((a, b) => a.date.localeCompare(b.date));

  const villagers: Villager[] = w.people.map((p) => {
    const fm = byRel.get(p.path)?.fm ?? {};
    const keys = new Set([p.name, ...p.aliases].map((k) => k.toLowerCase()));
    const met = seen.filter((s) => s.names.some((x) => keys.has(x)));
    const contacts = [...met.map((m) => m.date), isoDate(fm.last_contact), isoDate(fm.first_met)].filter((d): d is string => !!d);
    const company = p.company.toLowerCase();
    const set = str(fm.circle).toLowerCase().trim() as Circle;
    const circle: Circle = CIRCLES.includes(set) ? set : clients.some((c) => c === company || (company.length > 3 && c.includes(company))) ? 'client' : 'network';
    return {
      id: p.id, name: p.name, path: p.path, village: villageOf.get(p.id) ?? p.company, circle,
      memoriam: bool(fm.in_memoriam), contacts, about: [...met].reverse().find((m) => m.title)?.title ?? null,
      birthday: monthDay(fm.birthday ?? fm.born),
    };
  });

  const quests: CivInputs['quests'] = [];
  const dailies: CivInputs['dailies'] = [];
  const summaries: CivInputs['summaries'] = [];
  const judged: CivInputs['judged'] = [];
  for (const n of notes) {
    const type = typeOf(n);
    if (type === 'daily') {
      const date = dateOf(n);
      if (date) dailies.push({ date, locked: bool(n.fm.plan_locked), closed: bool(n.fm.closed), planDone: taskLines(section(n.body, 'plan')).filter((t) => t.status === 'x' || t.status === 'X').length });
      continue;
    }
    if (type === 'session') { const date = isoDate(n.fm.ended) ?? dateOf(n); if (date) summaries.push({ date, title: str(n.fm.title) || n.name }); }
    if (type === 'decision' && isoDate(n.fm.judged_on)) judged.push({ date: isoDate(n.fm.judged_on)!, title: str(n.fm.title) || n.name });
    for (const t of taskLines(n.raw)) {
      if (t.status !== 'x' && t.status !== 'X') continue;
      const date = t.text.match(/✅️?\s*(\d{4}-\d{2}-\d{2})/u)?.[1];
      if (date) quests.push({ date, priority: PRIORITY.find(([re]) => re.test(t.text))?.[1] ?? null, text: cleanText(t.text) });
    }
  }
  const projectLogs = w.projects.flatMap((p) => p.log.map((l) => ({ date: l.date, project: p.name, text: l.text })));
  const projects = w.projects.map((p) => ({ name: p.name, status: p.status, last: p.lastActivity }));
  return { today: w.today, villagers, quests, dailies, projectLogs, summaries, judged, projects };
}

async function readState(): Promise<IsleState | null> {
  try { const s = JSON.parse(await fs.readFile(FILE(), 'utf8')); return s?.v === 1 ? migrate(s) : null; } catch { return null; }
}
async function writeState(s: IsleState) {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${FILE()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, FILE());
}

// One runner at a time per process, so two page loads can't both spend the same night.
const g = globalThis as unknown as { __isleRun?: Promise<IsleState> };

/** The Owner's state, with every night up to yesterday processed (and saved, unless read-only). */
async function currentState(i: CivInputs): Promise<IsleState> {
  const run = async () => {
    const before = (await readState()) ?? newState(i.today, BACKFILL_DAYS);
    const after = runNights(before, i);
    if (!config.readOnly && JSON.stringify(after) !== JSON.stringify(before)) {
      await writeState(after);
      // A year just ended: its chronicle goes into the vault (never over a note that's already there).
      for (const r of after.eras.slice(before.eras.length)) await updateNote(eraNote(r.year), (x) => x, chronicleNote(r)).catch(() => false);
    }
    return after;
  };
  const prev = g.__isleRun ?? Promise.resolve(null as unknown as IsleState);
  const next = prev.catch(() => null).then(run);
  g.__isleRun = next;
  return next;
}

// ------------------------------------------------------------------ what the UI gets

export interface BuildingView { key: BuildingKey; closed: boolean; damaged: boolean; level: number }
export interface VillagerView {
  id: string; name: string; path: string; village: string; circle: Circle; life: Life; days: number | null; lives: number; left: number | null;
  about: string | null; sick: number; dead: number; birthday: string | null;
}
export interface VillageView { name: string; size: string; buildings: BuildingView[]; counts: Record<Life, number>; festival: boolean }
export interface Letter { name: string; about: string | null; village: string }
export interface ChallengeView extends Challenge { done: number; daysLeft: number }
export interface WonderView { key: WonderKey; progress: number; need: number; unlocked: string | null; built: boolean }
export interface LevelView { key: BuildingKey; village: string | null; level: number; count: number; need: number | null }
export interface IsleView {
  balance: number;
  started: string;
  era: number;
  today: Earning[];
  villagers: VillagerView[];
  villages: VillageView[];
  /** Library and Market. */
  isleBuildings: BuildingView[];
  plaza: boolean;
  wonders: WonderView[];
  statues: IsleState['statues'];
  golden: string | null;
  festivalsToday: string[];
  birthdays: { name: string; village: string; in: number; life: Life }[];
  challenge: ChallengeView | null;
  levels: LevelView[];
  /** Last night's report, if there was a night. */
  report: (NightReport & { lines: Earning[]; letters: Letter[] }) | null;
  reports: NightReport[];
  choices: Choice[];
  eras: EraRecord[];
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Atlas's Dawn message about last night, written by rules (nothing leaves the computer). */
export function ownerSays(r: NightReport, balance: number): string {
  const out: string[] = [];
  if (r.era) out.push(`Happy New Year! ${r.era} is over: its chronicle is in your vault, and I’ve sailed to a new island with ${r.balance} 🐚 and every blueprint.`);
  if (r.storm) out.push(`A storm hit after quiet days and broke the ${r.storm}.`);
  else if (r.storm === '') out.push('A storm passed after quiet days, but there was nothing to break.');
  out.push(r.earned ? `Yesterday you earned ${r.earned} 🐚.` : 'Yesterday earned nothing, so the treasury stood still.');
  if (r.closed.length) out.push(`I couldn’t pay upkeep, so I closed the ${r.closed.join(', the ')}.`);
  if (r.reopened.length) out.push(`The ${r.reopened.join(', the ')} ${r.reopened.length > 1 ? 'are' : 'is'} open again.`);
  if (r.upkeep && !r.closed.length) out.push(`Upkeep paid: ${r.upkeep} 🐚.`);
  const settled = r.challenge?.settled;
  if (settled) out.push(settled.result === 'won' ? `You won the week’s challenge: +${settled.reward} 🐚.` : 'The week’s challenge slipped away. A new one starts today.');
  for (const w of r.unlocked ?? []) out.push(`The ${BUILDINGS[w].name} is unlocked!`);
  if (r.built) {
    const c = r.built;
    if (c.action === 'upgrade') out.push(`Overnight the ${buildingLabel(c)} went up to level ${c.level}. ${c.why}`);
    else if (c.action === 'repair') out.push(`Overnight I mended the ${buildingLabel(c)}.`);
    else out.push(`Overnight I built a ${buildingLabel(c)}. ${c.why}`);
  } else if (r.saving) out.push(`I’m saving for ${choiceLabel(r.saving)}: ${Math.max(0, balance)} of ${r.saving.cost} 🐚. ${r.saving.why}`);
  else if (!r.era) out.push('A quiet night. Nothing on the isle needs building.');
  if (r.festival) out.push(`Today there’s a festival in ${r.festival} 🎉: every conversation there pays more.`);
  if (r.golden) out.push('Every village has everything it needs and nobody is sick. A Golden Age begins ✨');
  return out.join(' ');
}

export const getIsle = cache(async (): Promise<IsleView> => {
  const i = await civInputs();
  const state = await currentState(i);
  const open = openOnFor(state.buildings);
  // Today's buildings count as open (built last night).
  const lives = livesOn(i.villagers, i.today, open);
  const villagers: VillagerView[] = i.villagers.map((v) => {
    const l = lives.get(v.id)!;
    return {
      id: v.id, name: v.name, path: v.path, village: v.village, circle: v.circle, life: l.life, days: l.days, lives: l.lives, left: l.left, about: v.about,
      sick: CLOCK[v.circle].sick, dead: CLOCK[v.circle].dead + graceOn(v, i.today, open), birthday: v.birthday,
    };
  });
  const view = (b: IsleState['buildings'][number]): BuildingView => ({
    key: b.key, closed: b.closed.some(([, u]) => u === null), damaged: (b.damaged ?? []).some(([, u]) => u === null), level: 1 + (b.up ?? []).length,
  });
  const isFest = festivalOnFor(state.festivals);
  const villageNames = [...new Set(villagers.map((v) => v.village))];
  const villages: VillageView[] = villageNames.map((name) => {
    const vs = villagers.filter((v) => v.village === name);
    const counts = { thriving: 0, idle: 0, sick: 0, ghost: 0, spirit: 0, unknown: 0 } as Record<Life, number>;
    for (const v of vs) counts[v.life]++;
    return { name, size: sizeOf(counts.thriving), counts, festival: isFest(name, i.today), buildings: state.buildings.filter((b) => b.village === name).map(view) };
  });
  const last = state.reports.at(-1) ?? null;
  // The Post Office's letters: the sick villagers closest to dying, as many per village as its level.
  const letters: Letter[] = villages.flatMap((vg) => {
    const post = vg.buildings.find((b) => b.key === 'post' && !b.closed && !b.damaged);
    if (!post) return [];
    return villagers.filter((v) => v.village === vg.name && v.life === 'sick').sort((a, b) => (a.left ?? 99) - (b.left ?? 99)).slice(0, post.level)
      .map((v) => ({ name: v.name, about: v.about, village: v.village }));
  }).slice(0, 3);
  const active = state.challenges.find((c) => c.result === null) ?? null;
  const prog = wonderProgress(i, state, i.today);
  const birthdays = villagers.flatMap((v) => {
    if (!v.birthday || v.life === 'spirit') return [];
    for (let k = 0; k <= 7; k++) if (addDays(i.today, k).slice(5) === v.birthday) return [{ name: v.name, village: v.village, in: k, life: v.life }];
    return [];
  }).sort((a, b) => a.in - b.in);
  return {
    balance: balanceOf(state, i),
    started: state.started,
    era: state.era,
    today: earnings(i, i.today, i.today, open, isFest),
    villagers, villages,
    isleBuildings: state.buildings.filter((b) => BUILDINGS[b.key].scope === 'isle').map(view),
    plaza: state.buildings.some((b) => b.key === 'plaza'),
    wonders: WONDERS.map((key) => ({ key, progress: prog[key], need: WONDER_GOAL[key].need, unlocked: state.unlocked[key] ?? null, built: state.buildings.some((b) => b.key === key) })),
    statues: state.statues,
    golden: state.golden,
    festivalsToday: villages.filter((v) => v.festival).map((v) => v.name),
    birthdays,
    challenge: active ? { ...active, done: challengeProgress(i, active, i.today), daysLeft: Math.max(0, daysBetween(i.today, active.to)) } : null,
    levels: state.buildings.filter((b) => b.key in LEVELS).map((b) => {
      const level = 1 + (b.up ?? []).length;
      return { key: b.key, village: b.village, level, count: levelCount(i, state, b, i.today), need: level < 3 ? LEVELS[b.key as Levelled].need[level - 1] : null };
    }),
    report: last ? { ...last, lines: earnings(i, last.night, last.night, open, isFest), letters } : null,
    reports: state.reports,
    choices: rankChoices(i, state, i.today),
    eras: state.eras,
  };
});

/** The current Era's chronicle so far. */
export async function yearSoFar(): Promise<EraRecord> {
  const i = await civInputs();
  return eraRecord(await currentState(i), i, i.today);
}

export { buildingLabel, choiceLabel, total };
export type { Choice, EraRecord, NightReport } from './owner';
export type { Earning } from './earn';
