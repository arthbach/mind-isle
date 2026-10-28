// A villager's life, worked out from their contact history alone. Pure, so the rules are easy to test.
import { daysBetween } from '../game';
import { CLOCK, IDLE_AT, type Circle, type Life } from './rules';

export interface LifeResult {
  life: Life;
  /** Days since the last contact on or before `asOf` (null if none). */
  days: number | null;
  /** 1 + every time they came back. */
  lives: number;
  /** Contact dates that brought them back from the dead. */
  rebirths: string[];
  /** Days left before they die (sick or idle), else null. */
  left: number | null;
}

/**
 * `contacts`: dates (YYYY-MM-DD), any order, duplicates fine. Only those on or before `asOf` count.
 * A gap longer than the dead mark followed by a contact is a death and a rebirth.
 * `grace` (a Clinic) only stretches the current gap, not past ones.
 */
export function lifeOf(contacts: string[], circle: Circle, asOf: string, opts: { grace?: number; memoriam?: boolean } = {}): LifeResult {
  const dates = [...new Set(contacts.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= asOf))].sort();
  const clock = CLOCK[circle];
  const rebirths: string[] = [];
  for (let i = 1; i < dates.length; i++) if (daysBetween(dates[i - 1], dates[i]) > clock.dead) rebirths.push(dates[i]);
  const lives = 1 + rebirths.length;
  if (opts.memoriam) return { life: 'spirit', days: null, lives, rebirths, left: null };
  if (!dates.length) return { life: 'unknown', days: null, lives, rebirths, left: null };
  const days = daysBetween(dates[dates.length - 1], asOf);
  const dead = clock.dead + (opts.grace ?? 0);
  const life: Life = days > dead ? 'ghost' : days >= clock.sick ? 'sick' : days >= Math.round(clock.sick * IDLE_AT) ? 'idle' : 'thriving';
  return { life, days, lives, rebirths, left: life === 'ghost' ? null : dead - days };
}
