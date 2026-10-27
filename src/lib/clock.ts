import { config } from './config';

/** Current instant. PALACE_NOW (an ISO timestamp) pins it, for tests and demos only. */
export function now(): Date {
  const pinned = process.env.PALACE_NOW;
  const d = pinned ? new Date(pinned) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Date, wall-clock time and month in the configured timezone. */
export function clock(at: Date = now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    month: Number(parts.month),
  };
}

export const today = () => clock().date;
