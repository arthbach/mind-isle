import { describe, expect, it } from 'vitest';
import * as checkin from '@/lib/checkin';
import { section, splitFrontmatter } from '@/lib/vault/markdown';
import { getWorld } from '@/lib/world';
import { DAILY, exists, read, write } from './helpers';

// The tests in this file run in order against one throwaway vault, pinned to 2026-10-26 08:00 UTC.
describe('the daily loop', () => {
  it('starts with a Dawn gate', async () => {
    const w = await getWorld();
    expect(w.checkin).toEqual({ mode: 'dawn', gate: 'dawn', duskFrom: '17:00' });
    expect(exists(DAILY)).toBe(false);
  });

  it('records a skip without counting it as a check-in', async () => {
    await checkin.skipPhase('dawn');
    await checkin.skipPhase('dawn'); // idempotent
    expect(splitFrontmatter(read(DAILY)).fm.skipped).toEqual(['dawn']);
    const w = await getWorld();
    expect(w.checkin.gate).toBeNull();
    expect(w.calendar.at(-1)).toEqual({ date: '2026-10-26', kind: 'skipped' });
  });

  it('writes the Dawn plan into the daily note', async () => {
    await checkin.writeDawn({ energy: 4, items: ['Ship the new onboarding flow', 'Call Maya about GPS', 'Lighthouse pricing [[draft]]'] });
    const raw = read(DAILY);
    const { fm } = splitFrontmatter(raw);
    expect(fm).toMatchObject({ type: 'daily', energy: 4, plan_locked: true, skipped: ['dawn'] });
    expect(raw).toContain('## Plan\n- [ ] Ship the new onboarding flow\n- [ ] Call Maya about GPS\n- [ ] Lighthouse pricing draft');
    const w = await getWorld();
    expect(w.day.locked).toBe(true);
    expect(w.calendar.at(-1)?.kind).toBe('daily');
  });

  it('rejects invalid energy and caps input', async () => {
    await checkin.writeDawn({ energy: 9, items: ['Ship the new onboarding flow', 'Call Maya about GPS', 'Lighthouse pricing draft'] });
    expect(splitFrontmatter(read(DAILY)).fm.energy).toBeNull();
  });

  it('closes the day: plan statuses, people, projects, quests and decisions', async () => {
    await checkin.writeDusk({
      statuses: ['done', 'partly', 'moved'],
      extra: ['Fixed the Pixel Garden save bug'],
      people: ['Maya, Lena Park', 'Someone New'],
      decision: 'Charge per optimised route',
      reflection: 'Tired but happy',
    });
    const raw = read(DAILY);
    expect(raw).toContain('- [x] Ship the new onboarding flow ✅ 2026-10-26');
    expect(raw).toContain('- [/] Call Maya about GPS');
    expect(raw).toContain('- [>] Lighthouse pricing draft');
    expect(raw).toContain('## People\n- [[Maya Chen]]\n- [[Lena Park]]\n- Someone New');
    expect(raw).toContain('## Decisions\n- Charge per optimised route');
    expect(splitFrontmatter(raw).fm.closed).toBe(true);

    // Lanterns lit
    expect(splitFrontmatter(read('04 People/Maya Chen.md')).fm.last_contact).toBe('2026-10-26');
    // The matching open task in the project note is ticked, and the project counts as moved
    const project = read('03 Projects/Lighthouse App/Lighthouse App.md');
    expect(project).toContain('- [x] Ship the new onboarding flow 🔼 📅 2026-10-30 #lighthouse ✅ 2026-10-26');
    expect(splitFrontmatter(project).fm.last_activity).toBe('2026-10-26');
    // A bonus win that names a project moves it too
    expect(splitFrontmatter(read('03 Projects/Pixel Garden Game/Pixel Garden Game.md')).fm.last_activity).toBe('2026-10-26');

    const w = await getWorld();
    expect(w.day.closed).toBe(true);
    expect(w.checkin.gate).toBeNull();
    expect(w.decisions.some((d) => d.title === 'Charge per optimised route' && d.state === 'sealed')).toBe(true);
  });

  it('does not duplicate the reflection when closing twice', async () => {
    await checkin.writeDusk({ statuses: ['done', 'partly', 'moved'], extra: [], people: [], decision: '', reflection: 'Tired but happy' });
    expect(read(DAILY).match(/Tired but happy/g)).toHaveLength(1);
  });
});

describe('board actions', () => {
  it('completes a quest only if it still matches what was shown', async () => {
    const w = await getWorld();
    const q = w.quests.find((x) => x.text.startsWith('Draw the winter tileset'));
    expect(q).toBeDefined();
    await expect(checkin.completeQuest(q!.id, 'Something else')).rejects.toThrow(/changed/);
    await checkin.completeQuest(q!.id, q!.text);
    expect(read(q!.path)).toContain('- [x] Draw the winter tileset');
  });

  it('drops a quest as cancelled, and it leaves the board', async () => {
    const w = await getWorld();
    const q = w.quests.find((x) => x.text.startsWith('Write the pricing page copy'))!;
    await checkin.dropQuest(q.id, q.text);
    expect(read(q.path)).toContain('- [-] Write the pricing page copy #lighthouse ❌ 2026-10-26');
    expect((await getWorld()).quests.some((x) => x.text.startsWith('Write the pricing page copy'))).toBe(false);
  });

  it('logs a past project update: dated line, last_activity only forward, status if given', async () => {
    const rel = '03 Projects/Lighthouse App/Lighthouse App.md';
    await expect(checkin.logProjectUpdate({ rel, text: 'x', date: '2026-11-01' })).rejects.toThrow(/future/);
    await expect(checkin.logProjectUpdate({ rel: '04 People/Rosa Martín.md', text: 'x', date: '2026-10-01' })).rejects.toThrow(/Not a project/);
    write(rel, read(rel).replace(/last_activity: .*/, 'last_activity: 2026-10-20'));
    await checkin.logProjectUpdate({ rel, text: 'Beta invite sent', date: '2026-10-24' });
    await checkin.logProjectUpdate({ rel, text: 'Old milestone', date: '2026-09-01' });
    await checkin.logProjectUpdate({ rel, text: 'Old milestone', date: '2026-09-01' });
    let raw = read(rel);
    expect(splitFrontmatter(raw).fm.last_activity).toBe('2026-10-24');
    expect(section(splitFrontmatter(raw).body, 'log', true).trim()).toBe('- 2026-10-24 Beta invite sent\n- 2026-09-01 Old milestone');
    await checkin.logProjectUpdate({ rel, text: 'Paused for the holidays', date: '2026-10-25', status: 'paused' });
    raw = read(rel);
    expect(splitFrontmatter(raw).fm).toMatchObject({ status: 'paused', last_activity: '2026-10-25' });
    const p = (await getWorld()).projects.find((x) => x.path === rel)!;
    expect(p.status).toBe('paused');
    expect(p.log.map((u) => u.text)).toEqual(['Paused for the holidays', 'Beta invite sent', 'Old milestone']);
  });

  it('only lights lanterns on person notes', async () => {
    await expect(checkin.touchPerson('03 Projects/Lighthouse App/Lighthouse App.md')).rejects.toThrow(/Not a person/);
    await checkin.touchPerson('04 People/Rosa Martín.md');
    expect(splitFrontmatter(read('04 People/Rosa Martín.md')).fm.last_contact).toBe('2026-10-26');
  });

  it('stores verdicts on decision notes, and rejects unknown verdicts', async () => {
    const rel = '05 Mind/Decisions/Price by outcome, not hours.md';
    await expect(checkin.setVerdict('n-x', rel, 'Great!')).rejects.toThrow(/Unknown verdict/);
    await checkin.setVerdict('n-x', rel, 'Right call');
    expect(splitFrontmatter(read(rel)).fm).toMatchObject({ verdict: 'Right call', judged_on: '2026-10-26' });
  });
});
