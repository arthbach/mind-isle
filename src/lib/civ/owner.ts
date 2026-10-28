// The Owner's nights: storms, upkeep, the weekly challenge, Wonders, one thing built, a festival, and on
// New Year's night the move to a new island. Pure: state in, state out.
import { addDays, daysBetween } from '../game';
import { earnings, eachDay, total, type CivInputs, type FestivalOn, type OpenOn, type Villager } from './earn';
import { lifeOf, type LifeResult } from './life';
import {
  BLUEPRINT_SHARE, BUILDINGS, CHALLENGE_REWARD, CLINIC_GRACE_AT, CLOCK, ERA_CARRY, FESTIVAL_GAP, FESTIVAL_MAX_GHOSTS, LEVELS,
  LIGHTHOUSE_GRACE, REPAIR_SHARE, START_GRANT, STORM_AFTER, STORM_GAP, UPGRADE_COST, UPKEEP_EVERY, WONDER_GOAL, WONDERS,
  type BuildingKey, type Levelled, type WonderKey,
} from './rules';

type Span = [string, string | null];
export interface Built {
  key: BuildingKey;
  /** null for island-wide buildings, land and Wonders. */
  village: string | null;
  built: string;
  /** Closed for unpaid upkeep: [from, until] (until null = still closed). */
  closed: Span[];
  /** Broken by a storm until repaired. */
  damaged?: Span[];
  /** Nights it went up a level. */
  up?: string[];
}
export interface Choice {
  key: BuildingKey;
  village: string | null;
  score: number;
  why: string;
  cost: number;
  /** build (default), go up a level, or mend storm damage. */
  action?: 'build' | 'upgrade' | 'repair';
  /** For an upgrade: the level it goes to. */
  level?: number;
}
export interface Festival { village: string; date: string; why: 'calm' | 'challenge' }
export interface Challenge {
  from: string;
  to: string;
  kind: 'reach' | 'quests';
  village: string | null;
  targets: { id: string; name: string }[];
  need: number;
  reward: number;
  result: 'won' | 'lost' | null;
}
export interface EraRecord {
  year: number;
  from: string;
  to: string;
  earned: number;
  bonus: number;
  spent: number;
  balance: number;
  carry: number;
  built: { key: BuildingKey; village: string | null; built: string; level: number }[];
  wonders: WonderKey[];
  golden: string | null;
  festivals: number;
  storms: number;
  challenges: { won: number; lost: number };
  rebirths: { name: string; date: string }[];
  deaths: { name: string; date: string }[];
  alive: number;
  ghosts: number;
  top: { name: string; talks: number }[];
  finished: string[];
}
export interface NightReport {
  night: string;
  earned: number;
  upkeep: number;
  built: Choice | null;
  saving: Choice | null;
  closed: string[];
  reopened: string[];
  balance: number;
  /** What a storm broke ('' when it found nothing to break). */
  storm?: string | null;
  /** The village holding a festival the next day. */
  festival?: string | null;
  challenge?: { settled: Challenge | null; set: Challenge | null };
  unlocked?: WonderKey[];
  golden?: boolean;
  /** The year that ended this night. */
  era?: number | null;
}
export interface IsleState {
  v: 1;
  /** The first day that earns, in this Era. */
  started: string;
  /** The last night processed. */
  lastNight: string;
  /** Everything spent, this Era. */
  spent: number;
  buildings: Built[];
  /** Newest last; only the last few are kept. */
  reports: NightReport[];
  /** The year of this island. */
  era: number;
  /** What the Owner arrived with. */
  grant: number;
  /** Challenge rewards, this Era. */
  bonus: number;
  festivals: Festival[];
  storms: string[];
  challenges: Challenge[];
  /** When each Wonder was unlocked, this Era. */
  unlocked: Partial<Record<WonderKey, string>>;
  golden: string | null;
  /** `key|village` of everything built on earlier islands: half price to rebuild. */
  blueprints: string[];
  /** Wonders from earlier islands, as statues on the Plaza. */
  statues: { key: WonderKey; year: number }[];
  eras: EraRecord[];
}

export function newState(today: string, backfill: number): IsleState {
  const started = addDays(today, -backfill);
  return migrate({ v: 1, started, lastNight: addDays(started, -1), spent: 0, buildings: [], reports: [] });
}

/** Fills what older saves don't have. */
export function migrate(s: Partial<IsleState> & Pick<IsleState, 'v' | 'started' | 'lastNight' | 'spent' | 'buildings' | 'reports'>): IsleState {
  return {
    era: Number(s.started.slice(0, 4)), grant: START_GRANT, bonus: 0, festivals: [], storms: [], challenges: [], unlocked: {}, golden: null,
    blueprints: [], statues: [], eras: [], ...s,
  };
}

const label = (b: { key: BuildingKey; village: string | null }) => `${BUILDINGS[b.key].name}${b.village ? ` in ${b.village}` : ''}`;
export { label as buildingLabel };
export const choiceLabel = (c: Choice) =>
  c.action === 'upgrade' ? `${label(c)}, level ${c.level}` : c.action === 'repair' ? `repairs to the ${label(c)}` : `a ${label(c)}`;

const inSpan = (spans: Span[] | undefined, date: string) => (spans ?? []).some(([f, u]) => f <= date && (u === null || date < u));
const openSpan = (spans: Span[] | undefined) => (spans ?? []).some(([, u]) => u === null);
const levelOn = (b: Built, date: string) => 1 + (b.up ?? []).filter((d) => d < date).length;

export function openOnFor(buildings: Built[]): OpenOn {
  return (key, village, date) => {
    const b = buildings.find((x) => x.key === key && x.village === village && x.built < date);
    return !b || inSpan(b.closed, date) || inSpan(b.damaged, date) ? 0 : levelOn(b, date);
  };
}
export const festivalOnFor = (festivals: Festival[]): FestivalOn => (village, date) => festivals.some((f) => f.village === village && f.date === date);

export const graceOn = (v: Villager, date: string, open: OpenOn) => CLINIC_GRACE_AT[open('clinic', v.village, date)] + (open('lighthouse', null, date) ? LIGHTHOUSE_GRACE : 0);

/** Every villager's life on a date, with Clinic and Lighthouse grace where they stood. */
export function livesOn(villagers: Villager[], date: string, open: OpenOn): Map<string, LifeResult> {
  return new Map(villagers.map((v) => [v.id, lifeOf(v.contacts, v.circle, date, { memoriam: v.memoriam, grace: graceOn(v, date, open) })]));
}

/** The days a villager died between `from` and `to`: past gaps by the plain clock, the current one with grace (as `lifeOf`). */
export function deathsOf(v: Villager, from: string, to: string, open: OpenOn): string[] {
  if (v.memoriam) return [];
  const dates = [...new Set(v.contacts.filter((d) => d <= to))].sort();
  const dead = CLOCK[v.circle].dead;
  const out: string[] = [];
  dates.forEach((c, k) => {
    const next = dates[k + 1];
    let day = addDays(c, dead + 1);
    if (!next) day = addDays(c, dead + 1 + graceOn(v, day, open));
    else if (next < day) return;
    if (day >= from && day <= to) out.push(day);
  });
  return out;
}

const names = (vs: { name: string }[]) => (vs.length <= 2 ? vs.map((v) => v.name).join(' and ') : `${vs[0].name}, ${vs[1].name} and ${vs.length - 2} more`);
const isAre = (n: number) => (n === 1 ? 'is' : 'are');
const byVillage = (vs: Villager[]) => {
  const m = new Map<string, Villager[]>();
  for (const v of vs) m.set(v.village, [...(m.get(v.village) ?? []), v]);
  return m;
};

/** How far each Wonder is towards being unlocked, on a night. */
export function wonderProgress(i: CivInputs, s: IsleState, date: string): Record<WonderKey, number> {
  const open = openOnFor(s.buildings);
  const lastDeath = i.villagers.flatMap((v) => deathsOf(v, s.started, date, open)).sort().at(-1);
  const rebirths = i.villagers.filter((v) => !v.memoriam).flatMap((v) => lifeOf(v.contacts, v.circle, date).rebirths).filter((d) => d >= s.started);
  return {
    // Nights since the last death, or every night of the Era (counting the first) if nobody died.
    lighthouse: lastDeath ? Math.max(0, daysBetween(lastDeath, date)) : daysBetween(s.started, date) + 1,
    tree: rebirths.length,
    archive: i.dailies.filter((d) => d.locked && d.date >= s.started && d.date <= date).length,
  };
}

/** What a building has done since it went up, towards its next level. */
export function levelCount(i: CivInputs, s: IsleState, b: Built, date: string): number {
  const key = b.key as Levelled;
  const after = (d: string) => d > b.built && d <= date;
  const here = i.villagers.filter((v) => v.village === b.village && !v.memoriam);
  switch (key) {
    case 'clinic': case 'shrine': return here.flatMap((v) => lifeOf(v.contacts, v.circle, date).rebirths).filter(after).length;
    case 'post': return here.reduce((n, v) => n + new Set(v.contacts.filter(after)).size, 0);
    case 'tavern': return s.festivals.filter((f) => f.village === b.village && after(f.date)).length;
    case 'library': return i.summaries.filter((x) => after(x.date)).length;
    case 'market': return i.quests.filter((x) => after(x.date)).length;
  }
}

/** What the Owner could do tonight, best first: people in danger, broken things, what you do most, upgrades, then Wonders. */
export function rankChoices(i: CivInputs, s: IsleState, date: string): Choice[] {
  const { buildings } = s;
  const open = openOnFor(buildings);
  const has = (key: BuildingKey, village: string | null) => buildings.some((b) => b.key === key && b.village === village);
  const lives = livesOn(i.villagers, date, open);
  const out: Choice[] = [];
  const price = (key: BuildingKey, village: string | null) =>
    Math.round(BUILDINGS[key].cost * (s.blueprints.includes(`${key}|${village ?? ''}`) ? BLUEPRINT_SHARE : 1));
  const add = (key: BuildingKey, village: string | null, score: number, why: string, extra: Partial<Choice> = {}) =>
    out.push({ key, village, score: Math.min(99, Math.round(score)), why, cost: price(key, village), ...extra });

  const since = (days: number) => addDays(date, -days);
  for (const [village, vs] of byVillage(i.villagers)) {
    const sick = vs.filter((v) => lives.get(v.id)!.life === 'sick');
    const idle = vs.filter((v) => lives.get(v.id)!.life === 'idle');
    const ghosts = vs.filter((v) => lives.get(v.id)!.life === 'ghost');
    const dying = sick.filter((v) => (lives.get(v.id)!.left ?? 99) <= 7);
    if (sick.length && !has('clinic', village)) {
      add('clinic', village, 80 + sick.length * 4 + dying.length * 4,
        `${names(sick)} ${isAre(sick.length)} sick${dying.length ? `, and ${names(dying)} could die within a week` : ''}.`);
    }
    if (sick.length + idle.length >= 2 && !has('post', village)) {
      add('post', village, 62 + (sick.length + idle.length) * 2, `${sick.length + idle.length} people here are drifting. Letters keep them close.`);
    }
    if (ghosts.length && vs.length >= 3 && !has('shrine', village)) {
      add('shrine', village, 50 + ghosts.length * 3, `${ghosts.length} ghost${ghosts.length > 1 ? 's' : ''} wander${ghosts.length > 1 ? '' : 's'} ${village}. Bringing them back should pay more.`);
    }
    const talks = vs.reduce((n, v) => n + v.contacts.filter((d) => d > since(14) && d <= date).length, 0);
    if (talks >= 3 && !has('tavern', village)) add('tavern', village, 44 + talks, `You talked to people here ${talks} times in two weeks. They deserve a Tavern.`);
  }
  const notes = i.summaries.filter((x) => x.date > since(14) && x.date <= date).length;
  if (notes >= 2 && !has('library', null)) add('library', null, 40 + notes, `${notes} session notes in two weeks. Your agents need a Library.`);
  const quests = i.quests.filter((q) => q.date > since(14) && q.date <= date).length;
  if (quests >= 5 && !has('market', null)) add('market', null, 40 + quests / 2, `${quests} quests done in two weeks. Trade is booming.`);

  for (const b of buildings) {
    if (openSpan(b.damaged)) {
      // Damage shows from the morning after the storm; the Owner mends it from the next night on.
      if (b.damaged!.at(-1)![0] > date) continue;
      add(b.key, b.village, b.key === 'clinic' ? 88 : 78, `The storm broke it, and it does nothing until it’s mended.`,
        { action: 'repair', cost: Math.max(5, Math.round(BUILDINGS[b.key].cost * REPAIR_SHARE)) });
      continue;
    }
    if (!(b.key in LEVELS) || openSpan(b.closed)) continue;
    const level = levelOn(b, addDays(date, 1));
    if (level >= 3) continue;
    const L = LEVELS[b.key as Levelled];
    const done = levelCount(i, s, b, date);
    if (done >= L.need[level - 1]) {
      add(b.key, b.village, 52 + level, `${L.counts[0].toUpperCase()}${L.counts.slice(1)} since it opened: ${done}. It has earned level ${level + 1}: ${L.effect[level]}.`,
        { action: 'upgrade', level: level + 1, cost: Math.round(BUILDINGS[b.key].cost * UPGRADE_COST[level - 1]) });
    }
  }

  const unlocked = WONDERS.filter((w) => s.unlocked[w] && !has(w, null));
  if (unlocked.length && !has('plaza', null)) add('plaza', null, 36, `The ${BUILDINGS[unlocked[0]].name} is unlocked, and Wonders need room. I’ll win land from the sea.`);
  if (has('plaza', null)) for (const w of unlocked) add(w, null, 30, `Nothing urgent tonight, so I’m putting Shells towards a Wonder.`);
  return out.sort((a, b) => b.score - a.score);
}

/** Sunday on or after `from`, at least two days ahead. */
function weekEnd(from: string): string {
  const dow = new Date(`${from}T00:00:00Z`).getUTCDay();
  const toSun = (7 - dow) % 7;
  return addDays(from, toSun < 2 ? toSun + 7 : toSun);
}

/** A challenge drawn from the village most in need; when nobody is, a quest goal. */
export function newChallenge(i: CivInputs, lives: Map<string, LifeResult>, from: string): Challenge {
  const to = weekEnd(from);
  let best: { village: string; targets: Villager[]; score: number } | null = null;
  for (const [village, vs] of byVillage(i.villagers)) {
    const sick = vs.filter((v) => lives.get(v.id)!.life === 'sick').sort((a, b) => (lives.get(a.id)!.left ?? 99) - (lives.get(b.id)!.left ?? 99));
    const ghosts = vs.filter((v) => lives.get(v.id)!.life === 'ghost').sort((a, b) => (lives.get(a.id)!.days ?? 0) - (lives.get(b.id)!.days ?? 0));
    const score = sick.length * 2 + ghosts.length;
    if (score && (!best || score > best.score)) best = { village, targets: [...sick, ...ghosts].slice(0, 5), score };
  }
  if (!best) return { from, to, kind: 'quests', village: null, targets: [], need: 12, reward: CHALLENGE_REWARD.base + 10, result: null };
  const need = Math.min(2, best.targets.length);
  return {
    from, to, kind: 'reach', village: best.village, targets: best.targets.map((v) => ({ id: v.id, name: v.name })),
    need, reward: CHALLENGE_REWARD.base + CHALLENGE_REWARD.each * need, result: null,
  };
}

/** How far a challenge has got by a date. */
export function challengeProgress(i: CivInputs, c: Challenge, date: string): number {
  const end = date < c.to ? date : c.to;
  if (c.kind === 'quests') return i.quests.filter((q) => q.date >= c.from && q.date <= end).length;
  return c.targets.filter((t) => i.villagers.find((v) => v.id === t.id)?.contacts.some((d) => d >= c.from && d <= end)).length;
}

const balanceAt = (s: IsleState, i: CivInputs, date: string, open: OpenOn) =>
  s.grant + s.bonus + total(earnings(i, s.started, date, open, festivalOnFor(s.festivals))) - s.spent;

/** The year's record, as the Owner closes it (or so far, for a year still running). */
export function eraRecord(s: IsleState, i: CivInputs, to: string): EraRecord {
  const open = openOnFor(s.buildings);
  const fest = festivalOnFor(s.festivals);
  const inEra = (d: string) => d >= s.started && d <= to;
  const balance = balanceAt(s, i, to, open);
  const lives = livesOn(i.villagers, to, open);
  const talks = i.villagers.map((v) => ({ name: v.name, talks: new Set(v.contacts.filter(inEra)).size })).filter((x) => x.talks).sort((a, b) => b.talks - a.talks);
  const life = (l: string) => [...lives.values()].filter((x) => x.life === l).length;
  return {
    year: s.era, from: s.started, to,
    earned: total(earnings(i, s.started, to, open, fest)), bonus: s.bonus, spent: s.spent, balance,
    carry: Math.floor(Math.max(0, balance) * ERA_CARRY),
    built: s.buildings.map((b) => ({ key: b.key, village: b.village, built: b.built, level: levelOn(b, addDays(to, 1)) })),
    wonders: WONDERS.filter((w) => s.buildings.some((b) => b.key === w)),
    golden: s.golden,
    festivals: s.festivals.filter((f) => inEra(f.date)).length,
    storms: s.storms.length,
    challenges: { won: s.challenges.filter((c) => c.result === 'won').length, lost: s.challenges.filter((c) => c.result === 'lost').length },
    rebirths: i.villagers.filter((v) => !v.memoriam).flatMap((v) => lifeOf(v.contacts, v.circle, to).rebirths.filter(inEra).map((date) => ({ name: v.name, date }))).sort((a, b) => a.date.localeCompare(b.date)),
    deaths: i.villagers.flatMap((v) => deathsOf(v, s.started, to, open).map((date) => ({ name: v.name, date }))).sort((a, b) => a.date.localeCompare(b.date)),
    alive: life('thriving') + life('idle') + life('sick'),
    ghosts: life('ghost'),
    top: talks.slice(0, 5),
    finished: i.projects.filter((p) => p.status === 'done' && p.last && inEra(p.last)).map((p) => p.name),
  };
}

/** New Year: the Owner sails to a new island with a share of the treasury, blueprints and statues. */
function nextEra(s: IsleState, record: EraRecord): IsleState {
  const year = s.era + 1;
  return {
    ...s,
    era: year, started: `${year}-01-01`, spent: 0, grant: record.carry, bonus: 0, buildings: [],
    festivals: [], storms: [], challenges: [], unlocked: {}, golden: null,
    blueprints: [...new Set([...s.blueprints, ...s.buildings.filter((b) => !WONDERS.includes(b.key as WonderKey)).map((b) => `${b.key}|${b.village ?? ''}`)])],
    statues: [...s.statues, ...record.wonders.map((key) => ({ key, year: s.era }))],
    eras: [...s.eras, record],
  };
}

/** Process every night from the one after `lastNight` up to and including yesterday. */
export function runNights(state: IsleState, i: CivInputs): IsleState {
  let s: IsleState = structuredClone(migrate(state));
  const yesterday = addDays(i.today, -1);
  for (const night of eachDay(addDays(s.lastNight, 1), yesterday)) {
    // A save from a year that ended without its night (the app wasn't opened): close it first.
    if (Number(night.slice(0, 4)) > s.era) s = nextEra(s, eraRecord(s, i, `${s.era}-12-31`));
    let open = openOnFor(s.buildings);
    const fest = festivalOnFor(s.festivals);
    const earnedTonight = total(earnings(i, night, night, open, fest));
    let balance = balanceAt(s, i, night, open);
    const report: NightReport = {
      night, earned: earnedTonight, upkeep: 0, built: null, saving: null, closed: [], reopened: [], balance,
      storm: null, festival: null, challenge: { settled: null, set: null }, unlocked: [], golden: false, era: null,
    };

    // Storms follow quiet days: nothing earned for a few days in a row breaks the newest working building.
    const quiet = eachDay(addDays(night, 1 - STORM_AFTER), night);
    if (quiet[0] >= s.started && !s.storms.some((d) => daysBetween(d, night) < STORM_GAP) && quiet.every((d) => total(earnings(i, d, d, open, fest)) === 0)) {
      const target = [...s.buildings].reverse().find((b) => !openSpan(b.closed) && !openSpan(b.damaged) && BUILDINGS[b.key].scope !== 'wonder' && b.key !== 'plaza');
      if (target) { target.damaged = [...(target.damaged ?? []), [addDays(night, 1), null]]; report.storm = label(target); } else report.storm = '';
      s.storms.push(night);
      open = openOnFor(s.buildings);
    }

    // Upkeep: close the newest buildings first until the rest can be paid; reopen when there's money again.
    if (daysBetween(s.started, night) % UPKEEP_EVERY === UPKEEP_EVERY - 1) {
      const running = s.buildings.filter((b) => !openSpan(b.closed));
      let due = running.reduce((n, b) => n + BUILDINGS[b.key].upkeep, 0);
      for (const b of [...running].reverse()) {
        if (due <= balance) break;
        if (!BUILDINGS[b.key].upkeep) continue;
        b.closed.push([night, null]);
        due -= BUILDINGS[b.key].upkeep;
        report.closed.push(label(b));
      }
      for (const b of s.buildings.filter((x) => x.closed.some(([f, u]) => u === null && f < night))) {
        const cost = BUILDINGS[b.key].upkeep;
        if (due + cost > balance) continue;
        b.closed = b.closed.map(([f, u]) => [f, u === null ? night : u]);
        due += cost;
        report.reopened.push(label(b));
      }
      s.spent += due; balance -= due; report.upkeep = due;
    }

    // The weekly challenge: settle the one that ended, then set the next.
    const lives = livesOn(i.villagers, night, open);
    for (const c of s.challenges.filter((x) => x.result === null && x.to <= night)) {
      c.result = challengeProgress(i, c, night) >= c.need ? 'won' : 'lost';
      if (c.result === 'won') {
        s.bonus += c.reward; balance += c.reward;
        if (c.village) { s.festivals.push({ village: c.village, date: addDays(night, 1), why: 'challenge' }); report.festival = c.village; }
      }
      report.challenge!.settled = c;
    }
    // A new challenge is posted only on the latest night, so catching up on missed nights never sets weeks you couldn't see.
    if (night === yesterday && !s.challenges.some((c) => c.result === null)) {
      const c = newChallenge(i, lives, addDays(night, 1));
      s.challenges.push(c);
      report.challenge!.set = c;
    }

    // Wonders unlock by what you did this Era, and stay unlocked.
    const prog = wonderProgress(i, s, night);
    for (const w of WONDERS) if (!s.unlocked[w] && prog[w] >= WONDER_GOAL[w].need) { s.unlocked[w] = night; report.unlocked!.push(w); }

    // One thing a night: build, go up a level, or mend; else save for it.
    const top = rankChoices(i, s, night)[0];
    if (top && top.cost <= balance) {
      if (top.action === 'repair' || top.action === 'upgrade') {
        const b = s.buildings.find((x) => x.key === top.key && x.village === top.village)!;
        if (top.action === 'repair') b.damaged = b.damaged!.map(([f, u]) => [f, u === null ? addDays(night, 1) : u]);
        else b.up = [...(b.up ?? []), night];
      } else s.buildings.push({ key: top.key, village: top.village, built: night, closed: [] });
      s.spent += top.cost; balance -= top.cost;
      report.built = top;
    } else if (top) report.saving = top;

    // A festival tomorrow in the calmest village that hasn't had one lately (a Golden Age halves the wait).
    open = openOnFor(s.buildings);
    const after = livesOn(i.villagers, night, open);
    const gap = s.golden ? FESTIVAL_GAP / 2 : FESTIVAL_GAP;
    const tomorrow = addDays(night, 1);
    if (!s.festivals.some((f) => f.date === tomorrow)) {
      const calm = [...byVillage(i.villagers)].map(([village, vs]) => {
        const l = vs.map((v) => after.get(v.id)!.life);
        const n = (x: string) => l.filter((y) => y === x).length;
        return { village, alive: n('thriving') + n('idle'), thriving: n('thriving'), sick: n('sick'), ghosts: n('ghost') };
      }).filter((v) => v.alive >= 3 && !v.sick && v.ghosts < FESTIVAL_MAX_GHOSTS
        && !s.festivals.some((f) => f.village === v.village && daysBetween(f.date, tomorrow) < gap))
        .sort((a, b) => b.thriving - a.thriving)[0];
      if (calm) { s.festivals.push({ village: calm.village, date: tomorrow, why: 'calm' }); report.festival = calm.village; }
    }

    // The Golden Age: every village of three or more has all four buildings, the island has the rest, and nobody is sick.
    if (!s.golden) {
      const villagesDone = [...byVillage(i.villagers)].filter(([, vs]) => vs.length >= 3)
        .every(([village]) => (['clinic', 'post', 'shrine', 'tavern'] as const).every((k) => s.buildings.some((b) => b.key === k && b.village === village)));
      const isleDone = (['library', 'market', 'plaza'] as const).every((k) => s.buildings.some((b) => b.key === k));
      if (villagesDone && isleDone && ![...after.values()].some((l) => l.life === 'sick')) { s.golden = night; report.golden = true; }
    }

    report.balance = balance;
    s.reports = [...s.reports, report].slice(-14);
    s.lastNight = night;

    // New Year's night: the Owner closes the Era and sails on.
    if (night.endsWith('-12-31') && Number(night.slice(0, 4)) === s.era) {
      const record = eraRecord(s, i, night);
      report.era = s.era;
      report.balance = record.carry;
      s = nextEra(s, record);
    }
  }
  return s;
}

export function balanceOf(state: IsleState, i: CivInputs): number {
  const s = migrate(state);
  return balanceAt(s, i, i.today, openOnFor(s.buildings));
}
