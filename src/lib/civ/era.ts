// F4: the year's chronicle, written by rules from the Era record. Pure.
import { fmtDate } from '../game';
import { buildingLabel, type EraRecord } from './owner';
import { BUILDINGS, WONDER_GOAL } from './rules';

export const ERAS_DIR = 'Mind Isle/Eras';
export const eraNote = (year: number) => `${ERAS_DIR}/${year}.md`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** The chronicle as paragraphs, in Atlas's voice. `closed`: the year is over (else "so far"). */
export function chronicle(r: EraRecord, closed: boolean): { title: string; paragraphs: string[]; facts: [string, string][] } {
  const p: string[] = [];
  const when = closed ? `The year ${r.year} is over.` : `${r.year} so far, from ${fmtDate(r.from)}.`;
  p.push(`${when} You earned ${r.earned} 🐚${r.bonus ? `, and ${r.bonus} more from challenges` : ''}. I spent ${r.spent} on the island.`);
  const built = r.built.filter((b) => BUILDINGS[b.key].scope !== 'wonder');
  if (built.length) {
    const first = built[0];
    p.push(`I built ${plural(built.length, 'thing')}, starting with a ${buildingLabel(first)} on ${fmtDate(first.built)}.${built.some((b) => b.level > 1) ? ` ${plural(built.filter((b) => b.level > 1).length, 'building')} went up a level.` : ''}`);
  } else p.push('Nothing was built. The island stayed as it was found.');
  if (r.wonders.length) p.push(`Wonders rose: ${list(r.wonders.map((w) => `the ${BUILDINGS[w].name}`))}.`);
  if (r.golden) p.push(`On ${fmtDate(r.golden)} the island entered a Golden Age ✨.`);
  if (r.rebirths.length) p.push(`${plural(r.rebirths.length, 'person', 'people')} came back after being lost: ${list([...new Set(r.rebirths.map((x) => x.name))].slice(0, 8))}${new Set(r.rebirths.map((x) => x.name)).size > 8 ? ' and others' : ''}.`);
  if (r.deaths.length) p.push(`${plural(r.deaths.length, 'time', 'times')} someone faded into a ghost${r.deaths.length > 3 ? `; the last was ${r.deaths.at(-1)!.name}` : `: ${list(r.deaths.map((d) => d.name))}`}.`);
  if (r.top.length) p.push(`You stayed closest to ${list(r.top.slice(0, 3).map((t) => t.name))}.`);
  if (r.finished.length) p.push(`Finished: ${list(r.finished)}.`);
  p.push(closed
    ? `I sail on with ${r.carry} 🐚, a quarter of what was left, and the blueprints for everything built here. Your people come with me, alive or not. This island stays as it is.`
    : `If the year ended tonight I’d sail on with ${r.carry} 🐚.`);
  return {
    title: `The island of ${r.year}`,
    paragraphs: p,
    facts: [
      ['Shells earned', `${r.earned + r.bonus}`],
      ['Buildings', `${built.length}`],
      ['Wonders', r.wonders.map((w) => BUILDINGS[w].icon).join(' ') || '–'],
      ['Festivals · storms', `${r.festivals} · ${r.storms}`],
      ['Challenges won', `${r.challenges.won} of ${r.challenges.won + r.challenges.lost}`],
      ['Brought back · lost', `${r.rebirths.length} · ${r.deaths.length}`],
      ['Alive at the end · ghosts', `${r.alive} · ${r.ghosts}`],
    ],
  };
}

/** The chronicle note for the vault. */
export function chronicleNote(r: EraRecord): string {
  const c = chronicle(r, true);
  return [
    '---', 'type: era', `year: ${r.year}`, `from: ${r.from}`, `to: ${r.to}`, `shells: ${r.earned + r.bonus}`, `golden_age: ${r.golden ?? 'null'}`, '---', '',
    `# ${c.title}`, '', ...c.paragraphs.flatMap((x) => [x, '']),
    '## The year in numbers', '', '| | |', '|---|---|', ...c.facts.map(([a, b]) => `| ${a} | ${b} |`), '',
    '## Built', '', ...(r.built.length ? r.built.map((b) => `- ${b.built} ${BUILDINGS[b.key].icon} ${buildingLabel(b)}${b.level > 1 ? ` (level ${b.level})` : ''}`) : ['- Nothing']), '',
    '## Came back', '', ...(r.rebirths.length ? r.rebirths.map((x) => `- ${x.date} [[${x.name}]]`) : ['- Nobody']), '',
    '## Lost', '', ...(r.deaths.length ? r.deaths.map((x) => `- ${x.date} [[${x.name}]]`) : ['- Nobody']), '',
    `_Written by Atlas, Owner of the isle. Wonder goals: ${Object.values(WONDER_GOAL).map((g) => `${g.need} ${g.what}`).join('; ')}._`, '',
  ].join('\n');
}
