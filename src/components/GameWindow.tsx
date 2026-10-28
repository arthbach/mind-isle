'use client';

// Every page except the island opens as a window over it; Esc, ✕ or a click outside goes back.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { blip } from '@/lib/audio';
import { usePrefs } from '@/lib/prefs';
import { ignoreKeys, SLOTS } from './Hud';

const SETTINGS: Record<string, string> = {
  '/settings/world': 'World', '/settings/sound': 'Sound', '/settings/display': 'Display', '/settings/agents': 'Agents',
  '/settings/summaries': 'Summaries',
};
// Sub-pages of other windows: label and where ← goes.
const SUBS: Record<string, [string, string]> = { '/isle/eras': ['Eras', '/isle'] };

export function GameWindow({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { sfx } = usePrefs();
  const open = path !== '/';
  const sub = SETTINGS[path] ?? SUBS[path]?.[0];
  const back = SUBS[path]?.[1] ?? (sub ? '/settings' : '/');

  useEffect(() => {
    if (!open) return;
    if (sfx) blip('open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || ignoreKeys(e)) return;
      if (sfx) blip('close');
      router.push(back);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // Only on opening a different window, not on every preference change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path]);

  if (!open) return null;
  const slot = SLOTS.find((s) => s.href !== '/' && (path === s.href || path.startsWith(`${s.href}/`)));
  // Settings dock to the side, so changes to the island show behind them.
  const docked = path.startsWith('/settings');
  return (
    <div className={`window-layer${docked ? ' docked' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) router.push('/'); }}>
      <section className="window" aria-label={slot?.label ?? 'Window'}>
        <header className="window-bar">
          {sub && <Link className="btn" href={back}>←</Link>}
          <span className="window-title"><span aria-hidden="true">{slot?.icon}</span> {slot?.label}{sub && ` · ${sub}`}</span>
          <Link className="window-close" href={back} aria-label={sub ? `Back to ${back === '/settings' ? 'settings' : 'the Treasury'}` : 'Close and return to the island'} title="Close (Esc)">✕</Link>
        </header>
        <div className="window-body">{children}</div>
      </section>
    </div>
  );
}
