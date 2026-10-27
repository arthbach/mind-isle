'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { AGENT_LABEL, type LiveSession, type LiveSnapshot } from '@/lib/sessions/types';

interface LiveContext {
  snapshot: LiveSnapshot;
  /** Project the user picked from the strip; the island selects that building. */
  focus: string | null;
  setFocus: (projectId: string | null) => void;
}

const EMPTY: LiveSnapshot = { at: 0, live: [], pending: 0 };
const Ctx = createContext<LiveContext>({ snapshot: EMPTY, focus: null, setFocus: () => {} });
export const useLive = () => useContext(Ctx);

/** One EventSource for the whole app; everything live reads from here. */
export function LiveProvider({ initial, children, frozen = false }: { initial: LiveSnapshot; children: React.ReactNode; frozen?: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (frozen) return; // fixed data (design previews): don't listen to the real stream
    const es = new EventSource('/api/sessions/stream');
    es.onmessage = (e) => { try { setSnapshot(JSON.parse(e.data)); } catch { /* ignore */ } };
    // EventSource reconnects by itself after errors.
    return () => es.close();
  }, [frozen]);
  return <Ctx.Provider value={{ snapshot, focus, setFocus }}>{children}</Ctx.Provider>;
}

export const STATE_LABEL: Record<LiveSession['state'], string> = { working: 'working', needs_you: 'needs you', idle: 'idle' };

export function elapsed(from: number | null, now: number): string {
  if (!from) return '';
  const m = Math.max(0, Math.round((now - from) / 60_000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

const MAX_CARDS = 4;

/** The HUD's quest tracker: running sessions, the ones that need you first. */
export function LiveTracker() {
  const { snapshot, setFocus } = useLive();
  const router = useRouter();
  const path = usePathname();
  const [now, setNow] = useState(() => snapshot.at || Date.now());
  const [all, setAll] = useState(false);
  const [folded, setFolded] = useState(false);
  // On a phone the tracker would cover half the island: it starts folded there.
  useEffect(() => { if (window.innerWidth < 700) setFolded(true); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); setNow(Date.now()); return () => clearInterval(t); }, [snapshot.at]);

  const { pending } = snapshot;
  const rank = { needs_you: 0, working: 1, idle: 2 } as const;
  const live = [...snapshot.live].sort((a, b) => rank[a.state] - rank[b.state]);
  if (!live.length && !pending) return null;
  const needs = live.filter((s) => s.state === 'needs_you').length;

  const placed = (s: LiveSession) => s.mapping.kind === 'confirmed' || s.mapping.kind === 'auto';
  const open = (s: LiveSession) => {
    if (placed(s) && s.mapping.project) {
      setFocus(s.mapping.project.id);
      if (path !== '/') router.push('/');
    } else router.push(`/sessions#${encodeURIComponent(s.cwd)}`);
  };

  return (
    <section className="hud-panel live" aria-label="Live agent sessions">
      <div className="live-head">
        <button className="live-fold" onClick={() => setFolded(!folded)} aria-expanded={!folded} aria-label={folded ? 'Show live sessions' : 'Hide live sessions'}>
          <span className={`live-dot${needs ? ' needs' : ''}`} aria-hidden="true" /><span className="px">LIVE</span> <span aria-hidden="true">{folded ? '▸' : '▾'}</span>
        </button>
        <span className="tiny muted" aria-live="polite">
          {live.length} session{live.length === 1 ? '' : 's'}{needs ? ` · ${needs} need${needs === 1 ? 's' : ''} you` : ''}
        </span>
        {pending > 0 && <Link className="pill warnpill" href="/sessions">{pending} folder{pending === 1 ? '' : 's'} to place</Link>}
        {!folded && live.length > MAX_CARDS && (
          <button className="linkbtn" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? 'Show fewer' : `Show all ${live.length} sessions`}
          </button>
        )}
      </div>
      {!folded && live.length > 0 && (
        <ul className="live-list">
          {(all ? live : live.slice(0, MAX_CARDS)).map((s) => (
            <li key={s.id}>
              <button className={`live-card ${s.state}${s.inferred ? ' inferred' : ''}`} onClick={() => open(s)} data-state={s.state} title={s.title ?? undefined}>
                <span className="live-icon" aria-hidden="true">{s.state === 'needs_you' ? '!' : s.state === 'working' ? '⚒' : '…'}</span>
                <span className="live-main">
                  <b>{placed(s) ? s.mapping.project?.name : s.mapping.project ? `${s.mapping.project.name}?` : s.cwdShort}</b>
                  <span className="tiny">
                    {AGENT_LABEL[s.agent]}{s.startedAt ? ` · ${elapsed(s.startedAt, now)}` : ''}
                    {' · '}{s.state === 'needs_you' ? 'waiting for you' : s.state === 'working' ? (s.lastAction ? `working on ${s.lastAction}` : 'working') : 'idle'}
                    {!placed(s) && ' · not placed yet'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
