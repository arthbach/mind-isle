// Game rules shared by server and client. No Node imports here.
import type { Tier, TagContext } from './types';

export const RULES = {
  /** Active project silent this long grows weeds. */
  weeds: 45,
  heavyWeeds: 90,
  /** Project silent this long is covered in fog. */
  projectFog: 120,
  /** Active project touched this recently has workers on site. */
  fresh: 14,
  /** Person tiers by days since last contact. */
  warm: 30,
  cooling: 90,
  fading: 180,
  /** Days until a decision's seal cracks, unless it sets review_on. */
  review: 90,
};

export const VERDICTS = ['Right call', 'Wrong call', 'Mixed', 'Too early'] as const;

const DAY_MS = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

export function addDays(d: string, n: number): string {
  return new Date(utc(d) + n * DAY_MS).toISOString().slice(0, 10);
}

export function isoInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function fmtDate(d: string | null): string {
  if (!d) return 'unknown';
  return new Date(utc(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function tierOf(days: number | null): Tier {
  if (days === null) return 'fog';
  if (days <= RULES.warm) return 'warm';
  if (days <= RULES.cooling) return 'cooling';
  if (days <= RULES.fading) return 'fading';
  return 'fog';
}

export const TIER_LABEL: Record<Tier, string> = {
  warm: `Warm lantern: in touch within ${RULES.warm} days`,
  cooling: `Cooling: ${RULES.warm + 1}–${RULES.cooling} days`,
  fading: `Fading: ${RULES.cooling + 1}–${RULES.fading} days`,
  fog: `In the fog: ${RULES.fading}+ days or never logged`,
};

/** Cumulative XP needed to reach a level: L1 = 0, L2 = 100, L3 = 300, ... */
const xpFor = (level: number) => 50 * (level - 1) * level;

export function levelFromXp(total: number) {
  let level = 1;
  while (xpFor(level + 1) <= total) level++;
  return { total, level, into: total - xpFor(level), need: xpFor(level + 1) - xpFor(level) };
}

/** Strip Obsidian/markdown syntax and Tasks-plugin metadata from a line. */
export function cleanText(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/[📅⏳🛫✅➕❌]️?\s*\d{4}-\d{2}-\d{2}/gu, '')
    .replace(/[⏫🔼🔽🔺⏬]️?/gu, '')
    .replace(/🔁️?[^#\n]*/gu, '')
    .replace(/(^|\s)#[\w/-]+/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
}

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}($|[^\\p{L}\\p{N}])`, 'iu');
const HONORIFICS = new Set(['pak', 'bu', 'ibu', 'bapak', 'mas', 'mbak', 'prof', 'dr', 'mr', 'mrs', 'ms']);

/** Names a person can be recognised by in free text, longest first. */
function personKeys(p: { name: string; aliases: string[] }): string[] {
  const words = p.name.split(/\s+/).filter((w) => w.length >= 4 && !HONORIFICS.has(w.toLowerCase()));
  return [p.name, ...p.aliases.filter((a) => a.length >= 2), ...words];
}

export function matchPerson<T extends { name: string; aliases: string[] }>(text: string, people: T[]): T | null {
  if (!text.trim()) return null;
  for (const pass of [0, 1]) {
    for (const p of people) {
      const keys = personKeys(p);
      const pool = pass === 0 ? keys.slice(0, 1 + p.aliases.length) : keys;
      if (pool.some((k) => wordRe(k).test(text))) return p;
    }
  }
  return null;
}

export function matchProject<T extends { id: string; name: string; aliases: string[] }>(text: string, projects: T[]): T | null {
  for (const p of projects) {
    if ([p.name, ...p.aliases].some((k) => k.length >= 2 && wordRe(k).test(text))) return p;
  }
  for (const p of projects) {
    const first = p.name.split(/[\s·:-]+/)[0];
    if (first.length >= 4 && wordRe(first).test(text)) return p;
  }
  return null;
}

export type Tag = { kind: 'project' | 'person' | 'bet' | 'none'; label: string; id?: string };

export function tagFor(text: string, ctx: TagContext): Tag {
  const pr = matchProject(text, ctx.projects);
  if (pr) return { kind: 'project', label: pr.name, id: pr.id };
  const bet = ctx.bets.find((b) => b.length >= 3 && wordRe(b).test(text));
  if (bet) return { kind: 'bet', label: 'Harbor' };
  const person = matchPerson(text, ctx.people);
  if (person) return { kind: 'person', label: person.name };
  return { kind: 'none', label: 'untagged' };
}

export function obsidianLink(vaultName: string, path: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`;
}
