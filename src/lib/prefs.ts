// Per-device preferences (season, map layers, sound, HUD panels), kept in localStorage.
// The island stays mounted behind every page, so a change on a settings page shows up on it at once.
import { useSyncExternalStore } from 'react';
import { SEASONS, type SeasonChoice } from './seasons';

export type Track = 'auto' | 'day' | 'night';

export interface Prefs {
  season: SeasonChoice;
  fog: boolean;
  harbor: boolean;
  music: boolean;
  volume: number;
  track: Track;
  sfx: boolean;
  tracker: boolean;
  atlas: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  season: 'auto', fog: true, harbor: true, music: true, volume: 0.5, track: 'auto', sfx: true, tracker: true, atlas: true,
};

const KEY = 'mp-prefs';
let cache: Prefs | null = null;
const listeners = new Set<() => void>();

function clean(v: Record<string, unknown>): Prefs {
  const p = { ...DEFAULT_PREFS };
  if (v.season === 'auto' || (SEASONS as readonly unknown[]).includes(v.season)) p.season = v.season as SeasonChoice;
  for (const k of ['fog', 'harbor', 'music', 'sfx', 'tracker', 'atlas'] as const) if (typeof v[k] === 'boolean') p[k] = v[k];
  if (typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1) p.volume = v.volume;
  if (v.track === 'auto' || v.track === 'day' || v.track === 'night') p.track = v.track;
  return p;
}

function read(): Prefs {
  if (cache) return cache;
  let v: Record<string, unknown> = {};
  try {
    v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // Before settings had their own pages, the season was stored on its own.
    const old = localStorage.getItem('mp-season');
    if (old && !('season' in v)) v.season = old;
  } catch { /* private mode or bad JSON: defaults */ }
  cache = clean(v);
  return cache;
}

export function setPrefs(change: Partial<Prefs>) {
  cache = clean({ ...read(), ...change });
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* private mode: this tab only */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  // Another tab changed them.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; l(); } };
  addEventListener('storage', onStorage);
  return () => { listeners.delete(l); removeEventListener('storage', onStorage); };
}

export const getPrefs = read;
export const usePrefs = () => useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS);
