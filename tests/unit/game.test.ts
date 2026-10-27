import { describe, expect, it } from 'vitest';
import { addDays, cleanText, daysBetween, levelFromXp, matchPerson, matchProject, tagFor, tierOf } from '@/lib/game';

describe('dates', () => {
  it('counts days across months', () => {
    expect(daysBetween('2026-09-28', '2026-10-03')).toBe(5);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('cleanText', () => {
  it('strips links, task metadata and tags', () => {
    expect(cleanText('Call [[Maya Chen|Maya]] about [[GPS]] ⏫ 📅 2026-10-30 #northwind ✅ 2026-10-26'))
      .toBe('Call Maya about GPS');
  });
});

describe('tiers & levels', () => {
  it('maps contact age to lantern tiers', () => {
    expect(tierOf(0)).toBe('warm');
    expect(tierOf(30)).toBe('warm');
    expect(tierOf(31)).toBe('cooling');
    expect(tierOf(120)).toBe('fading');
    expect(tierOf(400)).toBe('fog');
    expect(tierOf(null)).toBe('fog');
  });
  it('levels up at 100, 300, 600…', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, into: 0, need: 100 });
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(299).level).toBe(2);
    expect(levelFromXp(300)).toMatchObject({ level: 3, into: 0, need: 300 });
  });
});

describe('matching', () => {
  const people = [
    { name: 'Maya Chen', aliases: ['Maya'] },
    { name: 'Pak Budi Santoso', aliases: [] },
    { name: 'Diego Alvarez', aliases: [] },
  ];
  it('matches names, aliases and surnames, but not honorifics', () => {
    expect(matchPerson('lunch with maya', people)?.name).toBe('Maya Chen');
    expect(matchPerson('call Santoso', people)?.name).toBe('Pak Budi Santoso');
    expect(matchPerson('pak', people)).toBeNull();
    expect(matchPerson('mayan ruins', people)).toBeNull();
  });

  const projects = [
    { id: 'lighthouse-app', name: 'Lighthouse App', aliases: [] },
    { id: 'telco', name: 'Telco', aliases: ['TC'] },
  ];
  it('matches project names, aliases and first words on word boundaries', () => {
    expect(matchProject('lighthouse pricing page', projects)?.id).toBe('lighthouse-app');
    expect(matchProject('ship TC release', projects)?.id).toBe('telco');
    expect(matchProject('telcom stuff', projects)).toBeNull();
  });

  it('tags text with the right place on the island', () => {
    const ctx = { projects, people, bets: ['Seed round deck'] };
    expect(tagFor('Lighthouse onboarding', ctx).kind).toBe('project');
    expect(tagFor('polish the Seed round deck', ctx).kind).toBe('bet');
    expect(tagFor('coffee with Diego', ctx).kind).toBe('person');
    expect(tagFor('laundry', ctx).kind).toBe('none');
  });
});
