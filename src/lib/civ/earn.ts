// Shells: earned from dated things in the vault, recomputed every time. Pure.
import { addDays } from '../game';
import { lifeOf } from './life';
import { BIRTHDAY_BONUS, EARN, FESTIVAL_BONUS, QUEST_CAP, SHRINE_PAY_AT, TREE_BONUS, type BuildingKey, type Circle } from './rules';

export interface Villager {
  id: string;
  name: string;
  path: string;
  village: string;
  circle: Circle;
  memoriam: boolean;
  /** Every date you were in touch (YYYY-MM-DD). */
  contacts: string[];
  /** What you last talked about: the latest meeting's name. */
  about: string | null;
  /** MM-DD, from `birthday:` in their note. */
  birthday: string | null;
}

export interface CivInputs {
  today: string;
  villagers: Villager[];
  /** Ticked tasks outside daily notes, by their ✅ date. */
  quests: { date: string; priority: 'high' | 'medium' | 'low' | null; text: string }[];
  dailies: { date: string; locked: boolean; closed: boolean; planDone: number }[];
  projectLogs: { date: string; project: string; text: string }[];
  summaries: { date: string; title: string }[];
  judged: { date: string; title: string }[];
  /** For the Era chronicle: projects and when they were last touched. */
  projects: { name: string; status: string; last: string | null }[];
}

export type EarnKind = 'quest' | 'plan' | 'dawn' | 'dusk' | 'talk' | 'rebirth' | 'birthday' | 'log' | 'summary' | 'judged';
export interface Earning { date: string; shells: number; kind: EarnKind; text: string; village?: string }

/**
 * The building's level if it stood and worked on that date, else 0 (not built, closed or storm-damaged).
 * Village buildings are checked by village; island-wide ones, land and Wonders with `village: null`.
 */
export type OpenOn = (key: BuildingKey, village: string | null, date: string) => number;
/** Was there a festival in this village on that date? */
export type FestivalOn = (village: string, date: string) => boolean;
const none = () => 0;

/** Every earning from `from` to `to`, inclusive. */
export function earnings(i: CivInputs, from: string, to: string, open: OpenOn = none, festival: FestivalOn = () => false): Earning[] {
  if (from > to) return [];
  const inRange = (d: string) => d >= from && d <= to;
  const out: Earning[] = [];

  const byDay = new Map<string, CivInputs['quests']>();
  for (const q of i.quests) if (inRange(q.date)) byDay.set(q.date, [...(byDay.get(q.date) ?? []), q]);
  const rank = { high: 0, medium: 1, low: 2 } as const;
  for (const [date, qs] of byDay) {
    // The best-paying ten count.
    for (const q of [...qs].sort((a, b) => (a.priority ? rank[a.priority] : 3) - (b.priority ? rank[b.priority] : 3)).slice(0, QUEST_CAP)) {
      let shells: number = EARN.quest[q.priority ?? 'none'];
      const market = open('market', null, date);
      if (market && (q.priority === 'high' || (market >= 2 && q.priority === 'medium') || market >= 3)) shells += 1;
      out.push({ date, shells, kind: 'quest', text: q.text });
    }
  }

  for (const d of i.dailies) {
    if (!inRange(d.date)) continue;
    const archive = open('archive', null, d.date) ? 1 : 0;
    if (d.locked) out.push({ date: d.date, shells: EARN.dawn + archive, kind: 'dawn', text: 'Locked your Dawn plan' });
    if (d.closed) out.push({ date: d.date, shells: EARN.dusk + archive, kind: 'dusk', text: 'Closed Dusk' });
    if (d.planDone) out.push({ date: d.date, shells: EARN.plan * d.planDone, kind: 'plan', text: `Finished ${d.planDone} thing${d.planDone > 1 ? 's' : ''} from your plan` });
  }

  for (const v of i.villagers) {
    if (v.memoriam) continue;
    const { rebirths } = lifeOf(v.contacts, v.circle, to);
    for (const date of new Set(v.contacts)) {
      if (!inRange(date)) continue;
      const party = festival(v.village, date) ? FESTIVAL_BONUS : 0;
      if (rebirths.includes(date)) {
        const shells = SHRINE_PAY_AT[open('shrine', v.village, date)] + (open('tree', null, date) ? TREE_BONUS : 0) + party;
        out.push({ date, shells, kind: 'rebirth', text: `Brought ${v.name} back${party ? ' at the festival' : ''}`, village: v.village });
      } else {
        out.push({ date, shells: EARN.talk + open('tavern', v.village, date) + party, kind: 'talk', text: `Talked to ${v.name}${party ? ' at the festival' : ''}`, village: v.village });
      }
      if (v.birthday && date.slice(5) === v.birthday) out.push({ date, shells: BIRTHDAY_BONUS, kind: 'birthday', text: `${v.name}’s birthday`, village: v.village });
    }
  }

  for (const l of i.projectLogs) if (inRange(l.date)) out.push({ date: l.date, shells: EARN.projectLog, kind: 'log', text: `${l.project}: ${l.text}` });
  for (const s of i.summaries) if (inRange(s.date)) out.push({ date: s.date, shells: EARN.summary + open('library', null, s.date), kind: 'summary', text: `Session note: ${s.title}` });
  for (const j of i.judged) if (inRange(j.date)) out.push({ date: j.date, shells: EARN.judged, kind: 'judged', text: `Judged “${j.title}”` });

  return out.sort((a, b) => a.date.localeCompare(b.date) || b.shells - a.shells);
}

export const total = (e: Earning[]) => e.reduce((n, x) => n + x.shells, 0);

/** Dates from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
