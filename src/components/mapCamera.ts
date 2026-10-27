'use client';

// Pan and zoom for the island. The world layer (canvas, labels, pins) is sized and moved directly on the
// DOM, so dragging never re-renders React; only its size change is observed (by the pins).
import { useEffect, useRef } from 'react';

export interface MapCamera {
  zoom: (factor: number) => void;
  fit: () => void;
  /** Zoom in on a map point (in map pixels) and center it. */
  show: (x: number, y: number) => void;
  /** True when the last press turned into a pan or pinch, so it shouldn't count as a click. */
  wasDrag: () => boolean;
}

/** Screen edges covered by HUD panels: the fitted island sits between them. */
export type Insets = { top: number; right: number; bottom: number; left: number };
const NONE = (): Insets => ({ top: 0, right: 0, bottom: 0, left: 0 });

const noop: MapCamera = { zoom() {}, fit() {}, show() {}, wasDrag: () => false };

export function useMapCamera(
  frame: React.RefObject<HTMLDivElement | null>,
  world: React.RefObject<HTMLDivElement | null>,
  w: number,
  h: number,
  insets: () => Insets = NONE,
) {
  const api = useRef<MapCamera>(noop);

  useEffect(() => {
    const f = frame.current, el = world.current;
    if (!f || !el) return;
    // fit: showing the whole island, and keeping it whole when the frame resizes, until the user moves the map.
    const c = { k: 1, x: 0, y: 0, fit: true };
    let moved = false;

    // Fully zoomed out, the whole island fits between the HUD panels; fully zoomed in is 4× that.
    // Panning stops when the island's edge reaches the HUD, so nothing hides under it for good.
    const fitK = () => {
      const i = insets();
      return Math.min((f.clientWidth - i.left - i.right) / w, (f.clientHeight - i.top - i.bottom) / h) || 1;
    };
    const axis = (pos: number, size: number, frame: number, lo: number, hi: number) =>
      size <= frame - lo - hi ? lo + (frame - lo - hi - size) / 2 : Math.min(lo, Math.max(frame - hi - size, pos));
    const clamp = () => {
      const lo = fitK(), i = insets();
      c.k = Math.min(lo * 4, Math.max(lo, c.k));
      c.x = axis(c.x, w * c.k, f.clientWidth, i.left, i.right);
      c.y = axis(c.y, h * c.k, f.clientHeight, i.top, i.bottom);
    };
    const apply = () => {
      clamp();
      el.style.width = `${w * c.k}px`;
      el.style.height = `${h * c.k}px`;
      el.style.transform = `translate(${c.x}px, ${c.y}px)`;
      f.dataset.zoom = (c.k / fitK()).toFixed(2);
    };
    const zoomAt = (factor: number, px: number, py: number) => {
      // Limit the scale first, without touching the position, so the point under the cursor stays put.
      const k0 = c.k, lo = fitK();
      c.k = Math.min(lo * 4, Math.max(lo, k0 * factor));
      const r = c.k / k0;
      c.x = px - (px - c.x) * r;
      c.y = py - (py - c.y) * r;
      c.fit = false;
      apply();
    };
    const center = (k: number) => { c.k = k; c.x = -Infinity; c.y = -Infinity; apply(); };
    const fit = () => { c.fit = true; center(fitK()); };
    const local = (e: { clientX: number; clientY: number }) => {
      const r = f.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    // One pointer pans (after a 4px dead zone, so clicks still work); two pointers pinch.
    const pts = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0 }, dragging = false, pinch = 0, mid = { x: 0, y: 0 };
    const pair = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const down = (e: PointerEvent) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest('.map-zoom')) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) { start = p; moved = false; dragging = false; }
      if (pts.size === 2) { const q = pair(); pinch = q.d; mid = q.m; moved = true; }
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > 4) {
          dragging = moved = true;
          f.setPointerCapture(e.pointerId);
          f.classList.add('panning');
        }
        if (dragging) { c.x += p.x - prev.x; c.y += p.y - prev.y; c.fit = false; apply(); }
      } else if (pts.size === 2 && pinch) {
        const q = pair();
        c.x += q.m.x - mid.x; c.y += q.m.y - mid.y;
        zoomAt(q.d / pinch, q.m.x, q.m.y);
        pinch = q.d; mid = q.m;
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!pts.size) { dragging = false; f.classList.remove('panning'); }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const p = local(e);
      // Trackpad pinches arrive as ctrl+wheel with small deltas.
      zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), p.x, p.y);
    };
    const dbl = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.map-zoom, .crew-layer button')) return;
      const p = local(e);
      zoomAt(2, p.x, p.y);
    };
    const key = (e: KeyboardEvent) => {
      if (e.target !== f) return;
      const step = 60;
      const acts: Record<string, () => void> = {
        '+': () => api.current.zoom(1.4), '=': () => api.current.zoom(1.4), '-': () => api.current.zoom(1 / 1.4), '0': fit,
        ArrowLeft: () => { c.x += step; apply(); }, ArrowRight: () => { c.x -= step; apply(); },
        ArrowUp: () => { c.y += step; apply(); }, ArrowDown: () => { c.y -= step; apply(); },
      };
      const act = acts[e.key];
      if (act) { e.preventDefault(); c.fit = false; act(); }
    };

    f.addEventListener('pointerdown', down);
    f.addEventListener('pointermove', move);
    f.addEventListener('pointerup', up);
    f.addEventListener('pointercancel', up);
    f.addEventListener('wheel', wheel, { passive: false });
    f.addEventListener('dblclick', dbl);
    f.addEventListener('keydown', key);
    const ro = new ResizeObserver(() => { if (c.fit) fit(); else apply(); });
    ro.observe(f);
    fit();

    api.current = {
      zoom: (factor) => zoomAt(factor, f.clientWidth / 2, f.clientHeight / 2),
      fit,
      show: (x, y) => {
        c.k = Math.max(c.k, fitK() * 2.5);
        c.x = f.clientWidth / 2 - x * c.k;
        c.y = f.clientHeight / 2 - y * c.k;
        c.fit = false;
        apply();
      },
      wasDrag: () => moved,
    };
    return () => {
      f.removeEventListener('pointerdown', down);
      f.removeEventListener('pointermove', move);
      f.removeEventListener('pointerup', up);
      f.removeEventListener('pointercancel', up);
      f.removeEventListener('wheel', wheel);
      f.removeEventListener('dblclick', dbl);
      f.removeEventListener('keydown', key);
      ro.disconnect();
      api.current = noop;
    };
  }, [frame, world, w, h]);

  return api;
}
