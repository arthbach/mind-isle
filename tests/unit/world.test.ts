import { describe, expect, it } from 'vitest';
import { getWorld } from '@/lib/world';

describe('compiling the demo vault', async () => {
  const w = await getWorld();

  it('finds every kind of note', () => {
    expect(w.projects).toHaveLength(9);
    expect(w.people).toHaveLength(15);
    expect(w.beliefs).toHaveLength(5);
    expect(w.bets).toHaveLength(3);
    expect(w.achievements.filter((a) => !a.auto)).toHaveLength(6);
  });

  it('orders projects active-first and flags ventures', () => {
    expect(w.projects[0].status).toBe('active');
    expect(w.projects.find((p) => p.name === 'Lighthouse App')?.venture).toBe(true);
    expect(w.projects.find((p) => p.name === 'Clinic Booking Pilot')?.status).toBe('blocked');
  });

  it('collects decisions from decision notes and meeting/daily bullets', () => {
    const titles = w.decisions.map((d) => d.title);
    expect(titles).toContain('Price by outcome, not hours');
    expect(titles).toContain('Optimise for empty miles first, delivery windows second');
    expect(titles).toContain('Use an off-the-shelf solver for Northwind instead of writing one');
    expect(w.decisions.find((d) => d.title === 'Stop taking fixed-bid work')?.state).toBe('judged');
    expect(w.decisions.find((d) => d.title === 'Price by outcome, not hours')?.state).toBe('due');
  });

  it('puts overdue, high-priority quests first and marks bets private', () => {
    expect(w.quests[0].overdue).toBe(true);
    expect(w.quests.every((q, i, a) => i === 0 || !q.overdue || a[i - 1].overdue)).toBe(true);
  });

  it('groups people into villages by company', () => {
    expect(w.villages[0].name).toBe('Northwind Logistics');
    expect(w.villages[0].people).toHaveLength(3);
  });

  it('never exposes private trophies as public', () => {
    expect(w.achievements.find((a) => a.title.startsWith('Lesson'))?.isPublic).toBe(false);
  });

  it('picks the season from the timezone', () => {
    expect(w.season.auto).toBe('autumn'); // UTC → northern hemisphere, October
  });
});
