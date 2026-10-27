'use client';

// Live agent sessions on the island: a small pin per building that opens into a bubble of portraits.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AGENT_LABEL, type LiveSession } from '@/lib/sessions/types';
import { STATE_LABEL } from './LiveSessions';
import { Sprite } from './Sprite';

/** Sessions grouped by building; (ax, ay) is the building's anchor in canvas coordinates. */
export interface CrewGroup {
  key: string;
  select: string;
  project: string | null;
  label: string;
  ax: number;
  ay: number;
  sessions: LiveSession[];
}

type Box = { x: number; y: number; w: number; h: number };
const POP_W = 260, POP_H = 96;
const short = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const needsOf = (g: CrewGroup) => g.sessions.filter((s) => s.state === 'needs_you').length;
const nameOf = (g: CrewGroup) => {
  const n = g.sessions.length, k = needsOf(g);
  return `${g.label}: ${n} live session${n > 1 ? 's' : ''}${k ? `, ${k} waiting for you` : ''}`;
};

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Place pins near their anchors without overlapping each other or the map labels; try above first, then sideways, then below. */
function placeBoxes(items: { key: string; ax: number; ay: number; w: number; h: number }[], area: { w: number; h: number }, avoid: Box[]) {
  const placed: Box[] = [...avoid];
  const out: Record<string, Box> = {};
  const free = (b: Box) => b.y >= 2 && b.y + b.h <= area.h - 2
    && !placed.some((r) => b.x < r.x + r.w + 4 && b.x + b.w + 4 > r.x && b.y < r.y + r.h + 4 && b.y + b.h + 4 > r.y);
  for (const it of [...items].sort((a, b) => a.ay - b.ay || a.ax - b.ax)) {
    const clampX = (x: number) => Math.max(2, Math.min(area.w - it.w - 2, x));
    const xs = [it.ax - it.w / 2, it.ax - it.w * 1.5 - 4, it.ax + it.w / 2 + 4].map(clampX);
    const ys = [...[0, 1, 2, 3].map((k) => it.ay - 4 - it.h - k * (it.h + 6)), ...[0, 1, 2].map((k) => it.ay + 24 + k * (it.h + 6))];
    let best: Box | null = null;
    for (const y of ys) { for (const x of xs) { if (free({ x, y, w: it.w, h: it.h })) { best = { x, y, w: it.w, h: it.h }; break; } } if (best) break; }
    best ??= { x: xs[0], y: Math.max(2, ys[0]), w: it.w, h: it.h };
    placed.push(best);
    out[it.key] = best;
  }
  return out;
}

/** Portraits + label: the inside of the opened bubble. */
function BubbleBody({ g }: { g: CrewGroup }) {
  const n = g.sessions.length;
  return (
    <>
      {needsOf(g) > 0 && <span className="crew-alert" aria-hidden="true">!</span>}
      <span className="crew-faces">
        {g.sessions.slice(0, 4).map((s) => (
          <span key={s.id} className={`crew-face ${s.state}`} title={`${AGENT_LABEL[s.agent]} · ${STATE_LABEL[s.state]}${s.title ? ` · ${s.title}` : ''}`}>
            <Sprite name={s.agent === 'codex' ? 'codex' : 'claude'} />
            <i className="crew-state" aria-hidden="true">{s.state === 'needs_you' ? '!' : s.state === 'working' ? '⚒' : 'z'}</i>
          </span>
        ))}
        {n > 4 && <span className="crew-more">+{n - 4}</span>}
      </span>
      <span className="crew-label">{g.project ? '' : '? '}{short(g.label)} · {n}</span>
    </>
  );
}

export function CrewPins({ groups, frame, canvas, onSelect }: {
  groups: CrewGroup[];
  frame: React.RefObject<HTMLDivElement | null>;
  canvas: { w: number; h: number };
  onSelect: (key: string) => void;
}) {
  const size = useSize(frame);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [pos, setPos] = useState<Record<string, Box>>({});
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (!size.w) return;
    const kx = size.w / canvas.w, ky = size.h / canvas.h;
    const fr = frame.current!.getBoundingClientRect();
    const labels = [...frame.current!.querySelectorAll<HTMLElement>('.dlabel')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - fr.left, y: r.top - fr.top, w: r.width, h: r.height };
    });
    const items = groups.flatMap((g) => {
      const el = refs.current.get(g.key);
      return el ? [{ key: g.key, ax: g.ax * kx, ay: g.ay * ky, w: el.offsetWidth, h: el.offsetHeight }] : [];
    });
    setPos(placeBoxes(items, size, labels));
  }, [groups, size, canvas, frame]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('.crew-pin, .crew-pop')) setOpen(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  if (!groups.length) return null;
  const hoverOpen = (k: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(k); };
  const hoverClose = () => { closeTimer.current = setTimeout(() => setOpen(null), 180); };
  const og = groups.find((g) => g.key === open);
  const ob = open ? pos[open] : undefined;
  // The frame clips its children, so a pin near the top opens its bubble below instead.
  const below = !!ob && ob.y < POP_H + 10;

  return (
    <div className="crew-layer">
      {groups.map((g) => {
        const b = pos[g.key];
        const k = needsOf(g);
        return (
          <button key={g.key} ref={(el) => { if (el) refs.current.set(g.key, el); else refs.current.delete(g.key); }}
            className={`crew-pin${k ? ' needs' : ''}${g.project ? '' : ' stray'}`} data-project={g.project ?? undefined}
            style={{ left: b?.x ?? 0, top: b?.y ?? 0, visibility: b ? 'visible' : 'hidden' }}
            aria-label={nameOf(g)} aria-expanded={open === g.key}
            onMouseEnter={() => hoverOpen(g.key)} onMouseLeave={hoverClose} onFocus={() => setOpen(g.key)}
            onClick={(e) => {
              // Touch: first tap opens, second tap selects. Mouse: hover opens, click selects.
              if ((e.nativeEvent as PointerEvent).pointerType === 'touch' && open !== g.key) { setOpen(g.key); return; }
              onSelect(g.select);
            }}>
            <span className="crew-pin-face"><Sprite name={g.sessions[0].agent === 'codex' ? 'codex' : 'claude'} /></span>
            <span className="crew-pin-n">{g.sessions.length}</span>
            {k > 0 && <span className="crew-pin-alert" aria-hidden="true">!</span>}
          </button>
        );
      })}
      {og && ob && (
        <button className={`crew-bubble crew-pop${needsOf(og) ? ' needs' : ''}${og.project ? '' : ' stray'}`} aria-label={nameOf(og)}
          style={{
            left: Math.max(2, Math.min(size.w - POP_W, ob.x + ob.w / 2 - 110)),
            top: below ? ob.y + ob.h + 8 : ob.y - 8,
            transform: below ? undefined : 'translateY(-100%)',
          }}
          onMouseEnter={() => hoverOpen(og.key)} onMouseLeave={hoverClose}
          onClick={() => onSelect(og.select)}>
          <BubbleBody g={og} />
          <span className="tiny muted">Click for details</span>
        </button>
      )}
    </div>
  );
}
