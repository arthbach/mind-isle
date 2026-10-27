'use client';

import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** Auto follows the device; light and dark are remembered on this device. */
export function setTheme(t: ThemeChoice) {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === 'auto') localStorage.removeItem('mp-theme');
    else localStorage.setItem('mp-theme', t);
  } catch { /* private mode */ }
}

function subscribe(l: () => void) {
  const mo = new MutationObserver(l);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', l);
  return () => { mo.disconnect(); mq.removeEventListener('change', l); };
}

const snapshot = () => {
  const t = document.documentElement.dataset.theme;
  const choice: ThemeChoice = t === 'light' || t === 'dark' ? t : 'auto';
  const night = choice === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : choice === 'dark';
  return `${choice}:${night ? 'night' : 'day'}`;
};

export function useTheme(): { choice: ThemeChoice; night: boolean } {
  const [choice, time] = useSyncExternalStore(subscribe, snapshot, () => 'auto:day').split(':');
  return { choice: choice as ThemeChoice, night: time === 'night' };
}
