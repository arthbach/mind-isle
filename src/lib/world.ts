import { cache } from 'react';
import { config } from './config';
import { loadNotes, type Note } from './vault/reader';
import { bullets, firstParagraph, projectLog, section, taskLines } from './vault/markdown';
import { readStore } from './store';
import { clock } from './clock';
import { RULES, addDays, cleanText, daysBetween, isoInZone, levelFromXp, slugify, tierOf } from './game';
import { checkinFor, type Phase } from './gate';
import { classOf, computeAttributes } from './attributes';
import { climateFor, describeAuto, seasonFor } from './seasons';
import { readRecords } from './sessions/records';
import type {
  Achievement, WorldviewArea, WorldviewBanner, Attribute, Belief, BeliefStatus, Bet, BetStatus, CalendarDay, DayEntry, Decision,
  Person, PlanStatus, Priority, Project, ProjectStatus, Quest, TrophyIcon, Village, World,
} from './types';

// ---- frontmatter helpers ----
const str = (v: unknown): string =>
  v == null ? '' : Array.isArray(v) ? v.map(str).filter(Boolean).join(', ') : String(v);
const text = (v: unknown) => cleanText(str(v));
const isoDate = (v: unknown): string | null => str(v).trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? (v as unknown[]).flat(Infinity) : v == null || v === '' ? [] : [v]).map((x) => cleanText(String(x))).filter(Boolean);
const bool = (v: unknown) => v === true || v === 'true' || v === 'yes';
const clampInt = (n: number, lo = 0, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
const typeOf = (n: Note) => str(n.fm.type).toLowerCase().trim();
const tagsOf = (n: Note) => list(n.fm.tags).map((t) => t.toLowerCase().replace(/^#/, ''));
const truncate = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const summarize = (s: string) => truncate(cleanText(firstParagraph(s)));

const PROJECT_STATUS: Record<string, ProjectStatus> = {
  active: 'active', ongoing: 'active', 'in progress': 'active', building: 'active',
  blocked: 'blocked', paused: 'paused', 'on hold': 'paused', hold: 'paused',
  maintenance: 'maintenance', done: 'done', complete: 'done', completed: 'done', shipped: 'done',
  stopped: 'stopped', cancelled: 'stopped', canceled: 'stopped', dead: 'stopped',
};
const BET_STATUS: Record<string, BetStatus> = {
  draft: 'draft', building: 'draft', ready: 'ready', sent: 'sent', submitted: 'sent', applied: 'sent',
  pending: 'sent', rejected: 'rejected', declined: 'rejected', closed: 'rejected', offer: 'offer', won: 'offer', accepted: 'offer',
};
const BELIEF_STATUS: BeliefStatus[] = ['proposed', 'confirmed', 'adjusted', 'rejected'];
const ICONS: TrophyIcon[] = ['cup', 'medal', 'book', 'star', 'scar', 'build', 'lock'];

function hashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const PRIORITY: [RegExp, Priority][] = [[/[⏫🔺]/u, 'high'], [/🔼/u, 'medium'], [/[🔽⏬]/u, 'low']];

export const getWorld = cache(async (): Promise<World> => {
  const [notes, store] = await Promise.all([loadNotes(), readStore()]);
  const now = clock();
  const today = now.date;
  const since = (d: string | null) => (d ? Math.max(0, daysBetween(d, today)) : null);
  const byType = (t: string) => notes.filter((n) => typeOf(n) === t);
  const isPrivate = (n: Note) => bool(n.fm.private) || tagsOf(n).some((t) => config.privateTags.includes(t));
  const dailyRel = `${config.dailyDir}/${today}.md`;

  // ---- projects ----
  const projects: Project[] = byType('project').map((n) => {
    const name = text(n.fm.title) || n.name;
    const client = text(n.fm.client);
    const lastActivity = isoDate(n.fm.last_activity) ?? isoDate(n.fm.started);
    return {
      id: slugify(name),
      name,
      path: n.rel,
      client,
      status: PROJECT_STATUS[str(n.fm.status).toLowerCase().trim()] ?? 'active',
      lastActivity,
      days: since(lastActivity),
      deadline: isoDate(n.fm.deadline),
      venture: bool(n.fm.venture) || /\b(own venture|personal|self)\b/i.test(client),
      summary: summarize(section(n.body, 'objective') || n.body),
      aliases: list(n.fm.aliases),
      log: projectLog(section(n.body, 'log', true)),
    };
  });
  const order: ProjectStatus[] = ['active', 'blocked', 'maintenance', 'done', 'paused', 'stopped'];
  projects.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.days ?? 9e9) - (b.days ?? 9e9));

  // ---- people ----
  const lowerRaw = notes.map((n) => n.raw.toLowerCase());
  const people: Person[] = byType('person')
    .filter((n) => !bool(n.fm.self) && n.name !== config.owner)
    .map((n) => {
      const aliases = list(n.fm.aliases);
      const keys = [n.name, ...aliases.filter((a) => a.length >= 3)].map((k) => `[[${k.toLowerCase()}`);
      const lastContact = isoDate(n.fm.last_contact);
      const days = since(lastContact);
      return {
        id: slugify(n.name),
        name: n.name,
        path: n.rel,
        company: text(n.fm.company) || 'Unaffiliated',
        role: text(n.fm.role),
        aliases,
        lastContact,
        days,
        tier: tierOf(days),
        mentions: lowerRaw.filter((r) => keys.some((k) => r.includes(k))).length,
      };
    });

  const groups = new Map<string, Person[]>();
  for (const p of people) groups.set(p.company, [...(groups.get(p.company) ?? []), p]);
  const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  // Every company gets a village and the island grows to fit; with many companies, lone contacts share one.
  const loners = sortedGroups.length > 8 ? sortedGroups.filter(([, ps]) => ps.length === 1) : [];
  const merged = loners.length > 1
    ? [...sortedGroups.filter(([, ps]) => ps.length > 1), ['Wider world', loners.flatMap(([, ps]) => ps)] as [string, Person[]]]
    : sortedGroups;
  const villages: Village[] = merged.map(([name, ps]) => ({
    name,
    people: [...ps].sort((a, b) => (a.days ?? 9e9) - (b.days ?? 9e9)),
  }));

  const lanternPool = people.filter((p) => p.tier === 'cooling' || p.tier === 'fading');
  const lanterns = (lanternPool.length ? lanternPool : people.filter((p) => p.tier === 'fog'))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 4);

  // ---- decisions: decision notes + "## Decisions" bullets in meetings and dailies ----
  const sealState = (verdict: string | null, reviewOn: string | null) =>
    verdict ? 'judged' : reviewOn && reviewOn <= today ? 'due' : 'sealed';
  const decisions: Decision[] = [];
  const decisionDates: { date: string | null; judgedOn: string | null; verdict: string | null }[] = [];
  for (const n of byType('decision')) {
    decisionDates.push({ date: isoDate(n.fm.date), judgedOn: isoDate(n.fm.judged_on), verdict: text(n.fm.verdict) || null });
    const date = isoDate(n.fm.date);
    const reviewOn = isoDate(n.fm.review_on) ?? (date ? addDays(date, RULES.review) : null);
    const verdict = text(n.fm.verdict) || null;
    decisions.push({
      id: `n-${hashId(n.rel)}`,
      title: text(n.fm.title) || n.name,
      date,
      domain: text(n.fm.domain) || text(n.fm.project) || 'General',
      path: n.rel,
      context: summarize(n.body),
      question: text(n.fm.question),
      reviewOn,
      state: sealState(verdict, reviewOn),
      verdict,
      isPrivate: isPrivate(n),
    });
  }
  for (const n of notes.filter((x) => ['meeting', 'daily', 'session'].includes(typeOf(x)))) {
    const date = isoDate(n.fm.date) ?? isoDate(n.fm.ended) ?? n.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    for (const b of bullets(section(n.body, 'decisions'))) {
      const title = cleanText(b);
      if (!title) continue;
      const id = `m-${hashId(`${n.rel}|${title}`)}`;
      const reviewOn = date ? addDays(date, RULES.review) : null;
      const verdict = store.verdicts[id] ?? null;
      decisionDates.push({ date, judgedOn: null, verdict });
      decisions.push({
        id, title: truncate(title, 140), date,
        domain: text(n.fm.project) || ({ daily: 'Daily', session: 'Session' } as Record<string, string>)[typeOf(n)] || 'Meeting',
        path: n.rel, context: `From ${n.name}`, question: '', reviewOn,
        state: sealState(verdict, reviewOn), verdict, isPrivate: isPrivate(n),
      });
    }
  }
  decisions.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  // ---- beliefs; worldview banners (sensitive) are kept apart and never reach the island, Hall or Atlas ----
  const isWorldview = (n: Note) => str(n.fm.domain).toLowerCase().trim() === 'worldview' || bool(n.fm.sensitive);
  const worldview: WorldviewBanner[] = byType('belief').filter(isWorldview).map((n) => {
    const status = str(n.fm.status).toLowerCase() as BeliefStatus;
    const area = str(n.fm.area).toLowerCase().trim();
    const source = str(n.fm.source).toLowerCase().trim();
    const ev = Array.isArray(n.fm.evidence) ? n.fm.evidence : [];
    return {
      id: `w-${hashId(n.rel)}`,
      text: text(n.fm.statement) || n.name,
      area: (['values', 'faith', 'civic'].includes(area) ? area : 'values') as WorldviewArea,
      status: BELIEF_STATUS.includes(status) ? status : 'proposed',
      source: source === 'scan' || source === 'interview' ? source : 'manual',
      evidence: ev.map((e) => (e && typeof e === 'object'
        ? { quote: str((e as Record<string, unknown>).quote), note: str((e as Record<string, unknown>).note) || null }
        : { quote: str(e), note: null })).filter((e) => e.quote),
      useInAi: bool(n.fm.use_in_ai),
      path: n.rel,
      created: isoDate(n.fm.created),
    };
  });
  const beliefsDecided = byType('belief').filter((n) => !isWorldview(n) && ['confirmed', 'adjusted'].includes(str(n.fm.status).toLowerCase()))
    .map((n) => isoInZone(new Date(n.mtime), config.timeZone));
  const beliefs: Belief[] = byType('belief').filter((n) => !isWorldview(n)).map((n) => {
    const status = str(n.fm.status).toLowerCase() as BeliefStatus;
    return {
      id: `b-${hashId(n.rel)}`,
      text: text(n.fm.statement) || n.name,
      evidence: text(n.fm.evidence) || summarize(n.body),
      confidence: clampInt(Number(n.fm.confidence) || 2, 1, 3),
      status: BELIEF_STATUS.includes(status) ? status : 'proposed',
      path: n.rel,
    };
  });
  beliefs.sort((a, b) => BELIEF_STATUS.indexOf(a.status) - BELIEF_STATUS.indexOf(b.status));

  // ---- bets (applications, pitches, proposals) ----
  const bets: Bet[] = notes
    .filter((n) => ['bet', 'application'].includes(typeOf(n)))
    .map((n) => {
      const date = isoDate(n.fm.sent) ?? isoDate(n.fm.date) ?? isoDate(n.fm.created);
      return {
        id: `a-${hashId(n.rel)}`,
        title: text(n.fm.title) || text(n.fm.company) || n.name,
        kind: text(n.fm.kind) || (typeOf(n) === 'application' ? 'Application' : 'Bet'),
        status: BET_STATUS[str(n.fm.status).toLowerCase().trim()] ?? 'draft',
        date,
        days: since(date),
        note: text(n.fm.note) || summarize(n.body),
        path: n.rel,
      };
    });

  // ---- tasks → quests ----
  const quests: Quest[] = [];
  let doneTasks = 0;
  const tasksDoneDates: string[] = [];
  for (const n of notes) {
    if (n.rel === dailyRel) continue;
    for (const t of taskLines(n.raw)) {
      if (t.status === 'x' || t.status === 'X') {
        doneTasks++;
        const on = t.text.match(/✅️?\s*(\d{4}-\d{2}-\d{2})/u)?.[1];
        if (on) tasksDoneDates.push(on);
        continue;
      }
      if (t.status !== ' ') continue;
      const due = t.text.match(/📅️?\s*(\d{4}-\d{2}-\d{2})/u)?.[1] ?? null;
      const tags = [...t.text.matchAll(/(?:^|\s)#([\w/-]+)/g)].map((m) => m[1].toLowerCase());
      const clean = cleanText(t.text);
      if (!clean) continue;
      quests.push({
        id: `${n.rel}#${t.line}`,
        text: clean,
        due,
        overdue: !!due && due < today,
        priority: PRIORITY.find(([re]) => re.test(t.text))?.[1] ?? null,
        tags,
        path: n.rel,
        line: t.line,
        source: n.name,
        isPrivate: isPrivate(n) || ['bet', 'application'].includes(typeOf(n)) || tags.some((x) => config.privateTags.includes(x)),
      });
    }
  }
  const pScore = { high: 3, medium: 2, low: 0 } as const;
  const score = (q: Quest) =>
    (q.overdue ? 10 : 0) + (q.priority ? pScore[q.priority] : 1) + (q.due && daysBetween(today, q.due) <= 7 ? 4 : 0);
  quests.sort((a, b) => score(b) - score(a) || (a.due ?? '9').localeCompare(b.due ?? '9'));

  // ---- today ----
  const dailyNote = notes.find((n) => n.rel === dailyRel);
  const statusOf = (c: string): PlanStatus => (c === 'x' || c === 'X' ? 'done' : c === '/' ? 'partly' : c === '>' ? 'moved' : null);
  const day: DayEntry = {
    date: today,
    exists: !!dailyNote,
    energy: dailyNote && Number(dailyNote.fm.energy) ? clampInt(Number(dailyNote.fm.energy), 1, 5) : null,
    plan: dailyNote ? taskLines(section(dailyNote.body, 'plan')).map((t) => ({ text: cleanText(t.text), status: statusOf(t.status) })) : [],
    done: dailyNote ? bullets(section(dailyNote.body, 'done')).map(cleanText) : [],
    people: dailyNote ? bullets(section(dailyNote.body, 'people')).map(cleanText) : [],
    decisions: dailyNote ? bullets(section(dailyNote.body, 'decisions')).map(cleanText) : [],
    locked: !!dailyNote && bool(dailyNote.fm.plan_locked),
    closed: !!dailyNote && bool(dailyNote.fm.closed),
    skipped: dailyNote ? (list(dailyNote.fm.skipped).filter((s) => s === 'dawn' || s === 'dusk') as Phase[]) : [],
  };

  // ---- calendar: check-ins vs. skips vs. days you only edited notes ----
  // A daily note that only records skips is not a check-in, so it earns nothing.
  const dailyKind = new Map<string, 'daily' | 'skipped'>();
  for (const n of notes.filter((x) => typeOf(x) === 'daily')) {
    const d = isoDate(n.fm.date) ?? n.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (!d) continue;
    const skipOnly = list(n.fm.skipped).length > 0 && !bool(n.fm.plan_locked) && !bool(n.fm.closed);
    if (!skipOnly || !dailyKind.has(d)) dailyKind.set(d, skipOnly ? 'skipped' : 'daily');
  }
  const dailyDates = new Set([...dailyKind].filter(([, k]) => k === 'daily').map(([d]) => d));
  const touched = new Set(notes.map((n) => isoInZone(new Date(n.mtime), config.timeZone)));
  const calendar: CalendarDay[] = Array.from({ length: 91 }, (_, i) => {
    const date = addDays(today, i - 90);
    return { date, kind: dailyKind.get(date) ?? (touched.has(date) ? 'capture' : null) };
  });

  // ---- check-in & season ----
  const checkin = checkinFor(day, now.time, config.duskFrom, config.checkinGate === 'soft');
  const climate = climateFor(config.timeZone, config.climate);
  const season = { auto: seasonFor(climate, now.month), label: describeAuto(climate, now.month), region: climate.region };

  // ---- achievements ----
  const achievements: Achievement[] = byType('achievement').map((n) => {
    const icon = str(n.fm.icon) as TrophyIcon;
    const locked = bool(n.fm.locked);
    return {
      id: `t-${hashId(n.rel)}`,
      title: text(n.fm.title) || n.name,
      detail: text(n.fm.detail) || summarize(n.body),
      date: isoDate(n.fm.date) ?? (text(n.fm.date) || null),
      category: text(n.fm.category) || 'Milestones',
      isPublic: bool(n.fm.public) && !isPrivate(n),
      locked,
      icon: locked ? 'build' : ICONS.includes(icon) ? icon : 'cup',
      path: n.rel,
      warning: text(n.fm.warning),
      auto: false,
    };
  });
  for (const p of projects.filter((x) => x.status === 'done')) {
    achievements.push({
      id: `p-${p.id}`, title: `Shipped ${p.name}`, detail: p.summary, date: p.lastActivity, category: 'Shipped',
      isPublic: false, locked: false, icon: 'cup', path: p.path, warning: '', auto: true,
    });
  }
  const judged = decisions.filter((d) => d.verdict).length;
  const warm = people.filter((p) => p.tier === 'warm').length;
  const lastWeek = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const badge = (title: string, detail: string, earned: boolean): Achievement => ({
    id: `g-${slugify(title)}`, title, detail, date: null, category: 'Island badges', isPublic: false,
    locked: !earned, icon: earned ? 'star' : 'lock', path: null, warning: '', auto: true,
  });
  achievements.push(
    badge('Cartographer', `100 notes on the map (you have ${notes.length}).`, notes.length >= 100),
    badge('Village elder', `Know 25 people by name (you know ${people.length}).`, people.length >= 25),
    badge('Lamplighter', `Keep 5 lanterns warm at once (${warm} now).`, warm >= 5),
    badge('Seal breaker', `Judge 5 decisions when their seals crack (${judged} so far).`, judged >= 5),
    badge('Seven dawns', 'Write a daily note 7 days in a row.', lastWeek.every((d) => dailyDates.has(d))),
  );

  // ---- xp & attributes (all derived from the vault, nothing invented) ----
  const confirmed = beliefs.filter((b) => b.status === 'confirmed' || b.status === 'adjusted').length;
  const doneProjects = projects.filter((p) => p.status === 'done').length;
  const earned = achievements.filter((a) => !a.locked && !a.auto).length;
  const xp = levelFromXp(
    dailyDates.size * 20 + doneTasks * 10 + judged * 25 + confirmed * 15 + warm * 5 + doneProjects * 100 + earned * 50,
  );
  // Attributes v2: 30-day rolling scores from dated events, compared with your own pace (src/lib/attributes.ts).
  const sessionSpans = (await readRecords(Date.now() - 91 * 86_400_000).catch(() => [])).flatMap((r) => r.spans ?? []);
  const dailyNotes = notes.filter((x) => typeOf(x) === 'daily');
  const attributes: Attribute[] = computeAttributes({
    today,
    dailies: dailyNotes.map((n) => {
      const plan = taskLines(section(n.body, 'plan')).map((t) => statusOf(t.status));
      return {
        date: isoDate(n.fm.date) ?? n.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '',
        checkin: bool(n.fm.plan_locked) || bool(n.fm.closed),
        planned: plan.length, done: plan.filter((x) => x === 'done').length, partly: plan.filter((x) => x === 'partly').length,
        people: bullets(section(n.body, 'people')).map(cleanText),
        reflections: bullets(section(n.body, 'reflections')).length,
      };
    }),
    tasksDone: tasksDoneDates,
    projectActivity: projects.map((p) => ({ id: p.id, date: p.lastActivity })),
    sessionSpans,
    contacts: people.map((p) => ({ name: p.name, date: p.lastContact })),
    decisions: decisionDates,
    beliefsDecided,
  });

  return {
    title: config.title,
    owner: config.owner,
    today,
    vaultName: config.vaultName,
    readOnly: config.readOnly,
    isDemo: config.isDemo,
    noteCount: notes.length,
    projects,
    people,
    villages,
    lanterns,
    decisions,
    beliefs,
    worldview,
    achievements,
    bets,
    quests: quests.slice(0, 12),
    questTotal: quests.length,
    day,
    calendar,
    xp,
    attributes,
    className: classOf(attributes),
    checkin,
    season,
  };
});
