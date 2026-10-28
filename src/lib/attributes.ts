// Attributes v2 (roadmap §8): 30-day rolling scores from dated events, each compared with the user's own pace.
// Pure: everything comes in as arguments, so the formulas are easy to test and to explain in the "why?" breakdown.
import { unionMs } from './sessions/records';
import type { Attribute } from './types';

const DAY = 86_400_000;
export const WINDOW = 30;
export const BASELINE = 90;

export interface AttributeInputs {
  /** Today, YYYY-MM-DD. */
  today: string;
  /** One per daily note: whether it was a check-in, and what the plan became. */
  dailies: { date: string; checkin: boolean; planned: number; done: number; partly: number; people: string[]; reflections: number }[];
  /** Dates tasks were completed (Tasks-plugin ✅ dates). */
  tasksDone: string[];
  /** Each project's last activity date. */
  projectActivity: { id: string; date: string | null }[];
  /** When any agent session was active, [start, end] in ms; overlapping sessions count once. */
  sessionSpans: [number, number][];
  /** Last contact date per person. */
  contacts: { name: string; date: string | null }[];
  /** Decisions: when sealed, when judged, and the verdict. */
  decisions: { date: string | null; judgedOn: string | null; verdict: string | null }[];
  /** Beliefs confirmed or adjusted, by when their note last changed. */
  beliefsDecided: string[];
}

const dayNo = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
/** Days since the date, 0 = today. */
const ago = (today: string, d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? dayNo(today) - dayNo(d.slice(0, 10)) : Infinity);
const within = (today: string, d: string | null, days: number) => { const a = ago(today, d); return a >= 0 && a < days; };
const round1 = (n: number) => Math.round(n * 10) / 10;
const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** 50 is your usual pace (a third of your last 90 days); 100 is twice that or more. */
export function paceScore(recent: number, ninety: number): number {
  // `ninety` includes `recent`, so `usual` is above zero whenever `recent` is.
  if (recent <= 0) return 0;
  return Math.min(100, Math.round((50 * recent) / (ninety / (BASELINE / WINDOW))));
}

type Why = NonNullable<Attribute['why']>;

export function computeAttributes(i: AttributeInputs): Attribute[] {
  const t = i.today;
  const inW = (d: string | null, days = WINDOW) => within(t, d, days);
  const usual = (n90: number) => round1(n90 / (BASELINE / WINDOW));

  // Builder: projects that moved, active session hours, tasks completed.
  const moved = (days: number) => i.projectActivity.filter((p) => inW(p.date, days)).length;
  // Hours you had agents working, with parallel sessions counted once.
  const end = Date.parse(`${t}T00:00:00Z`) + DAY;
  const hours = (days: number) => round1(unionMs(i.sessionSpans, end - days * DAY, end) / 3_600_000);
  const tasks = (days: number) => i.tasksDone.filter((d) => inW(d, days)).length;
  const builder = (days: number) => moved(days) * 3 + hours(days) + tasks(days) * 0.5;

  // Follow-through: planned items done ÷ planned (partly = half).
  const plans = (days: number) => i.dailies.filter((d) => inW(d.date, days) && d.planned > 0);
  const ratio = (days: number) => {
    const p = plans(days);
    const planned = p.reduce((n, d) => n + d.planned, 0);
    return planned ? (p.reduce((n, d) => n + d.done + d.partly * 0.5, 0)) / planned : null;
  };

  // Diplomat: different people you were in touch with.
  const people = (days: number) => {
    const names = new Set<string>();
    for (const c of i.contacts) if (inW(c.date, days)) names.add(c.name.toLowerCase());
    for (const d of i.dailies) if (inW(d.date, days)) for (const p of d.people) names.add(p.toLowerCase());
    return names.size;
  };

  // Strategist: decisions sealed and judged; calibration over every judged decision.
  const sealed = (days: number) => i.decisions.filter((d) => inW(d.date, days)).length;
  const judged = (days: number) => i.decisions.filter((d) => d.verdict && inW(d.judgedOn, days)).length;
  const allJudged = i.decisions.filter((d) => d.verdict);
  const right = allJudged.filter((d) => d.verdict === 'Right call').length;

  // Sage: beliefs confirmed or adjusted, reflections written.
  const beliefs = (days: number) => i.beliefsDecided.filter((d) => inW(d, days)).length;
  const reflections = (days: number) => i.dailies.filter((d) => inW(d.date, days)).reduce((n, d) => n + d.reflections, 0);

  // Chronicler: days with a Dawn or Dusk check-in ÷ days. Note count doesn't matter.
  const checkins = (days: number) => i.dailies.filter((d) => d.checkin && inW(d.date, days)).length;

  const row = (label: string, recent: number | string, ninety: number | string, unit = ''): Why[number] =>
    ({ label, recent: `${recent}${unit}`, usual: typeof ninety === 'number' ? `${usual(ninety)}${unit}` : ninety });
  const pct = (r: number | null) => (r === null ? 'no plans' : `${Math.round(r * 100)}%`);

  const ft30 = ratio(WINDOW), ft90 = ratio(BASELINE);
  return [
    {
      key: 'builder', label: 'Builder', color: 'var(--accent)', value: paceScore(builder(WINDOW), builder(BASELINE)),
      detail: `${n(moved(WINDOW), 'project')} moved · ${hours(WINDOW)} h with agents · ${n(tasks(WINDOW), 'task')} done`,
      why: [row('Projects that moved', moved(WINDOW), moved(BASELINE)), row('Active hours with agents', hours(WINDOW), hours(BASELINE), ' h'), row('Tasks completed', tasks(WINDOW), tasks(BASELINE))],
    },
    {
      key: 'followthrough', label: 'Follow-through', color: 'var(--danger)', value: ft30 === null ? 0 : Math.round(ft30 * 100),
      detail: ft30 === null ? 'No Dawn plans in the last 30 days' : `${pct(ft30)} of what you planned got done (partly counts half)`,
      why: [{ label: 'Planned and done', recent: pct(ft30), usual: pct(ft90) }, row('Days with a plan', plans(WINDOW).length, plans(BASELINE).length)],
    },
    {
      key: 'diplomat', label: 'Diplomat', color: 'var(--info)', value: paceScore(people(WINDOW), people(BASELINE)),
      detail: `In touch with ${n(people(WINDOW), 'person', 'people')}`,
      why: [row('Different people you were in touch with', people(WINDOW), people(BASELINE))],
    },
    {
      key: 'strategist', label: 'Strategist', color: 'var(--gold)', value: paceScore(sealed(WINDOW) + judged(WINDOW), sealed(BASELINE) + judged(BASELINE)),
      detail: `${n(sealed(WINDOW), 'decision')} sealed · ${judged(WINDOW)} judged${allJudged.length ? ` · ${Math.round((right / allJudged.length) * 100)}% right calls of ${allJudged.length}` : ''}`,
      why: [
        row('Decisions sealed', sealed(WINDOW), sealed(BASELINE)), row('Decisions judged', judged(WINDOW), judged(BASELINE)),
        { label: 'Calibration (all time)', recent: allJudged.length ? `${right} of ${allJudged.length} right` : 'nothing judged yet', usual: '' },
      ],
    },
    {
      key: 'sage', label: 'Sage', color: 'var(--wood)', value: paceScore(beliefs(WINDOW) + reflections(WINDOW), beliefs(BASELINE) + reflections(BASELINE)),
      detail: `${n(beliefs(WINDOW), 'belief')} confirmed or adjusted · ${n(reflections(WINDOW), 'reflection')}`,
      why: [row('Beliefs confirmed or adjusted', beliefs(WINDOW), beliefs(BASELINE)), row('Reflections written at Dusk', reflections(WINDOW), reflections(BASELINE))],
    },
    {
      key: 'chronicler', label: 'Chronicler', color: 'var(--earth)', value: Math.round((checkins(WINDOW) / WINDOW) * 100),
      detail: `Checked in on ${checkins(WINDOW)} of the last ${WINDOW} days`,
      why: [{ label: 'Days with Dawn or Dusk', recent: `${checkins(WINDOW)} of ${WINDOW}`, usual: `${usual(checkins(BASELINE))} of ${WINDOW}` }],
    },
  ];
}

export const CLASS: Record<string, string> = {
  builder: 'Architect', followthrough: 'Finisher', diplomat: 'Envoy', strategist: 'Tactician', sage: 'Philosopher', chronicler: 'Cartographer',
};

/** Class = the strongest attribute over the last 30 days. */
export function classOf(attributes: Attribute[]): string {
  const top = [...attributes].sort((a, b) => b.value - a.value)[0];
  return top && top.value > 0 ? CLASS[top.key] : 'Wanderer';
}
