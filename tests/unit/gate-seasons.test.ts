import { describe, expect, it } from 'vitest';
import { checkinFor } from '@/lib/gate';
import { climateFor, describeAuto, seasonFor } from '@/lib/seasons';

const day = (o: Partial<{ locked: boolean; closed: boolean; skipped: ('dawn' | 'dusk')[] }> = {}) =>
  ({ locked: false, closed: false, skipped: [], ...o });

describe('check-in gate', () => {
  it('opens Dawn in the morning until the plan is locked or skipped', () => {
    expect(checkinFor(day(), '08:00', '17:00', true)).toEqual({ mode: 'dawn', gate: 'dawn', duskFrom: '17:00' });
    expect(checkinFor(day({ locked: true }), '08:00', '17:00', true).gate).toBeNull();
    expect(checkinFor(day({ skipped: ['dawn'] }), '08:00', '17:00', true).gate).toBeNull();
  });

  it('opens Dusk in the evening, even if the plan was never locked', () => {
    expect(checkinFor(day({ locked: true }), '18:30', '17:00', true)).toMatchObject({ mode: 'dusk', gate: 'dusk' });
    expect(checkinFor(day(), '17:00', '17:00', true).gate).toBe('dusk');
    expect(checkinFor(day({ skipped: ['dawn'] }), '19:00', '17:00', true).gate).toBe('dusk');
  });

  it('stays out of the way once the day is closed, Dusk is skipped, or the gate is off', () => {
    expect(checkinFor(day({ closed: true }), '20:00', '17:00', true)).toMatchObject({ mode: 'dusk', gate: null });
    expect(checkinFor(day({ skipped: ['dusk'] }), '20:00', '17:00', true).gate).toBeNull();
    expect(checkinFor(day(), '08:00', '17:00', false).gate).toBeNull();
  });
});

describe('seasons', () => {
  it('uses the four seasons by hemisphere', () => {
    expect(seasonFor(climateFor('Europe/Berlin'), 1)).toBe('winter');
    expect(seasonFor(climateFor('Europe/Berlin'), 4)).toBe('spring');
    expect(seasonFor(climateFor('America/New_York'), 7)).toBe('summer');
    expect(seasonFor(climateFor('Australia/Sydney'), 7)).toBe('winter');
    expect(seasonFor(climateFor('Australia/Sydney'), 10)).toBe('spring');
    expect(seasonFor(climateFor('Pacific/Auckland'), 4)).toBe('autumn');
  });

  it('uses dry and wet seasons near the equator', () => {
    const c = climateFor('Asia/Jakarta');
    expect(c.kind).toBe('tropical');
    expect(seasonFor(c, 1)).toBe('wet');
    expect(seasonFor(c, 7)).toBe('dry');
    expect(describeAuto(c, 12)).toBe('Wet season · wet Nov–Mar');
    expect(seasonFor(climateFor('Australia/Darwin'), 2)).toBe('wet');
    expect(seasonFor(climateFor('Asia/Bangkok'), 8)).toBe('wet');
  });

  it('honours settings overrides', () => {
    expect(seasonFor(climateFor('Europe/Berlin', { kind: 'tropical', wetMonths: [6, 7] }), 6)).toBe('wet');
    expect(seasonFor(climateFor('Asia/Jakarta', { kind: 'south' }), 7)).toBe('winter');
    expect(climateFor('UTC').kind).toBe('north');
  });
});
