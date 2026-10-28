'use client';

// The game HUD drawn over the full-screen island: player plate, resource counters, quick buttons,
// the live-session tracker and the hotbar that holds all navigation.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { audioReady, blip, playMusic, setMusicVolume, stopMusic, suspendAudio } from '@/lib/audio';
import { getPrefs, setPrefs, usePrefs } from '@/lib/prefs';
import { LiveTracker } from './LiveSessions';
import type { Look, Personality } from '@/lib/avatar';
import { Avatar } from './Avatar';
import { setTheme, useTheme } from './useTheme';

export interface HudData {
  title: string;
  owner: string;
  date: string;
  level: number;
  className: string;
  xp: { into: number; need: number; total: number };
  counts: { active: number; weedy: number; warm: number; people: number; due: number; unconfirmed: number; trophies: number };
  pending: number;
  demo: boolean;
  readOnly: boolean;
  avatar: { personality: Personality; look: Look };
  /** Civilization: treasury and how many villagers are alive. */
  isle?: { balance: number; alive: number; ghosts: number; people: number };
}

export const SLOTS = [
  { href: '/', icon: '🏝', label: 'Island' },
  { href: '/today', icon: '📱', label: 'Today' },
  { href: '/sessions', icon: '⚓', label: 'Sessions' },
  { href: '/codex', icon: '🔖', label: 'Codex' },
  { href: '/banners', icon: '🚩', label: 'Banners' },
  { href: '/trophies', icon: '🏆', label: 'Trophies' },
  { href: '/character', icon: '🧭', label: 'Character' },
  { href: '/settings', icon: '⚙', label: 'Settings' },
  { href: '/isle', icon: '🐚', label: 'Treasury' },
] as const;

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

/** Keys typed into a field, or while the check-in is open, aren't shortcuts. */
export const ignoreKeys = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || !!document.querySelector('.gate')
    || !!t?.closest('input, textarea, select, [contenteditable="true"], [role="listbox"]');
};

const longDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function Hud({ d }: { d: HudData }) {
  const prefs = usePrefs();
  const path = usePathname();
  useSound();
  // The tracker belongs to the island; settings dock to the right, so it stays visible there too.
  const tracker = prefs.tracker && (path === '/' || path.startsWith('/settings'));
  return (
    <>
      <div className="hud hud-top">
        {/* The tracker hangs under the player plate, the same width, so the two read as one column. */}
        <div className="hud-left">
          <PlayerPlate d={d} />
          {tracker && <LiveTracker />}
        </div>
        <Counters d={d} />
        <QuickButtons />
      </div>
      <Hotbar pending={d.pending} />
    </>
  );
}

function PlayerPlate({ d }: { d: HudData }) {
  const pct = Math.round((d.xp.into / d.xp.need) * 100);
  return (
    <div className="hud-panel plate">
      <Link href="/character" className="plate-face" aria-label="Character sheet"><Avatar {...d.avatar} companion={false} /></Link>
      <div className="plate-main">
        <div className="plate-name"><b>{d.owner}</b> <span className="lv">Lv {d.level}</span> <span className="tiny muted">{d.className}</span></div>
        <div className="xpbar" role="meter" aria-label="Experience" aria-valuenow={d.xp.into} aria-valuemin={0} aria-valuemax={d.xp.need} title={`${d.xp.total} XP total`}>
          <i style={{ width: `${pct}%` }} />
          <span>{d.xp.into} / {d.xp.need} XP</span>
        </div>
        <div className="tiny muted plate-sub">
          {d.title} · {longDate(d.date)}
          {d.demo && <span className="pill">demo vault</span>}
          {d.readOnly && <span className="pill">read-only</span>}
        </div>
      </div>
    </div>
  );
}

function Counters({ d }: { d: HudData }) {
  const c = d.counts;
  const items = [
    { icon: '⚒', n: c.active, of: undefined, label: `${c.active} active sites, ${c.weedy} with weeds`, warn: c.weedy > 0 ? `${c.weedy}🌿` : null, href: null },
    d.isle
      ? { icon: '🏘', n: d.isle.alive, of: d.isle.people, label: `${d.isle.alive} of ${d.isle.people} villagers alive, ${d.isle.ghosts} ghosts`, warn: d.isle.ghosts ? `${d.isle.ghosts}👻` : null, href: null }
      : { icon: '🏮', n: c.warm, of: c.people, label: `${c.warm} of ${c.people} lanterns warm`, warn: null, href: null },
    ...(d.isle ? [{ icon: '🐚', n: d.isle.balance, of: undefined, label: `${d.isle.balance} Shells in the treasury`, warn: null, href: '/isle' }] : []),
    { icon: '🔖', n: c.due, of: undefined, label: `${c.due} decisions ready to judge`, warn: null, href: '/codex' },
    { icon: '🚩', n: c.unconfirmed, of: undefined, label: `${c.unconfirmed} banners to confirm`, warn: null, href: '/banners' },
    { icon: '🏆', n: c.trophies, of: undefined, label: `${c.trophies} trophies earned`, warn: null, href: '/trophies' },
  ];
  return (
    <ul className="hud-panel counters" aria-label="Island resources">
      {items.map((it) => {
        const body = (
          <>
            <span className="ci" aria-hidden="true">{it.icon}</span>
            <b>{it.n}</b>{it.of !== undefined && <span className="tiny muted">/{it.of}</span>}
            {it.warn && <span className="cw" aria-hidden="true">{it.warn}</span>}
          </>
        );
        return (
          <li key={it.icon} title={it.label}>
            {it.href ? <Link href={it.href} aria-label={it.label}>{body}</Link> : <span aria-label={it.label}>{body}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function QuickButtons() {
  const prefs = usePrefs();
  const { night } = useTheme();
  return (
    <div className="hud-panel quick">
      <button className="hud-btn" aria-pressed={prefs.music} aria-label={`Music ${prefs.music ? 'on' : 'off'}`} title="Music (M)"
        onClick={() => setPrefs({ music: !prefs.music })}>{prefs.music ? '♫' : '♪̸'}</button>
      <button className="hud-btn" aria-label={night ? 'Switch to day' : 'Switch to night'} title="Day / night"
        onClick={() => { setTheme(night ? 'light' : 'dark'); if (prefs.sfx) blip('select'); }}>{night ? '☾' : '☀'}</button>
      <Link className="hud-btn" href="/hall" aria-label="Public trophy hall" title="Public trophy hall">🏛</Link>
    </div>
  );
}

function Hotbar({ pending }: { pending: number }) {
  const path = usePathname();
  const router = useRouter();
  const { sfx } = usePrefs();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreKeys(e)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SLOTS.length) { e.preventDefault(); if (sfx) blip('nav'); router.push(SLOTS[n - 1].href); }
      else if (e.key === 'm' || e.key === 'M') setPrefs({ music: !getPrefs().music });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, sfx]);
  return (
    <nav className="hud hotbar" aria-label="Sections">
      {SLOTS.map((s, i) => (
        <Link key={s.href} href={s.href} className="slot" aria-current={isActive(path, s.href) ? 'page' : undefined}
          onClick={() => { if (sfx) blip('nav'); }} title={`${s.label} (${i + 1})`}>
          <span className="slot-key" aria-hidden="true">{i + 1}</span>
          <span className="slot-icon" aria-hidden="true">{s.icon}</span>
          <span className="slot-label">{s.label}</span>
          {s.href === '/sessions' && pending > 0 && <span className="tab-badge" aria-label={`${pending} folders to place`}>{pending}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Music follows the preferences and day/night; browsers only allow it to start after a click or key press. */
function useSound() {
  const { music, volume, track } = usePrefs();
  const { night } = useTheme();
  const song = track === 'auto' ? (night ? 'night' : 'day') : track;
  useEffect(() => {
    if (!music) { stopMusic(); return; }
    const start = () => playMusic(song, getPrefs().volume);
    if (audioReady()) { start(); return; }
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => { window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
  }, [music, song]);
  useEffect(() => { setMusicVolume(volume); }, [volume]);
  useEffect(() => {
    const vis = () => suspendAudio(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
}
