import { describe, expect, it } from 'vitest';
import { earnings, total, type CivInputs, type Villager } from '@/lib/civ/earn';
import { lifeOf } from '@/lib/civ/life';
import { challengeProgress, deathsOf, eraRecord, migrate, newState, openOnFor, rankChoices, runNights, type IsleState } from '@/lib/civ/owner';
import { chronicle, chronicleNote } from '@/lib/civ/era';
import { BUILDINGS, START_GRANT } from '@/lib/civ/rules';

const person = (over: Partial<Villager> = {}): Villager => ({
  id: 'ana', name: 'Ana', path: '04 People/Ana.md', village: 'Acme', circle: 'client', memoriam: false, contacts: [], about: null, birthday: null, ...over,
});
const inputs = (over: Partial<CivInputs> = {}): CivInputs => ({
  today: '2026-10-28', villagers: [], quests: [], dailies: [], projectLogs: [], summaries: [], judged: [], projects: [], ...over,
});

describe('life', () => {
  it('follows the clock: thriving, idle, sick, ghost', () => {
    expect(lifeOf(['2026-10-25'], 'client', '2026-10-28').life).toBe('thriving');
    expect(lifeOf(['2026-10-18'], 'client', '2026-10-28').life).toBe('idle'); // 10 days, idle from 8
    expect(lifeOf(['2026-10-12'], 'client', '2026-10-28')).toMatchObject({ life: 'sick', days: 16, left: 14 });
    expect(lifeOf(['2026-09-01'], 'client', '2026-10-28').life).toBe('ghost');
    expect(lifeOf(['2026-09-01'], 'network', '2026-10-28').life).toBe('sick'); // 57 days, network sick at 45
  });

  it('a Clinic stretches only the current gap', () => {
    expect(lifeOf(['2026-09-25'], 'client', '2026-10-28').life).toBe('ghost'); // 33 days
    expect(lifeOf(['2026-09-25'], 'client', '2026-10-28', { grace: 7 }).life).toBe('sick');
  });

  it('counts deaths and rebirths from gaps in the history', () => {
    const r = lifeOf(['2026-01-01', '2026-03-01', '2026-03-10', '2026-06-01', '2026-10-27'], 'client', '2026-10-28');
    expect(r.rebirths).toEqual(['2026-03-01', '2026-06-01', '2026-10-27']);
    expect(r).toMatchObject({ lives: 4, life: 'thriving' });
  });

  it('never logged is unknown; in memoriam is a spirit', () => {
    expect(lifeOf([], 'close', '2026-10-28').life).toBe('unknown');
    expect(lifeOf(['2020-01-01'], 'close', '2026-10-28', { memoriam: true }).life).toBe('spirit');
  });
});

describe('shells', () => {
  it('pays for quests by priority, at most ten a day', () => {
    const quests = [
      { date: '2026-10-27', priority: 'high' as const, text: 'Big' },
      ...Array.from({ length: 12 }, (_, k) => ({ date: '2026-10-27', priority: null, text: `small ${k}` })),
    ];
    const e = earnings(inputs({ quests }), '2026-10-27', '2026-10-27');
    expect(e.filter((x) => x.kind === 'quest')).toHaveLength(10);
    expect(total(e)).toBe(3 + 9);
  });

  it('pays for check-ins, plan items, talks and rebirths, and buildings add to them', () => {
    const villagers = [person({ contacts: ['2026-08-01', '2026-10-27'] }), person({ id: 'bo', name: 'Bo', contacts: ['2026-10-20', '2026-10-27'] })];
    const i = inputs({ villagers, dailies: [{ date: '2026-10-27', locked: true, closed: true, planDone: 2 }] });
    const e = earnings(i, '2026-10-27', '2026-10-27');
    expect(e.find((x) => x.kind === 'rebirth')).toMatchObject({ shells: 10, text: 'Brought Ana back' });
    expect(e.find((x) => x.kind === 'talk')).toMatchObject({ shells: 3, text: 'Talked to Bo' });
    expect(total(e)).toBe(2 + 2 + 4 + 10 + 3);
    const withShrine = earnings(i, '2026-10-27', '2026-10-27', (k) => (k === 'shrine' || k === 'tavern' ? 1 : 0));
    expect(total(withShrine)).toBe(2 + 2 + 4 + 15 + 4);
  });
});

describe('the Owner', () => {
  const sickAna = person({ contacts: ['2026-10-05'] }); // 22 days by 10-27: sick, 8 left
  const others = [person({ id: 'b', name: 'Bo', contacts: ['2026-10-26'] }), person({ id: 'c', name: 'Cy', contacts: ['2026-10-26'] })];

  it('ranks a Clinic first when someone is sick, and says why', () => {
    const [top] = rankChoices(inputs({ villagers: [sickAna, ...others] }), newState('2026-10-27', 0), '2026-10-27');
    expect(top).toMatchObject({ key: 'clinic', village: 'Acme' });
    expect(top.why).toMatch(/Ana is sick/);
  });

  it('builds the top choice when it can afford it, once, and reports it', () => {
    const i = inputs({ villagers: [sickAna, ...others], dailies: Array.from({ length: 7 }, (_, k) => ({ date: `2026-10-2${k + 1}`, locked: true, closed: true, planDone: 0 })) });
    const s = runNights(newState('2026-10-28', 7), i);
    expect(s.lastNight).toBe('2026-10-27');
    expect(s.buildings.map((b) => b.key)).toEqual(['clinic']);
    expect(s.reports.some((r) => r.built?.key === 'clinic')).toBe(true);
    expect(s.spent).toBeGreaterThanOrEqual(45);
    // Running again changes nothing: every night is processed once.
    expect(runNights(s, i)).toEqual(s);
  });

  it('saves up when it can’t afford the top choice', () => {
    const i = inputs({ today: '2026-10-22', villagers: [sickAna] });
    const s = runNights(newState('2026-10-22', 1), i);
    expect(s.buildings).toEqual([]);
    expect(s.reports.at(-1)?.saving?.key).toBe('clinic');
    expect(s.reports.at(-1)?.balance).toBe(START_GRANT);
  });

  it('closes the newest building when upkeep can’t be paid', () => {
    const s0 = { ...newState('2026-10-28', 7), spent: START_GRANT, buildings: [{ key: 'clinic' as const, village: 'Acme', built: '2026-10-01', closed: [] as [string, string | null][] }] };
    const s = runNights(s0, inputs());
    expect(s.buildings[0].closed).toEqual([['2026-10-27', null]]);
    expect(s.reports.at(-1)?.closed).toEqual(['Clinic in Acme']);
  });
});

// Every day from..to locked at Dawn: steady earnings, so no storms.
const steady = (from: string, n: number) => Array.from({ length: n }, (_, k) => {
  const d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10) + k)).toISOString().slice(0, 10);
  return { date: d, locked: true, closed: true, planDone: 0 };
});
const withBuildings = (today: string, backfill: number, over: Partial<IsleState>) => ({ ...newState(today, backfill), ...over });

describe('events', () => {
  it('a calm village gets a festival, and talks there pay more that day', () => {
    const vs = ['a', 'b', 'c'].map((id) => person({ id, name: id.toUpperCase(), contacts: ['2026-10-20'] }));
    const s = runNights(newState('2026-10-23', 2), inputs({ today: '2026-10-23', villagers: vs, dailies: steady('2026-10-21', 2) }));
    expect(s.festivals[0]).toMatchObject({ village: 'Acme', date: '2026-10-22', why: 'calm' });
    expect(s.reports[0].festival).toBe('Acme');
    // The next festival waits two weeks.
    expect(s.festivals).toHaveLength(1);
    const talk = (fest: boolean) => earnings(inputs({ villagers: [person({ contacts: ['2026-10-22'] })] }), '2026-10-22', '2026-10-22', undefined, () => fest);
    expect(total(talk(true)) - total(talk(false))).toBe(3);
  });

  it('no festival with three ghosts, or anyone sick', () => {
    const alive = ['a', 'b', 'c'].map((id) => person({ id, name: id, contacts: ['2026-10-20'] }));
    const ghosts = ['g1', 'g2', 'g3'].map((id) => person({ id, name: id, contacts: ['2026-01-01'] }));
    const s = runNights(newState('2026-10-23', 2), inputs({ today: '2026-10-23', villagers: [...alive, ...ghosts], dailies: steady('2026-10-21', 2) }));
    expect(s.festivals).toEqual([]);
  });

  it('three quiet days bring a storm that breaks the newest building, and the Owner mends it', () => {
    const s0 = withBuildings('2026-10-25', 4, { grant: 200, buildings: [
      { key: 'clinic', village: 'Acme', built: '2026-10-01', closed: [] },
      { key: 'post', village: 'Acme', built: '2026-10-05', closed: [] },
    ] });
    const s = runNights(s0, inputs({ today: '2026-10-25' }));
    const night = s.reports.find((r) => r.storm);
    expect(night).toMatchObject({ night: '2026-10-23', storm: 'Post Office in Acme' });
    expect(s.reports.at(-1)?.built).toMatchObject({ key: 'post', action: 'repair', cost: 10 });
    expect(s.buildings[1].damaged).toEqual([['2026-10-24', '2026-10-25']]);
    expect(openOnFor(s.buildings)('post', 'Acme', '2026-10-24')).toBe(0);
    expect(openOnFor(s.buildings)('post', 'Acme', '2026-10-25')).toBe(1);
  });

  it('birthdays pay a bonus when you talk on the day', () => {
    const e = earnings(inputs({ villagers: [person({ birthday: '10-27', contacts: ['2026-10-20', '2026-10-27'] })] }), '2026-10-27', '2026-10-27');
    expect(e.find((x) => x.kind === 'birthday')).toMatchObject({ shells: 5, text: 'Ana’s birthday' });
  });
});

describe('levels, Wonders and the Golden Age', () => {
  it('a Clinic that brought people back earns level 2, and gives more time', () => {
    const back = ['a', 'b', 'c'].map((id) => person({ id, name: id, contacts: ['2026-08-01', '2026-10-25'] }));
    const s0 = withBuildings('2026-10-28', 1, { grant: 100, buildings: [{ key: 'clinic', village: 'Acme', built: '2026-10-01', closed: [] }] });
    const [top] = rankChoices(inputs({ villagers: back }), s0, '2026-10-27');
    expect(top).toMatchObject({ key: 'clinic', action: 'upgrade', level: 2, cost: 27 });
    const s = runNights(s0, inputs({ villagers: back, dailies: steady('2026-10-27', 1) }));
    expect(s.buildings[0].up).toEqual(['2026-10-27']);
    expect(openOnFor(s.buildings)('clinic', 'Acme', '2026-10-28')).toBe(2);
    // Level 2 is 10 days of grace: 33 days without contact is still sick.
    const sick = person({ contacts: ['2026-09-25'] });
    expect(lifeOf(sick.contacts, 'client', '2026-10-28', { grace: 10 }).life).toBe('sick');
  });

  it('a Wonder unlocks by what you did, then needs the Plaza, then gets built', () => {
    const dailies = steady('2026-08-01', 88);
    const s0 = withBuildings('2026-10-28', 88, { grant: 0 });
    const s = runNights(s0, inputs({ dailies }));
    expect(s.unlocked.archive).toBe('2026-09-29'); // the 60th Dawn locked
    expect(s.unlocked.lighthouse).toBe('2026-09-29'); // 60 nights with nobody dying
    // Land first, then the Wonders, one at a time as the Shells come in.
    expect(s.buildings.map((b) => [b.key, b.built])).toEqual([['plaza', '2026-09-29'], ['lighthouse', '2026-09-30']]);
  });

  it('knows when someone died', () => {
    const open = openOnFor([]);
    expect(deathsOf(person({ contacts: ['2026-09-01'] }), '2026-10-01', '2026-10-28', open)).toEqual(['2026-10-02']);
    expect(deathsOf(person({ contacts: ['2026-08-01', '2026-10-01'] }), '2026-08-01', '2026-10-28', open)).toEqual(['2026-09-01']);
  });

  it('declares a Golden Age when every village has everything and nobody is sick', () => {
    const vs = ['a', 'b', 'c'].map((id) => person({ id, name: id, contacts: ['2026-10-26'] }));
    const at = (key: 'clinic' | 'post' | 'shrine' | 'tavern' | 'library' | 'market' | 'plaza', village: string | null) => ({ key, village, built: '2026-10-01', closed: [] as [string, string | null][] });
    const s0 = withBuildings('2026-10-28', 1, { grant: 100, buildings: [
      at('clinic', 'Acme'), at('post', 'Acme'), at('shrine', 'Acme'), at('tavern', 'Acme'), at('library', null), at('market', null), at('plaza', null),
    ] });
    const s = runNights(s0, inputs({ villagers: vs, dailies: steady('2026-10-27', 1) }));
    expect(s.golden).toBe('2026-10-27');
    expect(s.reports.at(-1)?.golden).toBe(true);
  });
});

describe('the weekly challenge', () => {
  it('asks you to reach people in the village most in need, and pays when you do', () => {
    const sick = ['a', 'b'].map((id) => person({ id, name: id.toUpperCase(), contacts: ['2026-10-05'] }));
    const s1 = runNights(newState('2026-10-22', 1), inputs({ today: '2026-10-22', villagers: sick }));
    const c = s1.challenges[0];
    expect(c).toMatchObject({ from: '2026-10-22', to: '2026-10-25', kind: 'reach', village: 'Acme', need: 2, reward: 25, result: null });
    const reached = sick.map((v) => ({ ...v, contacts: [...v.contacts, '2026-10-24'] }));
    expect(challengeProgress(inputs({ villagers: reached }), c, '2026-10-24')).toBe(2);
    const s2 = runNights(s1, inputs({ today: '2026-10-27', villagers: reached }));
    expect(s2.challenges[0].result).toBe('won');
    expect(s2.bonus).toBe(25);
    expect(s2.festivals.some((f) => f.why === 'challenge' && f.date === '2026-10-26')).toBe(true);
    // The next one is posted on the latest night only, never for days already gone.
    expect(s2.challenges[1]).toMatchObject({ from: '2026-10-27', result: null });
  });
});

describe('Eras', () => {
  it('on New Year’s night, closes the year and sails to a new island with a quarter of the treasury', () => {
    const s0 = withBuildings('2026-12-30', 3, { grant: 200, buildings: [{ key: 'clinic', village: 'Acme', built: '2026-12-01', closed: [] }] });
    const villagers = [person({ contacts: ['2026-12-20', '2026-12-29'] })];
    const i = inputs({ today: '2027-01-02', villagers, dailies: steady('2026-12-27', 6) });
    const s = runNights(s0, i);
    expect(s.era).toBe(2027);
    expect(s.started).toBe('2027-01-01');
    expect(s.buildings).toEqual([]);
    expect(s.blueprints).toEqual(['clinic|Acme']);
    expect(s.eras).toHaveLength(1);
    const r = s.eras[0];
    expect(r).toMatchObject({ year: 2026, to: '2026-12-31', carry: Math.floor(r.balance / 4) });
    expect(s.grant).toBe(r.carry);
    expect(s.reports.find((x) => x.night === '2026-12-31')?.era).toBe(2026);
    // A blueprint halves the price.
    const sick = person({ contacts: ['2026-12-10'] });
    expect(rankChoices(inputs({ today: '2027-01-02', villagers: [sick] }), s, '2027-01-02')[0]).toMatchObject({ key: 'clinic', cost: Math.round(BUILDINGS.clinic.cost / 2) });
  });

  it('writes a chronicle from the record', () => {
    const s = migrate({ ...newState('2026-10-28', 7) });
    const r = eraRecord(s, inputs({ villagers: [person({ contacts: ['2026-08-01', '2026-10-25'] })], projects: [{ name: 'Northwind', status: 'done', last: '2026-10-24' }] }), '2026-12-31');
    expect(r.rebirths).toEqual([{ name: 'Ana', date: '2026-10-25' }]);
    expect(r.finished).toEqual(['Northwind']);
    expect(chronicle(r, true).paragraphs.join(' ')).toMatch(/came back after being lost: Ana/);
    const note = chronicleNote(r);
    expect(note).toMatch(/^---\ntype: era\nyear: 2026/);
    expect(note).toMatch(/- 2026-10-25 \[\[Ana\]\]/);
  });
});

describe('the civilization on the demo vault', () => {
  it('reads contact history from meetings, dailies and last_contact, and runs the first week', async () => {
    const { civInputs, getIsle } = await import('@/lib/civ');
    const i = await civInputs();
    const maya = i.villagers.find((v) => v.name === 'Maya Chen')!;
    expect(maya.contacts).toEqual(expect.arrayContaining(['2026-09-02', '2026-10-20']));
    expect(maya.about).toBe('Northwind Kickoff');
    const isle = await getIsle();
    expect(isle.started).toBe('2026-10-19');
    expect(isle.reports.at(-1)?.night).toBe('2026-10-25');
    expect(isle.villagers.find((v) => v.name === 'Maya Chen')?.life).toBe('thriving');
    expect(isle.balance).toBeGreaterThanOrEqual(0);
  });

  it('sets a villager’s circle in their note', async () => {
    const checkin = await import('@/lib/checkin');
    const { read } = await import('./helpers');
    await expect(checkin.setCircle('04 People/Maya Chen.md', 'family')).rejects.toThrow(/Unknown circle/);
    await checkin.setCircle('04 People/Maya Chen.md', 'close');
    expect(read('04 People/Maya Chen.md')).toMatch(/circle: close/);
  });
});
