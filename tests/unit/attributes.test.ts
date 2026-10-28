import { describe, expect, it } from 'vitest';
import { classOf, computeAttributes, paceScore, type AttributeInputs } from '@/lib/attributes';

const TODAY = '2026-10-26';
const day = (ago: number) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - ago * 86_400_000).toISOString().slice(0, 10);
const empty = (): AttributeInputs => ({ today: TODAY, dailies: [], tasksDone: [], projectActivity: [], sessionSpans: [], contacts: [], decisions: [], beliefsDecided: [] });
const daily = (ago: number, o: Partial<AttributeInputs['dailies'][number]> = {}) =>
  ({ date: day(ago), checkin: true, planned: 0, done: 0, partly: 0, people: [], reflections: 0, ...o });
const attr = (i: AttributeInputs, key: string) => computeAttributes(i).find((a) => a.key === key)!;

describe('attributes v2', () => {
  it('scores pace against your own last 90 days: 50 is usual, 100 is double or more', () => {
    expect(paceScore(0, 9)).toBe(0);
    expect(paceScore(3, 9)).toBe(50); // steady
    expect(paceScore(6, 12)).toBe(75); // 1.5× your 90-day average (which includes these 30 days)
    expect(paceScore(8, 12)).toBe(100); // twice it
    expect(paceScore(2, 2)).toBe(100); // all of it recent
  });

  it('Follow-through: planned and done, partly counts half', () => {
    const i = empty();
    i.dailies = [daily(1, { planned: 3, done: 2, partly: 0 }), daily(2, { planned: 1, partly: 1 })];
    expect(attr(i, 'followthrough')).toMatchObject({ value: 63, detail: '63% of what you planned got done (partly counts half)' });
    expect(attr(empty(), 'followthrough')).toMatchObject({ value: 0, detail: 'No Dawn plans in the last 30 days' });
  });

  it('Chronicler counts check-in days, not notes, and only the last 30 days', () => {
    const i = empty();
    i.dailies = [...Array.from({ length: 15 }, (_, k) => daily(k * 2)), daily(45), daily(3, { checkin: false })];
    expect(attr(i, 'chronicler')).toMatchObject({ value: 50, detail: 'Checked in on 15 of the last 30 days' });
  });

  it('Builder adds projects moved, active agent hours and tasks done; old activity decays', () => {
    const i = empty();
    i.projectActivity = [{ id: 'a', date: day(2) }, { id: 'b', date: day(60) }];
    const at = (ago: number, h: number) => Date.parse(`${day(ago)}T${String(h).padStart(2, '0')}:00:00Z`);
    // Two agents in parallel from 10:00 to 12:00 are two hours of yours, not four.
    i.sessionSpans = [[at(1, 10), at(1, 12)], [at(1, 10), at(1, 12)], [at(1, 11), at(1, 12)], [at(80, 10), at(80, 11)]];
    i.tasksDone = [day(5), day(5), day(70)];
    const b = attr(i, 'builder');
    expect(b.detail).toBe('1 project moved · 2 h with agents · 2 tasks done');
    expect(b.why).toEqual([
      { label: 'Projects that moved', recent: '1', usual: '0.7' },
      { label: 'Active hours with agents', recent: '2 h', usual: '1 h' },
      { label: 'Tasks completed', recent: '2', usual: '1' },
    ]);
    expect(b.value).toBe(paceScore(1 * 3 + 2 + 2 * 0.5, 2 * 3 + 3 + 3 * 0.5));
  });

  it('Strategist shows calibration with its sample size', () => {
    const i = empty();
    i.decisions = [
      { date: day(3), judgedOn: day(1), verdict: 'Right call' }, { date: day(40), judgedOn: day(2), verdict: 'Wrong call' }, { date: day(10), judgedOn: null, verdict: null },
    ];
    expect(attr(i, 'strategist').detail).toBe('2 decisions sealed · 2 judged · 50% right calls of 2');
  });

  it('Diplomat counts different people, from contacts and Dusk', () => {
    const i = empty();
    i.contacts = [{ name: 'Maya Chen', date: day(4) }, { name: 'Omar', date: day(50) }];
    i.dailies = [daily(2, { people: ['maya chen', 'Diego'] })];
    expect(attr(i, 'diplomat').detail).toBe('In touch with 2 people');
  });

  it('the class follows this month’s strongest attribute', () => {
    const i = empty();
    i.dailies = Array.from({ length: 30 }, (_, k) => daily(k));
    expect(classOf(computeAttributes(i))).toBe('Cartographer');
    i.dailies = i.dailies.map((d) => ({ ...d, checkin: false, planned: 2, done: 2 }));
    expect(classOf(computeAttributes(i))).toBe('Finisher');
    expect(classOf(computeAttributes(empty()))).toBe('Wanderer');
  });
});
