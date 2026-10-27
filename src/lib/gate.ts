// Which check-in to show, and whether to put it in front of everything. Pure; shared with tests.
export type Phase = 'dawn' | 'dusk';

export interface Checkin {
  /** The phone's default tab. */
  mode: Phase;
  /** When set, every page opens with this check-in on top. */
  gate: Phase | null;
  duskFrom: string;
}

export function checkinFor(
  day: { locked: boolean; closed: boolean; skipped: Phase[] },
  time: string,
  duskFrom: string,
  enabled: boolean,
): Checkin {
  const evening = time >= duskFrom;
  let gate: Phase | null = null;
  if (enabled && !day.closed) {
    if (!evening && !day.locked && !day.skipped.includes('dawn')) gate = 'dawn';
    if (evening && !day.skipped.includes('dusk')) gate = 'dusk';
  }
  return { mode: evening || day.closed ? 'dusk' : 'dawn', gate, duskFrom };
}
