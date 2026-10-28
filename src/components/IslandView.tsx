'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { lightLantern, setCircle, voteBelief } from '@/app/actions';
import { PixelSelect } from './PixelSelect';
import { RULES, TIER_LABEL, fmtDate, obsidianLink } from '@/lib/game';
import { blip } from '@/lib/audio';
import { setPrefs, usePrefs } from '@/lib/prefs';
import type { Season } from '@/lib/seasons';
import { BUILDINGS, CLOCK, WONDER_GOAL, type BuildingKey, type Circle, type Life, type WonderKey } from '@/lib/civ/rules';
import type { Belief, BeliefStatus, Bet, Decision, Person, Project, Village } from '@/lib/types';
import { AGENT_LABEL, type LiveSession } from '@/lib/sessions/types';
import { ActionButton } from './ActionButton';
import { CrewPins, type CrewGroup } from './CrewPins';
import { useMapCamera } from './mapCamera';
import { elapsed, STATE_LABEL, useLive } from './LiveSessions';
import { ProjectUpdate } from './ProjectUpdate';
import { Sprite } from './Sprite';

export interface IslandData {
  projects: Project[];
  villages: Village[];
  beliefs: Belief[];
  decisions: Decision[];
  bets: Bet[];
  vaultName: string;
  readOnly: boolean;
  /** YYYY-MM-DD in the user's timezone. */
  today: string;
  counts: { active: number; weedy: number; warm: number; people: number; due: number; unconfirmed: number; trophies: number };
  season: { auto: Season; label: string };
  /** Finished sessions waiting for a yes, by project id: a scroll on the building. */
  scrolls?: Record<string, number>;
  /** Civilization: each villager's life, each village's buildings, the treasury. */
  isle?: IsleData;
}

export interface CivBuilt { key: BuildingKey; closed: boolean; damaged: boolean; level: number }
export interface IsleData {
  balance: number;
  /** The year of this island: each year's land has its own shape. */
  era: number;
  life: Record<string, { life: Life; days: number | null; lives: number; left: number | null; circle: Circle; sick: number; dead: number; about: string | null; birthday: boolean }>;
  villages: Record<string, { size: string; festival: boolean; buildings: CivBuilt[] }>;
  isleBuildings: CivBuilt[];
  plaza: boolean;
  /** Wonders standing on this island. */
  wonders: WonderKey[];
  /** Wonders from earlier islands, as small statues. */
  statues: { key: WonderKey; year: number }[];
  golden: boolean;
}

// ---------------------------------------------------------------- noise
function hash(x: number, y: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1), u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 7, y * 2.1 + 3) * 0.3 + vnoise(x * 4.3 + 11, y * 4.3 + 5) * 0.15;

// ---------------------------------------------------------------- palette
const PAL = {
  day: { deep: '#2c69ad', shallow: '#4b93d1', foam: '#9fd3ee', sand: '#e8d39a', grass: '#6db95a', grassL: '#86c96b', grassD: '#56a149', path: '#cfa86c', pathD: '#b08a52', stone: '#cfc6ae', stoneD: '#9c927a', wall: '#efe0bd', wallD: '#c9b48a', roof: '#4a78c2', door: '#6b4426', win: '#7fc4e8', wood: '#8a5a2b', plot: '#b98d5a', plotD: '#a07646', tarp: '#8e9aa6', weed: '#2f6e25', marble: '#f3ead6', purple: '#6b4fa0', skin: '#efc29a', ink: '#2a1e14', lamp: '#ffd35a', gold: '#e0ab24', fire: '#e0703a', flagW: '#f6f1e3', green: '#3f8f5f', fade: '#9b9b9b', fogNpc: '#c9c9c9', fog: [246, 248, 250], patch: '#79c062', red: '#c0392b' },
  night: { deep: '#0e1f3a', shallow: '#183559', foam: '#2c5480', sand: '#7a7058', grass: '#2e5a3c', grassL: '#376a47', grassD: '#244a31', path: '#6b583e', pathD: '#54442f', stone: '#585a66', stoneD: '#3c3e48', wall: '#7d7466', wallD: '#5f584c', roof: '#2f4f86', door: '#3a2616', win: '#ffd35a', wood: '#5a3c1f', plot: '#5a4632', plotD: '#4a3828', tarp: '#4f5862', weed: '#1c4219', marble: '#9a937f', purple: '#4a3672', skin: '#c79a76', ink: '#0b0805', lamp: '#ffd35a', gold: '#c99a2a', fire: '#ff8a4c', flagW: '#cfc8b5', green: '#2f6a48', fade: '#5d6270', fogNpc: '#4a4f5c', fog: [140, 156, 184], patch: '#33623f', red: '#a83226' },
};
type Pal = typeof PAL.day & { deco: string[]; decoRate: number };

// Seasons repaint the land and water; everything built (houses, roads) keeps the base palette.
const SEASON_PAL: Record<Season, Partial<typeof PAL.day> & { deco: string[] }> = {
  spring: { grass: '#84c968', grassL: '#a6dc88', grassD: '#6bb757', patch: '#93d077', deco: ['#f4a6c8', '#fbd3e3', '#ffffff', '#f7c6d9'] },
  summer: { grass: '#6db95a', grassL: '#8fd16a', grassD: '#56a149', sand: '#f0dc9e', deco: ['#ffe066', '#ffffff'] },
  autumn: { grass: '#b7a24e', grassL: '#cdb35e', grassD: '#a86d3a', patch: '#bfa35a', deco: ['#d8642e', '#b8402a', '#e8a33a'] },
  winter: { grass: '#e6edf2', grassL: '#f5f8fa', grassD: '#ccd7df', sand: '#dcd8cc', shallow: '#8fbcdc', foam: '#ffffff', patch: '#dfe7ec', deco: ['#b7c5cf', '#ffffff'] },
  dry: { grass: '#b9b36c', grassL: '#cfc684', grassD: '#9d9650', sand: '#efdca8', patch: '#c2bb78', shallow: '#5aa2d2', deco: ['#9c7b4a', '#c9a46a'] },
  wet: { grass: '#3f9a4a', grassL: '#52ad57', grassD: '#2f7f3c', patch: '#4fa356', shallow: '#3f7fb5', deep: '#245c95', deco: ['#6fa8d6', '#2f7f3c'] },
};
export const SEASON_SWATCH: Record<Season, string> = {
  spring: '#f4a6c8', summer: '#6db95a', autumn: '#d8642e', winter: '#e6edf2', dry: '#cfc684', wet: '#3f7fb5',
};
const mix = (a: string, b: string, t: number) => {
  const x = hex(a), y = hex(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
function paletteFor(season: Season, night: boolean): Pal {
  const { deco, ...over } = SEASON_PAL[season];
  const base = night ? PAL.night : PAL.day;
  const tint = (c: string) => (night ? mix(c, '#0b1428', 0.58) : c);
  const painted = Object.fromEntries(Object.entries(over).map(([k, v]) => [k, tint(v as string)]));
  const decoRate = { spring: 0.035, summer: 0.012, autumn: 0.02, winter: 0.01, dry: 0.012, wet: 0.012 }[season];
  return { ...base, ...painted, deco: deco.map(tint), decoRate } as Pal;
}
const VCOLORS = ['#e0703a', '#d33b3b', '#2e9b5f', '#e9b52c', '#7a4fc2', '#4b5563', '#2b8fbd', '#8d6e4f'];
const isNight = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// ---------------------------------------------------------------- layout
// Everything is placed in map pixels, and the island grows with the vault: more projects add workshop
// rows, more companies add village rows, more beliefs lengthen the banner wall, more bets fill the harbor.
const BASE_W = 440, BASE_H = 280;
type Rect = [number, number, number, number];
type Ent =
  | { kind: 'project'; key: string; r: Rect; p: Project; sx: number; sy: number }
  | { kind: 'person'; key: string; r: Rect; p: Person; x: number; y: number; color: string; i: number }
  | { kind: 'village'; key: string; r: Rect; v: Village; color: string }
  | { kind: 'belief'; key: string; r: Rect; b: Belief; x: number }
  | { kind: 'bet'; key: string; r: Rect; b: Bet; x: number; y: number }
  | { kind: 'codex' | 'trophy' | 'home' | 'tower' | 'plaza'; key: string; r: Rect }
  | { kind: 'stray'; key: string; r: Rect; s: LiveSession; x: number; y: number };

interface Crew { by: Map<string, LiveSession[]>; strays: LiveSession[] }
const strayEnts = (strays: LiveSession[], L: Layout): Ent[] =>
  strays.slice(0, 5).map((s, i) => ({ kind: 'stray', key: `stray:${s.id}`, s, x: 262 + i * 7, y: 212 + L.dyH, r: [261 + i * 7, 207 + L.dyH, 5, 10] }));

function rectDist(px: number, py: number, r: Rect) {
  const dx = Math.max(r[0] - px, 0, px - (r[0] + r[2]));
  const dy = Math.max(r[1] - py, 0, py - (r[1] + r[3]));
  return Math.hypot(dx, dy);
}

/** The Plaza: land south of Home where Wonders stand. */
const PLAZA: Rect = [168, 163, 100, 29];
/** Where each Wonder stands on the Plaza (left of the road, then right). */
const WONDER_AT: Record<WonderKey, [number, number]> = { lighthouse: [172, 164], tree: [190, 166], archive: [228, 172] };

// Boat slots per lane, in rows that extend south as the harbor fills.
const SLOT: Record<'sea' | 'dock' | 'wreck', (k: number) => [number, number]> = {
  dock: (k) => { const c = k % 2, r = Math.floor(k / 2); return [c ? 285 : 306, (c ? 262 : 250) + r * 13]; },
  sea: (k) => { const c = k % 3, r = Math.floor(k / 3); return [384 - c * 26, 254 + c * 8 + r * 14]; },
  wreck: (k) => { const c = k % 2, r = Math.floor(k / 2); return [414 + c * 6, 236 + c * 28 + r * 42]; },
};

function layout(d: IslandData) {
  // workshop: rows of 6 plots, at least 4 rows
  const wRows = Math.max(4, Math.ceil(d.projects.length / 6));
  const projects = d.projects.map((p, i) => {
    const sx = 66 + (i % 6) * 16, sy = 90 + Math.floor(i / 6) * 24;
    return { kind: 'project' as const, key: `project:${p.id}`, p, sx, sy, r: [sx + 1, sy + 2, 15, 21] as Rect };
  });
  const workshopBottom = 90 + wRows * 24 + 4;

  // villages: 4 per row, each row as tall as its most crowded village
  const villages: { v: Village; x: number; y: number; h: number; color: string }[] = [];
  let vy = 96;
  // Buildings take the top slots, two per row (houses fill the rest); extra rows push the people down.
  const extraRows = (v: Village) => Math.max(0, Math.ceil((d.isle?.villages[v.name]?.buildings.length ?? 0) / 2) - 1);
  for (let r = 0; r * 4 < d.villages.length; r++) {
    const row = d.villages.slice(r * 4, r * 4 + 4);
    const h = 21 + Math.max(...row.map((v) => Math.max(3, Math.ceil(v.people.length / 5)) * 9 + extraRows(v) * 11));
    row.forEach((v, j) => villages.push({ v, x: 264 + j * 32, y: vy, h, color: VCOLORS[(r * 4 + j) % VCOLORS.length] }));
    vy += h + 4;
  }
  const villagesBottom = Math.max(196, vy - 4);
  // Villages that outgrow their district push the harbor south.
  const dyH = villagesBottom - 196;
  const villageEnts = villages.map(({ v, x, y, color }) => ({ kind: 'village' as const, key: `village:${v.name}`, v, color, r: [x + 2, y + 3, 26, 12] as Rect }));
  const people = villages.flatMap(({ v, x, y, color }) =>
    v.people.map((p, i) => {
      const px = x + 3 + (i % 5) * 5, py = y + 18 + extraRows(v) * 11 + Math.floor(i / 5) * 9;
      return { kind: 'person' as const, key: `person:${p.id}`, p, i, color, x: px, y: py, r: [px - 1, py - 2, 5, 8] as Rect };
    }),
  );

  // banner wall: keeps its east end and grows west
  const wallW = Math.max(124, d.beliefs.length * 10 + 14), wallX = 238 - wallW;
  const beliefs = d.beliefs.map((b, i) => ({ kind: 'belief' as const, key: `belief:${b.id}`, b, x: wallX + 8 + i * 10, r: [wallX + 7 + i * 10, 32, 10, 24] as Rect }));

  const used = { sea: 0, dock: 0, wreck: 0 };
  const bets = d.bets.map((b) => {
    const lane = b.status === 'sent' ? 'sea' : b.status === 'rejected' ? 'wreck' : 'dock';
    const [x, y0] = SLOT[lane](used[lane]++);
    const y = y0 + dyH;
    return { kind: 'bet' as const, key: `bet:${b.id}`, b, x, y, r: [x - 1, y - 3, 13, 14] as Rect };
  });
  const pierLen = Math.max(26, 13 * Math.ceil(used.dock / 2));

  // A wall longer than the island's west shore shifts the whole map east.
  const ox = Math.max(0, 24 - wallX);
  const W = BASE_W + ox;
  const H = Math.max(BASE_H, workshopBottom + 40, 280 + dyH, ...bets.map((e) => e.y + 16));
  const land: Rect[] = [
    [196, 114, 48, 46], [62, 88, 104, wRows * 24 + 8], [260, 92, 134, villagesBottom - 86], [wallX, 26, wallW, 42], [256, 24, 72, 52], [182, 194, 76, 48],
    [252, 214 + dyH, 52, 32],
    ...(dyH ? [[200, 236, 104, dyH + 12] as Rect] : []),
    ...(d.isle?.plaza ? [PLAZA] : []),
  ];
  const sea: Rect[] = [[280, 252 + dyH, 162, H], [372, 226 + dyH, 70, H]];

  const fixed: Ent[] = [
    { kind: 'codex', key: 'codex', r: [258, 26, 68, 50] },
    { kind: 'trophy', key: 'trophy', r: [184, 198, 72, 42] },
    { kind: 'home', key: 'home', r: [202, 120, 22, 22] },
    { kind: 'tower', key: 'tower', r: [226, 98, 12, 44] },
    ...(d.isle?.plaza ? [{ kind: 'plaza' as const, key: 'plaza', r: PLAZA }] : []),
  ];
  const labels: { text: string; x: number; y: number; harbor?: boolean }[] = [
    { text: 'Workshop', x: 114, y: 88 }, { text: 'Villages', x: 327, y: 90 }, { text: 'Banner Wall', x: wallX + wallW / 2, y: 28 },
    { text: 'Codex', x: 292, y: 24 }, { text: 'Trophy Hall', x: 220, y: 196 }, { text: 'Home', x: 212, y: 116 },
    ...(bets.length ? [{ text: 'Harbor', x: 330, y: 246 + dyH, harbor: true }] : []),
    ...(d.isle?.plaza ? [{ text: 'Plaza', x: 214, y: 162 }] : []),
  ];
  return {
    era: d.isle?.era ?? 0, plaza: !!d.isle?.plaza,
    W, H, ox, dyH, wRows, wallX, wallW, pierLen, land, sea, labels,
    projects, villages, villageEnts, people, beliefs, bets,
    ents: [...fixed, ...villageEnts, ...projects, ...beliefs, ...people, ...bets] as Ent[],
  };
}
type Layout = ReturnType<typeof layout>;

// ---------------------------------------------------------------- rendering
function buildTerrain(c: HTMLCanvasElement, p: Pal, L: Layout): [number, number][] {
  const { W, H, ox } = L;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const C = { deep: hex(p.deep), shallow: hex(p.shallow), foam: hex(p.foam), sand: hex(p.sand), grass: hex(p.grass), grassL: hex(p.grassL), grassD: hex(p.grassD) };
  const deco = p.deco.map(hex);
  const waves: [number, number][] = [];
  const cx = W / 2, cy = H / 2 - 2, rx = W / 2 - 14, ry = H / 2 - 14;
  const seed = L.era > 2026 ? (L.era - 2026) * 17.3 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry, mx = x - ox;
    // Each year's island is new land: the coast is drawn from noise shifted by the year.
    let h = 1 - Math.hypot(nx, ny) + (fbm(x * 0.022 + 3.1 + seed, y * 0.022 + 8.7 + seed * 0.6) - 0.5) * 0.42;
    for (const r of L.land) h = Math.max(h, 0.42 - rectDist(mx, y, r) / 30);
    for (const r of L.sea) h = Math.min(h, -0.06 + rectDist(mx, y, r) / 22);
    let col: number[];
    if (h < 0.03) { col = C.deep; if (hash(x + 91, y + 17) < 0.0045) waves.push([x, y]); }
    else if (h < 0.085) col = C.shallow;
    else if (h < 0.1) col = C.foam;
    else if (h < 0.15) col = C.sand;
    else {
      const g = fbm(x * 0.09 + 40, y * 0.09 + 12);
      col = g > 0.62 ? C.grassD : g < 0.36 ? C.grassL : C.grass;
      if (hash(x, y) < 0.04) col = C.grassD;
      if (hash(x + 5, y + 9) < p.decoRate) col = deco[Math.floor(hash(x, y + 3) * deco.length)];
    }
    const i = (y * W + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.translate(ox, 0);
  const fill = (x: number, y: number, w: number, h: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const road = (x1: number, y1: number, x2: number, y2: number) => {
    const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1) + 3, h = Math.abs(y2 - y1) + 3;
    fill(x, y + 1, w, h, p.pathD); fill(x, y, w, h, p.path);
  };
  const pad = (x: number, y: number, w: number, h: number, col: string, edge: string) => {
    fill(x, y, w, h, edge); fill(x + 1, y + 1, w - 2, h - 2, col);
    for (let j = y + 1; j < y + h - 1; j++) for (let i = x + 1; i < x + w - 1; i++) if (hash(i * 3, j * 7) < 0.05) fill(i, j, 1, 1, edge);
  };
  const dy = L.dyH;
  road(164, 139, 198, 139); road(242, 145, 262, 145); road(210, 66, 210, 116);
  road(236, 86, 236, 116); road(236, 86, 292, 86); road(290, 76, 290, 86);
  road(219, 158, 219, 198); road(219, 222, 219, 222 + dy); road(219, 222 + dy, 300, 222 + dy); road(300, 222 + dy, 300, 244 + dy);
  pad(64, 90, 100, L.wRows * 24 + 4, p.path, p.pathD);
  pad(198, 116, 44, 42, p.stone, p.stoneD);
  pad(260, 30, 64, 44, p.stone, p.stoneD);
  pad(184, 198, 72, 42, p.stone, p.stoneD);
  if (L.plaza) pad(PLAZA[0] + 2, PLAZA[1] + 2, PLAZA[2] - 4, PLAZA[3] - 4, p.path, p.pathD);
  for (let i = 0; i < L.wRows * 6; i++) {
    const sx = 66 + (i % 6) * 16, sy = 90 + Math.floor(i / 6) * 24;
    fill(sx + 1, sy + 3, 15, 20, p.plotD); fill(sx + 2, sy + 4, 13, 18, p.plot);
  }
  for (const v of L.villages) {
    fill(v.x, v.y, 30, v.h, p.patch);
    for (let i = v.x; i < v.x + 30; i += 3) { fill(i, v.y, 2, 1, p.wood); fill(i, v.y + v.h - 1, 2, 1, p.wood); }
    for (let j = v.y; j < v.y + v.h; j += 3) { fill(v.x, j, 1, 2, p.wood); fill(v.x + 29, j, 1, 2, p.wood); }
  }
  ctx.restore();
  return waves;
}

function buildFog(c: HTMLCanvasElement, p: Pal, L: Layout) {
  const { W, H, ox } = L;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const [r, g, b] = p.fog;
  const targets: [number, number, number][] = [];
  for (const e of L.projects) if (e.p.status !== 'done' && (e.p.days === null || e.p.days > RULES.projectFog)) targets.push([e.sx + 9 + ox, e.sy + 12, 12]);
  for (const e of L.people) if (e.p.tier === 'fog') targets.push([e.x + 1 + ox, e.y + 2, 6]);
  for (const [cx, cy, rad] of targets) {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > rad) continue;
      const a = Math.min(1, (1 - dist / rad) * 1.7 * fbm(x * 0.18, y * 0.18)) * 215;
      const i = (y * W + x) * 4;
      if (a > d[i + 3]) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
    }
  }
  ctx.clearRect(0, 0, W, H);
  ctx.putImageData(img, 0, 0);
}

function drawScene(ctx: CanvasRenderingContext2D, f: number, p: Pal, L: Layout, d: IslandData, o: { harbor: boolean; night: boolean; crew: Crew }) {
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); };
  ctx.save();
  ctx.translate(L.ox, 0);
  const house = (bx: number, by: number, roof: string) => {
    px(bx + 4, by + 2, 6, 2, roof); px(bx + 2, by + 4, 10, 2, roof); px(bx + 1, by + 6, 12, 2, roof);
    px(bx + 2, by + 8, 10, 6, p.wall); px(bx + 2, by + 13, 10, 1, p.wallD);
    px(bx + 6, by + 10, 2, 4, p.door); px(bx + 3, by + 9, 2, 2, p.win); px(bx + 9, by + 9, 2, 2, p.win);
  };

  // banner wall
  px(L.wallX, 56, L.wallW, 9, p.stone); px(L.wallX, 64, L.wallW, 1, p.stoneD);
  for (let i = 0; i * 6 + 3 <= L.wallW; i++) px(L.wallX + i * 6, 53, 3, 3, p.stone);
  px(171, 58, 8, 7, p.door);
  for (const e of L.beliefs) {
    const s = e.b.status;
    const col = s === 'confirmed' ? p.fire : s === 'adjusted' ? p.gold : s === 'rejected' ? p.fade : p.flagW;
    const wave = (f + e.x) % 4 < 2 ? 0 : 1;
    px(e.x, 34, 1, 22, p.wood); px(e.x + 1, 34, 6, 5, col); px(e.x + 7, 34 + wave, 1, 4, col);
    if (s === 'proposed') { px(e.x + 3, 35, 2, 1, p.ink); px(e.x + 4, 36, 1, 1, p.ink); px(e.x + 4, 38, 1, 1, p.ink); }
  }

  // codex
  px(266, 44, 52, 24, p.wall); px(266, 67, 52, 1, p.wallD);
  px(262, 38, 60, 6, p.purple); px(270, 32, 44, 6, p.purple); px(282, 28, 20, 4, p.purple);
  for (let i = 0; i < 6; i++) px(268 + i * 9, 46, 3, 20, p.marble);
  px(288, 56, 8, 12, p.door);
  const sealCol = { sealed: '#b0392b', due: '#e08a2a', judged: '#7f8c8d' };
  d.decisions.slice(0, 10).forEach((dec, i) => {
    const x = 266 + i * 5;
    px(x, 70, 3, 4, p.flagW); px(x, 70, 3, 1, p.wallD);
    if (!(dec.state === 'due' && f % 2)) px(x + 1, 72, 1, 1, sealCol[dec.state]);
  });

  // home + atlas's observatory
  house(204, 124, p.fire);
  px(208, 138, 6, 2, p.path);
  px(228, 112, 8, 28, p.stone); px(228, 139, 8, 1, p.stoneD);
  px(227, 108, 10, 4, p.stone); px(227, 106, 2, 2, p.stone); px(231, 106, 2, 2, p.stone); px(235, 106, 2, 2, p.stone);
  px(231, 116, 2, 3, f % 6 < 5 ? p.lamp : p.gold); px(231, 126, 2, 3, p.win);
  px(230, 100, 5, 5, '#3f6fb8'); px(229, 101, 7, 3, '#3f6fb8'); px(230, 101, 2, 2, '#4fae5c'); px(233, 103, 2, 1, '#4fae5c'); px(231, 100, 1, 1, '#bfe0ff');

  // trophy hall
  px(196, 212, 48, 22, p.marble); px(196, 233, 48, 1, p.wallD);
  px(192, 206, 56, 6, p.gold); px(200, 201, 40, 5, p.gold); px(212, 198, 16, 3, p.gold);
  for (let i = 0; i < 6; i++) px(198 + i * 8, 214, 3, 18, p.wall);
  px(216, 220, 8, 13, p.door);
  for (const [x, y] of [[188, 226], [248, 226]]) { px(x, y + 6, 6, 4, p.stoneD); px(x + 1, y, 4, 6, p.gold); px(x + 2, y - 2, 2, 2, p.gold); }
  const sp = [[205, 202], [232, 204], [222, 199], [244, 208]][f % 4];
  px(sp[0], sp[1], 1, 1, '#fff');

  // workshop
  for (const e of L.projects) {
    const pr = e.p, bx = e.sx + 2, by = e.sy + 6, roof = pr.venture ? p.fire : p.roof, days = pr.days ?? 999;
    if (pr.status === 'active' || pr.status === 'blocked') {
      px(bx + 2, by + 9, 10, 5, p.wall); px(bx + 2, by + 13, 10, 1, p.wallD); px(bx + 3, by + 10, 2, 2, p.win); px(bx + 6, by + 10, 2, 4, p.door);
      px(bx + 1, by + 2, 1, 12, p.wood); px(bx + 12, by + 2, 1, 12, p.wood); px(bx + 1, by + 2, 12, 1, p.wood); px(bx + 1, by + 7, 12, 1, p.wood);
      px(bx + 6, by, 2, 2, p.wood);
      if (pr.status === 'blocked') { for (let i = 0; i < 12; i += 2) { px(bx + 1 + i, by + 11, 1, 2, p.red); px(bx + 2 + i, by + 11, 1, 2, p.flagW); } }
      if (days > RULES.weeds) {
        for (const [dx, dy] of [[1, 13], [3, 12], [11, 12], [12, 13], [8, 13], [0, 12]]) px(bx + dx, by + dy, 1, 2, p.weed);
        px(bx + 1, by + 8, 1, 4, p.weed); px(bx + 12, by + 5, 1, 5, p.weed);
        if (days > RULES.heavyWeeds) { px(bx + 2, by + 2, 4, 1, p.weed); px(bx + 9, by + 7, 3, 1, p.weed); px(bx + 5, by + 6, 1, 1, p.weed); }
      }
    } else if (pr.status === 'done') {
      house(bx, by, p.gold);
      px(bx + 7, by - 4, 1, 6, p.wood); px(bx + 8, by - 4, 3 + (f % 2), 2, p.gold);
    } else if (pr.status === 'maintenance') {
      house(bx, by, p.green);
      px(bx + 10, by - 1, 3, 3, p.stoneD); px(bx + 11, by, 1, 1, p.wall);
    } else if (pr.status === 'paused') {
      px(bx + 2, by + 11, 10, 3, p.stone); px(bx + 2, by + 13, 10, 1, p.stoneD);
      px(bx + 3, by + 8, 8, 4, p.tarp); px(bx + 4, by + 7, 6, 1, p.tarp); px(bx + 3, by + 10, 8, 1, p.stoneD);
    } else {
      px(bx + 2, by + 9, 3, 5, p.stoneD); px(bx + 6, by + 11, 3, 3, p.stoneD); px(bx + 10, by + 8, 2, 6, p.stoneD);
      px(bx + 5, by + 13, 1, 1, p.stone); px(bx + 9, by + 13, 1, 1, p.stone); px(bx + 3, by + 8, 1, 1, p.stone);
    }
    if (pr.venture) { px(bx + 13, by - 3, 1, 7, p.wood); px(bx + 10, by - 3, 3, 2, p.fire); }
  }

  // villages
  const smallHouse = (hx: number, hy: number, roof: string) => {
    px(hx + 2, hy, 7, 2, roof); px(hx, hy + 2, 11, 2, roof); px(hx + 1, hy + 4, 9, 5, p.wall); px(hx + 4, hy + 6, 2, 3, p.door); px(hx + 7, hy + 5, 2, 2, p.win);
  };
  for (const v of L.villages) {
    const built = d.isle?.villages[v.v.name]?.buildings ?? [];
    const slots = Math.max(2, Math.ceil(built.length / 2) * 2);
    for (let k = 0; k < slots; k++) {
      const hx = v.x + 3 + (k % 2) * 13, hy = v.y + 4 + Math.floor(k / 2) * 11;
      if (built[k]) civBuilding(ctx, px, p, built[k], hx, hy, f);
      else smallHouse(hx, hy, v.color);
    }
    // A festival: bunting over the village, flags fluttering.
    if (d.isle?.villages[v.v.name]?.festival) {
      const cols = ['#e0503a', '#f2c230', '#3f8fd8', '#4fae5c', '#c06ad8'];
      px(v.x + 1, v.y + 1, 28, 1, p.wood);
      for (let i = 0; i < 7; i++) {
        const c = cols[(i + (f >> 1)) % cols.length], bx = v.x + 2 + i * 4, wave = (f + i) % 3 === 0 ? 1 : 0;
        px(bx, v.y + 2, 3, 1, c); px(bx + 1, v.y + 3 + wave, 1, 1, c);
      }
    }
  }
  // Island-wide buildings stand south of Home.
  (d.isle?.isleBuildings ?? []).forEach((b, k) => civBuilding(ctx, px, p, b, 198 + k * 13, 146, f));
  if (d.isle?.plaza) drawPlaza(ctx, px, p, d.isle, f, o.night);

  for (const e of L.people) {
    const l = d.isle?.life[e.p.id];
    if (!l) {
      const t = e.p.tier;
      const body = t === 'fading' ? p.fade : t === 'fog' ? p.fogNpc : e.color;
      const y = t === 'warm' && (f + e.i) % 4 === 0 ? e.y - 1 : e.y;
      px(e.x, y, 3, 2, p.skin); px(e.x, y + 2, 3, 3, body); px(e.x, y + 5, 1, 1, p.ink); px(e.x + 2, y + 5, 1, 1, p.ink);
      if (t === 'warm') px(e.x + 1, y - 2, 1, 1, (f + e.i) % 3 ? p.lamp : p.gold);
      continue;
    }
    drawVillager(ctx, px, p, e.x, e.y, l.life, e.color, f + e.i, o.night);
    if (l.birthday && l.life !== 'ghost') {
      const by = e.y - 7 + ((f + e.i) % 4 < 2 ? 0 : 1);
      px(e.x + 3, by, 2, 2, '#e0503a'); px(e.x + 3, by, 1, 1, '#ff9a86'); px(e.x + 3, by + 2, 1, 3, p.ink);
    }
  }
  // A Golden Age: the whole island glitters.
  if (d.isle?.golden) {
    for (let i = 0; i < 40; i++) {
      if ((i + f) % 5 > 1) continue;
      px(hash(i, 3) * L.W - L.ox, 30 + hash(i, 5) * (L.H - 60), 1, 1, (i + f) % 2 ? '#fff6c2' : p.gold);
    }
  }

  // A light beam over every building with live sessions; the crew pins (HTML, above the map) carry the detail.
  for (const e of L.projects) {
    const crew = o.crew.by.get(e.p.id);
    if (!crew?.length) continue;
    const rgb = crew.some((x) => x.state === 'needs_you') ? '235,85,60' : crew.some((x) => x.state === 'working') ? '255,205,90' : '205,220,240';
    const cx = e.sx + 9, top = e.sy - 30, bottom = e.sy + 12;
    const glow = 0.28 + 0.08 * (f % 3) + (o.night ? 0.12 : 0);
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${glow})`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - 4, top, 8, bottom - top);
    ctx.fillStyle = `rgba(${rgb},${Math.min(1, glow + 0.25)})`;
    ctx.fillRect(cx - 1, top + 8, 2, bottom - top - 8);
  }

  // harbor
  if (o.harbor && L.bets.length) {
    const top = 244 + L.dyH;
    px(298, top, 5, L.pierLen, p.wood);
    for (let j = top + 1; j < top + L.pierLen; j += 3) px(298, j, 5, 1, '#5a3418');
    for (const e of L.bets) {
      const x = e.x, y = e.y + (e.b.status === 'sent' && f % 4 >= 2 ? 1 : 0);
      if (e.b.status === 'rejected') {
        px(x, y + 6, 9, 3, p.stoneD); px(x + 1, y + 9, 7, 1, p.ink); px(x + 3, y + 2, 1, 4, p.wood); px(x + 4, y + 2, 2, 2, p.fade); px(x + 10, y + 7, 3, 2, p.stoneD);
        continue;
      }
      px(x, y + 5, 10, 3, '#7a4a24'); px(x + 1, y + 8, 8, 1, '#5a3418'); px(x + 4, y - 1, 1, 7, '#5a3418');
      px(x + 5, y, 4, 5, e.b.status === 'sent' ? p.flagW : e.b.status === 'offer' ? p.gold : p.tarp);
      if (e.b.status === 'sent') px(x + 5, y - 2, 2, 1, p.fire);
    }
  }

  if (o.night) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,200,90,${a})`); g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const e of L.people) if (d.isle ? d.isle.life[e.p.id]?.life === 'thriving' : e.p.tier === 'warm') glow(e.x + 1.5, e.y - 1, 7, 0.35);
    glow(232, 118, 10, 0.35); glow(220, 212, 22, 0.18);
    ctx.restore();
  }
  ctx.restore();
}

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

/** An 11×9 building in a village slot. Closed (unpaid upkeep): grey and boarded up. Storm-damaged: a hole and a rain cloud. Stars for levels. */
function civBuilding(ctx: CanvasRenderingContext2D, px: Px, p: Pal, b: CivBuilt, x: number, y: number, f: number) {
  const { key, closed } = b;
  const wall = closed ? p.fade : p.wall;
  const roof = closed ? p.stoneD : ({ clinic: '#f4f4f6', post: '#3f6fb8', shrine: '#c8402c', tavern: '#8d5a2b', library: '#5b3f8a', market: '#e0a020' } as Record<BuildingKey, string>)[key];
  if (key === 'shrine') {
    px(x, y + 1, 11, 2, roof); px(x + 1, y + 4, 9, 1, roof); px(x + 2, y + 3, 1, 6, roof); px(x + 8, y + 3, 1, 6, roof);
    if (!closed) px(x + 4, y + 6, 3, 3, p.gold);
  } else {
    px(x + 2, y, 7, 2, roof); px(x, y + 2, 11, 2, roof); px(x + 1, y + 4, 9, 5, wall); px(x + 4, y + 6, 2, 3, p.door);
    if (key === 'clinic') { px(x + 5, y - 2, 1, 4, '#d33'); px(x + 4, y - 1, 3, 1, '#d33'); }
    if (key === 'post') { px(x + 8, y + 5, 2, 4, '#d33'); }
    if (key === 'tavern') { px(x + 8, y + 5, 2, 2, p.gold); }
    if (key === 'library') { px(x + 2, y + 5, 1, 3, p.gold); px(x + 8, y + 5, 1, 3, p.gold); }
    if (key === 'market') { for (let i = 0; i < 11; i += 2) px(x + i, y + 4, 1, 1, '#fff'); }
  }
  if (closed) { px(x + 1, y + 4, 9, 1, p.wood); px(x + 1, y + 7, 9, 1, p.wood); }
  // Level stars over the roof's right end.
  for (let l = 1; l < b.level; l++) { const sx = x + 9 - (l - 1) * 3; px(sx, y - 2, 1, 3, p.gold); px(sx - 1, y - 1, 3, 1, p.gold); }
  if (b.damaged) {
    px(x + 3, y + 1, 3, 2, p.ink); px(x + 7, y + 5, 1, 3, p.ink);
    ctx.globalAlpha = 0.85;
    px(x + 1, y - 6, 9, 3, '#6b7280'); px(x + 3, y - 7, 5, 1, '#6b7280');
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) px(x + 2 + i * 3, y - 3 + ((f + i) % 3), 1, 1, '#9cc3f0');
  }
}

/** The Plaza: Wonders standing, statues of Wonders from earlier islands. */
function drawPlaza(ctx: CanvasRenderingContext2D, px: Px, p: Pal, isle: IsleData, f: number, night: boolean) {
  for (const w of isle.wonders) {
    const [x, y] = WONDER_AT[w];
    if (w === 'lighthouse') {
      px(x + 1, y + 18, 8, 3, p.stoneD);
      for (let i = 0; i < 6; i++) px(x + 2, y + 6 + i * 2, 6, 2, i % 2 ? '#f4f4f6' : '#c8402c');
      px(x + 1, y + 4, 8, 2, p.stoneD); px(x + 3, y, 4, 4, f % 4 < 2 ? '#ffe28a' : p.lamp); px(x + 2, y - 1, 6, 1, p.stoneD);
      if (night || f % 8 < 4) {
        ctx.save(); ctx.globalAlpha = night ? 0.35 : 0.18; ctx.fillStyle = '#ffe28a';
        const dir = f % 16 < 8 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 5 + dir * 40, y - 6); ctx.lineTo(x + 5 + dir * 40, y + 8); ctx.fill();
        ctx.restore();
      }
    } else if (w === 'tree') {
      // A round canopy in rows, light on top, over a thick trunk with roots.
      px(x + 7, y + 11, 4, 9, '#6b4423'); px(x + 5, y + 19, 8, 2, '#6b4423'); px(x + 8, y + 12, 1, 6, '#8a5a2e');
      for (const [dy, x0, w] of [[0, 5, 8], [1, 3, 12], [2, 2, 14], [3, 1, 16], [4, 1, 16], [5, 1, 16], [6, 1, 16], [7, 2, 14], [8, 2, 14], [9, 3, 12], [10, 5, 8]] as const) {
        px(x + x0, y + dy, w, 1, '#2f7d46');
      }
      for (const [dy, x0, w] of [[1, 6, 6], [2, 4, 8], [3, 3, 8], [4, 3, 6], [5, 4, 3]] as const) px(x + x0, y + dy, w, 1, '#4fae5c');
      for (const [dx, dy] of [[5, 2], [9, 3], [12, 6], [4, 7], [10, 8]]) px(x + dx, y + dy, 1, 1, '#9be3a8');
      if (f % 6 < 3) px(x + 3 + ((f * 5) % 12), y + 2 + (f % 7), 1, 1, '#fff6c2');
    } else {
      px(x, y + 4, 22, 2, p.marble); px(x + 2, y + 2, 18, 2, p.marble); px(x + 6, y, 10, 2, p.marble);
      for (let i = 0; i < 5; i++) px(x + 2 + i * 4, y + 6, 2, 9, p.marble);
      px(x, y + 15, 22, 2, p.stoneD); px(x + 10, y + 9, 2, 6, p.door);
    }
  }
  isle.statues.slice(-6).forEach((st, k) => {
    const x = 246 + (k % 3) * 6, y = 176 + Math.floor(k / 3) * 8;
    px(x, y + 4, 4, 2, p.stoneD); px(x + 1, y, 2, 4, st.key === 'tree' ? '#7a9a7a' : st.key === 'lighthouse' ? '#a8a29e' : p.marble);
  });
}

/** A villager by life: walking, waiting, in bed, a grave with its ghost, or a golden spirit. */
function drawVillager(ctx: CanvasRenderingContext2D, px: Px, p: Pal, x: number, y: number, life: Life, color: string, t: number, night: boolean) {
  const body = (bx: number, by: number, shirt: string) => {
    px(bx, by, 3, 2, p.skin); px(bx, by + 2, 3, 3, shirt); px(bx, by + 5, 1, 1, p.ink); px(bx + 2, by + 5, 1, 1, p.ink);
  };
  switch (life) {
    case 'thriving': {
      const by = t % 4 === 0 ? y - 1 : y;
      body(x, by, color);
      px(x + 1, by - 2, 1, 1, t % 3 ? p.lamp : p.gold);
      return;
    }
    case 'idle':
      body(x, y, color);
      if (t % 6 < 3) { px(x + 3, y - 2, 1, 1, p.ink); if (t % 6 > 0) px(x + 5, y - 2, 1, 1, p.ink); }
      return;
    case 'sick':
      // In bed: a white sheet, a pale face, and a slow z.
      px(x - 1, y + 3, 6, 3, '#f4efe4'); px(x - 1, y + 2, 2, 2, '#c9d6a0'); px(x + 1, y + 3, 4, 1, color);
      if (t % 4 < 2) px(x + 3, y - 1 - (t % 2), 1, 1, p.ink);
      return;
    case 'ghost': {
      // The grave stays put; the ghost drifts a little above it.
      px(x, y + 2, 3, 4, '#9a9aa2'); px(x + 1, y + 1, 1, 1, '#9a9aa2'); px(x + 1, y + 3, 1, 2, '#6a6a72');
      const gx = x + ((t >> 1) % 4 < 2 ? 0 : 1), gy = y - 5 + (t % 4 < 2 ? 0 : 1);
      ctx.globalAlpha = night ? 0.95 : 0.7;
      px(gx, gy, 3, 4, night ? '#dfe9ff' : '#eef4ff'); px(gx, gy + 4, 1, 1, '#eef4ff'); px(gx + 2, gy + 4, 1, 1, '#eef4ff');
      px(gx, gy + 1, 1, 1, '#1d1a3a'); px(gx + 2, gy + 1, 1, 1, '#1d1a3a');
      ctx.globalAlpha = 1;
      return;
    }
    case 'spirit':
      ctx.globalAlpha = 0.85;
      px(x, y - 1, 3, 5, '#ffe28a'); px(x, y - 3, 3, 1, p.gold);
      ctx.globalAlpha = 1;
      return;
    case 'unknown':
      body(x, y, p.fogNpc);
      return;
  }
}

function drawWeather(ctx: CanvasRenderingContext2D, season: Season, t: number, night: boolean, W: number, H: number) {
  const s = t / 1000;
  const dot = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const wrap = (v: number, m: number) => ((v % m) + m) % m;
  const n = { spring: 36, summer: 14, autumn: 34, winter: 80, dry: 30, wet: 120 }[season];
  for (let i = 0; i < n; i++) {
    const a = hash(i, 7), b = hash(i, 13), c = hash(i, 29);
    switch (season) {
      case 'winter':
        dot(wrap(a * W + Math.sin(s + i) * 4, W), wrap(b * H + s * (6 + c * 8), H), c > 0.7 ? 2 : 1, 1, night ? '#c9d6ea' : '#ffffff');
        break;
      case 'wet':
        ctx.fillStyle = night ? 'rgba(140,170,210,.55)' : 'rgba(190,215,240,.75)';
        ctx.fillRect(Math.round(wrap(a * W - s * 30, W)), Math.round(wrap(b * H + s * (120 + c * 60), H)), 1, 3);
        break;
      case 'autumn':
        dot(wrap(a * W + Math.sin(s * 1.5 + i) * 6 + s * 4, W), wrap(b * H + s * (8 + c * 6), H), 2, 1, ['#d8642e', '#b8402a', '#e8a33a'][i % 3]);
        break;
      case 'spring':
        dot(wrap(a * W + s * 8, W), wrap(b * H + s * 6 + Math.sin(s + i) * 3, H), 2, 1, i % 2 ? '#f7b6cf' : '#fbe0ea');
        break;
      case 'dry':
        ctx.fillStyle = 'rgba(214,190,140,.7)';
        ctx.fillRect(Math.round(wrap(a * W + s * 10, W)), Math.round(wrap(b * H + Math.sin(s * 0.8 + i) * 4, H)), 1, 1);
        break;
      case 'summer':
        if (night) {
          if ((Math.floor(s * 3) + i) % 5 < 2) dot(a * W + Math.sin(s / 2 + i) * 8, b * H + Math.cos(s / 3 + i) * 5, 1, 1, '#ffe066');
        } else {
          const x = a * W + Math.sin(s * 0.7 + i) * 10, y = b * H + Math.cos(s * 0.9 + i) * 6;
          const flap = Math.floor(s * 6 + i) % 2;
          dot(x - flap, y, 1, 1, i % 2 ? '#fff3b0' : '#ffffff');
          dot(x + 1 + flap, y, 1, 1, i % 2 ? '#fff3b0' : '#ffffff');
        }
        break;
    }
  }
}

// ---------------------------------------------------------------- component
const STATUS_WORD: Record<Project['status'], string> = {
  active: 'Under construction', blocked: 'Blocked: barrier up', done: 'Finished', maintenance: 'In maintenance',
  paused: 'Under tarp (paused)', stopped: 'Ruins (stopped)',
};
const BET_WORD: Record<Bet['status'], string> = {
  sent: 'At sea: sent, awaiting reply', draft: 'In the shipyard: draft', ready: 'Docked: ready, not sent', rejected: 'Wrecked: declined', offer: 'Returned with gold: offer',
};

export function IslandView({ data }: { data: IslandData }) {
  const L = useMemo(() => layout(data), [data]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Season and map layers are set on Settings → World; the island stays mounted behind it and follows along.
  const { fog, harbor, season: choice, atlas, sfx } = usePrefs();
  const season: Season = choice === 'auto' ? data.season.auto : choice;
  // On any other page the island is the backdrop: its own HUD (Atlas, inspector, zoom) steps aside.
  const onIsland = usePathname() === '/';
  const [showKey, setShowKey] = useState(false);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [hov, setHov] = useState<{ e: Ent; x: number; y: number } | null>(null);
  const { snapshot, focus, setFocus } = useLive();
  const crew = useMemo<Crew>(() => {
    const by = new Map<string, LiveSession[]>();
    const strays: LiveSession[] = [];
    for (const s of snapshot.live) {
      // Only confirmed or confident matches go on a building; guesses wait at the harbor road.
      const placed = s.mapping.kind === 'confirmed' || s.mapping.kind === 'auto';
      const id = placed ? s.mapping.project?.id : undefined;
      if (id && L.projects.some((e) => e.p.id === id)) by.set(id, [...(by.get(id) ?? []), s]);
      else strays.push(s);
    }
    return { by, strays };
  }, [snapshot, L]);
  const strays = useMemo(() => strayEnts(crew.strays, L), [crew, L]);
  const groups = useMemo<CrewGroup[]>(() => {
    const out: CrewGroup[] = [];
    for (const e of L.projects) {
      const ss = crew.by.get(e.p.id);
      if (ss?.length) out.push({ key: e.key, select: e.key, project: e.p.id, label: e.p.name, ax: e.sx + 9 + L.ox, ay: e.sy + 2, sessions: ss });
    }
    if (crew.strays.length) out.push({ key: 'strays', select: `stray:${crew.strays[0].id}`, project: null, label: 'Not placed yet', ax: 276 + L.ox, ay: 212 + L.dyH, sessions: crew.strays });
    return out;
  }, [crew, L]);
  const canvasSize = useMemo(() => ({ w: L.W, h: L.H }), [L]);
  const worldRef = useRef<HTMLDivElement>(null);
  const cam = useMapCamera(frameRef, worldRef, L.W, L.H, hudInsets);
  // The live tracker asks the island to select a project's building, and the map flies there.
  useEffect(() => {
    if (!focus) return;
    setSelKey(`project:${focus}`);
    setFocus(null);
    const e = L.projects.find((x) => x.p.id === focus);
    if (e) cam.current.show(e.sx + 9 + L.ox, e.sy + 12);
  }, [focus, setFocus, L, cam]);

  const live = useRef({ fog, harbor, sel: null as Ent | null, hov: null as Ent | null, crew });
  const sel = [...L.ents, ...strays].find((e) => e.key === selKey) ?? null;
  live.current = { fog, harbor, sel, hov: hov?.e ?? null, crew };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    const terr = Object.assign(document.createElement('canvas'), { width: L.W, height: L.H });
    const fogc = Object.assign(document.createElement('canvas'), { width: L.W, height: L.H });
    let pal: Pal = paletteFor(season, false), night = false, waves: [number, number][] = [];
    const rebuild = () => {
      night = isNight(); pal = paletteFor(season, night); waves = buildTerrain(terr, pal, L); buildFog(fogc, pal, L);
      // Open sea around the island when the frame's shape differs from the map's.
      if (frameRef.current) frameRef.current.style.background = pal.deep;
    };
    rebuild();
    const mo = new MutationObserver(rebuild);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', rebuild);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9;
    const loop = (t: number) => {
      if (t - last > 110) {
        last = t;
        const f = reduced ? 0 : Math.floor(t / 220);
        const s = live.current;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(terr, 0, 0);
        waves.forEach(([x, y], i) => { if ((i + f) % 7 < 2) { ctx.fillStyle = pal.foam; ctx.fillRect(x, y, 3, 1); } });
        drawScene(ctx, f, pal, L, data, { harbor: s.harbor, night, crew: s.crew });
        if (!reduced) drawWeather(ctx, season, t, night, L.W, L.H);
        if (s.fog) ctx.drawImage(fogc, reduced ? 0 : Math.round(Math.sin(t / 1500) * 1.5), 0);
        ([[s.hov, 'rgba(255,255,255,.75)'], [s.sel, '#ffd35a']] as const).forEach(([e, c], k) => {
          if (!e || (k === 1 && f % 2)) return;
          ctx.strokeStyle = c; ctx.lineWidth = 1;
          ctx.strokeRect(e.r[0] + L.ox - 0.5, e.r[1] - 0.5, e.r[2] + 1, e.r[3] + 1);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); mo.disconnect(); mq.removeEventListener('change', rebuild); };
  }, [L, data, season]);

  const entAt = (clientX: number, clientY: number): Ent | null => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * L.W - L.ox, y = ((clientY - r.top) / r.height) * L.H;
    const ents = L.ents;
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.kind === 'bet' && !harbor) continue;
      const [a, b, w, h] = e.r;
      if (x >= a && x <= a + w && y >= b && y <= b + h) return e;
    }
    return null;
  };

  const onMove = (ev: React.MouseEvent) => {
    const e = entAt(ev.clientX, ev.clientY);
    const fr = frameRef.current?.getBoundingClientRect();
    if (!e || !fr) { setHov(null); return; }
    let x = ev.clientX - fr.left + 14, y = ev.clientY - fr.top + 14;
    if (x + 250 > fr.width) x = ev.clientX - fr.left - 250;
    if (y + 80 > fr.height) y = ev.clientY - fr.top - 80;
    setHov({ e, x: Math.max(4, x), y: Math.max(4, y) });
  };


  const select = (key: string | null) => { setSelKey(key); if (key && sfx) blip('select'); };

  return (
    <div className="island-screen">
      <div className="map-frame" ref={frameRef} tabIndex={0} aria-label="Island map: drag or use arrow keys to move, + and − to zoom, 0 to fit" onPointerDown={() => setHov(null)}>
        <div className="map-world" ref={worldRef}>
          <canvas
            ref={canvasRef}
            data-season={season}
            data-live={[...crew.by].map(([id, ss]) => `${id}:${ss.length}:${ss.filter((s) => s.state === 'needs_you').length}`).join(' ')}
            data-strays={crew.strays.length}
            width={L.W}
            height={L.H}
            style={{ cursor: hov ? 'pointer' : undefined }}
            onMouseMove={onMove}
            onMouseLeave={() => setHov(null)}
            onClick={(ev) => { if (!cam.current.wasDrag()) select(entAt(ev.clientX, ev.clientY)?.key ?? null); }}
            aria-label="Pixel-art island map of projects, people, decisions, beliefs and trophies"
            role="img"
          />
          {L.labels.filter((l) => !l.harbor || harbor).map((l) => (
            <div key={l.text} className="dlabel" style={{ left: `${((l.x + L.ox) / L.W) * 100}%`, top: `${(l.y / L.H) * 100}%` }}>{l.text}</div>
          ))}
          {L.projects.filter((e) => data.scrolls?.[e.p.id]).map((e) => (
            <Link key={`scroll:${e.key}`} href="/today" className="scroll-pin" title={`${data.scrolls![e.p.id]} ${e.p.name} session${data.scrolls![e.p.id] === 1 ? '' : 's'} waiting to be saved`}
              style={{ left: `${((e.sx + 16 + L.ox) / L.W) * 100}%`, top: `${((e.sy + 21) / L.H) * 100}%` }}>
              📜{data.scrolls![e.p.id] > 1 && <b>{data.scrolls![e.p.id]}</b>}
            </Link>
          ))}
          <CrewPins groups={groups} frame={worldRef} canvas={canvasSize} onSelect={select} />
        </div>
        {hov && <div className="tip" style={{ left: hov.x, top: hov.y }}><Tip e={hov.e} data={data} crew={crew} /></div>}
      </div>
      {onIsland && (
        <>
          <div className="hud map-zoom">
            <button className="hud-btn" onClick={() => setShowKey(!showKey)} aria-expanded={showKey} aria-label="Map key" title="Map key">?</button>
            <button className="hud-btn" onClick={() => cam.current.zoom(1.4)} aria-label="Zoom in">+</button>
            <button className="hud-btn" onClick={() => cam.current.zoom(1 / 1.4)} aria-label="Zoom out">−</button>
            <button className="hud-btn" onClick={() => cam.current.fit()} aria-label="Fit the whole island" title="Fit the whole island (0)">⤢</button>
          </div>
          {showKey && <div className="hud hud-panel map-key"><MapKey data={data} /></div>}
          {sel ? (
            <aside className="hud hud-panel inspect" aria-label="Inspector">
              <button className="window-close" onClick={() => setSelKey(null)} aria-label="Close inspector">✕</button>
              <Detail e={sel} data={data} crew={crew} />
            </aside>
          ) : atlas ? (
            <AtlasBox data={data} onClose={() => setPrefs({ atlas: false })} />
          ) : (
            <button className="hud hud-btn atlas-call" onClick={() => setPrefs({ atlas: true })} aria-label="Talk to Atlas"><Sprite name="atlas" /></button>
          )}
        </>
      )}
    </div>
  );
}

// The HUD covers the screen edges; the fitted island sits in the space between.
function hudInsets() {
  const narrow = window.innerWidth < 700;
  return narrow ? { top: 96, right: 8, bottom: 84, left: 8 } : { top: 88, right: 24, bottom: 96, left: 24 };
}

const LIFE_WORD: Record<Life, string> = { thriving: 'Thriving', idle: 'Idle', sick: 'Sick', ghost: 'Ghost', spirit: 'In memoriam', unknown: 'Never logged' };
type LifeInfo = NonNullable<IsleData['life'][string]>;
function lifeLine(l: LifeInfo) {
  if (l.life === 'spirit') return 'In memoriam · a golden spirit';
  if (l.life === 'unknown') return 'Never logged · no contact yet';
  const ago = `last talked ${l.days} day${l.days === 1 ? '' : 's'} ago`;
  return `${LIFE_WORD[l.life]}${l.lives > 1 ? ` · life ${l.lives}` : ''} · ${ago}`;
}

function Tip({ e, data, crew }: { e: Ent; data: IslandData; crew: Crew }) {
  switch (e.kind) {
    case 'project': {
      const n = crew.by.get(e.p.id)?.length ?? 0;
      return <><b>{e.p.name}</b><br />{STATUS_WORD[e.p.status]}{e.p.days !== null && ` · ${e.p.days}d since movement`}{n > 0 && <><br />{n} live session{n > 1 ? 's' : ''}</>}</>;
    }
    case 'stray': return <><b>{e.s.cwdShort}</b><br />{AGENT_LABEL[e.s.agent]} session · not placed in a project yet</>;
    case 'person': {
      const l = data.isle?.life[e.p.id];
      return <><b>{e.p.name}</b><br />{e.p.company}{e.p.role && ` · ${e.p.role}`}<br />{l ? lifeLine(l) : TIER_LABEL[e.p.tier]}</>;
    }
    case 'village': {
      const iv = data.isle?.villages[e.v.name];
      return <><b>{e.v.name}</b><br />{iv ? `${iv.size} · ` : ''}{e.v.people.length} people{iv?.buildings.length ? ` · ${iv.buildings.map((b) => BUILDINGS[b.key].icon).join('')}` : ''}{iv?.festival ? <><br />🎉 Festival today</> : null}</>;
    }
    case 'belief': return <><b>Banner</b><br />{e.b.text}</>;
    case 'bet': return <><b>{e.b.title}</b><br />{BET_WORD[e.b.status]}</>;
    case 'codex': return <><b>The Codex</b><br />{data.decisions.length} decisions, {data.counts.due} ready to judge</>;
    case 'trophy': return <><b>Trophy Hall</b><br />{data.counts.trophies} trophies earned</>;
    case 'home': return <><b>Home</b><br />Your character sheet</>;
    case 'tower': return <><b>Atlas’s observatory</b><br />Your Dawn plan and Dusk review</>;
    case 'plaza': return <><b>The Plaza</b><br />{data.isle?.wonders.length ? data.isle.wonders.map((w) => `${BUILDINGS[w].icon} ${BUILDINGS[w].name}`).join(' · ') : 'Waiting for its first Wonder'}</>;
  }
}

function AtlasBox({ data, onClose }: { data: IslandData; onClose: () => void }) {
  const c = data.counts;
  const line = c.active === 0
    ? 'The workshop is empty. Add a note with `type: project` and it will appear here.'
    : c.weedy > c.active / 2
      ? `${c.weedy} of ${c.active} construction sites have weeds: no recorded movement in ${RULES.weeds}+ days. Maybe the work stopped, or maybe the vault just stopped hearing about it. Shall we lift the fog?`
      : `${c.active - c.weedy} of ${c.active} construction sites moved recently.${c.due ? ` ${c.due} decision${c.due > 1 ? 's are' : ' is'} ready to judge.` : ''}`;
  const shown = useTypewriter(line);
  return (
    <div className="hud hud-panel atlas-box" role="status">
      <Sprite name="atlas" className="portrait" />
      <div className="atlas-text">
        <b className="px">Atlas</b>
        <p aria-label={line}><span aria-hidden="true">{shown}</span></p>
        <div className="row">
          <Link className="btn primary" href="/today">Open today →</Link>
          <button className="btn" onClick={onClose}>Later</button>
        </div>
      </div>
    </div>
  );
}

/** Reveals dialogue a few letters at a time, like a game; instant when reduced motion is on. */
function useTypewriter(text: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((k) => { if (k >= text.length) { clearInterval(t); return k; } return k + 2; }), 24);
    return () => clearInterval(t);
  }, [text]);
  return text.slice(0, n);
}

function MapKey({ data }: { data: IslandData }) {
  return (
    <>
      <h3 style={{ marginBottom: 6 }}>Map key</h3>
      <div className="legend">
        <div><span className="sw" style={{ background: 'var(--info)' }} />Client project · <span className="sw" style={{ background: 'var(--accent)' }} />your own venture</div>
        <div><span className="sw" style={{ background: '#2f6e25' }} />Weeds: active, but silent {RULES.weeds}+ days</div>
        <div><span className="sw" style={{ background: 'var(--fog)' }} />Fog: forgotten ({RULES.projectFog}+ days for projects, {RULES.fading}+ for people)</div>
        <div><span className="sw" style={{ background: 'var(--warm)' }} />Lantern: someone you talked to in the last {RULES.warm} days</div>
        <div><span className="sw" style={{ background: 'var(--panel-3)' }} />White banner with “?”: belief not yet confirmed</div>
        <div><span className="sw" style={{ background: 'var(--warm)' }} />Pin + light beam: live agent sessions · red means one needs you</div>
        {data.bets.length > 0 && <div><span className="sw" style={{ background: '#7a4a24' }} />Ships: your bets, at sea, docked or wrecked</div>}
      </div>
      <p className="tiny muted" style={{ margin: '8px 0 0' }}>Drag to move · scroll or pinch to zoom · click to inspect · keys 1–8 open places</p>
    </>
  );
}

function SessionList({ sessions }: { sessions: LiveSession[] }) {
  const now = Date.now();
  return (
    <div>
      <h3 style={{ marginBottom: 6 }}>Live sessions</h3>
      <ul className="list">
        {sessions.map((s) => (
          <li key={s.id} className="item" data-state={s.state}>
            <h4>{s.state === 'needs_you' ? '❗ ' : s.state === 'working' ? '⚒ ' : '… '}{s.title ?? s.cwdShort}</h4>
            <p>
              {AGENT_LABEL[s.agent]} · {STATE_LABEL[s.state]}{s.inferred && ' (guessed from activity)'}
              {s.startedAt ? ` · ${elapsed(s.startedAt, now)}` : ''}{s.branch && ` · ${s.branch}`}
              {s.lastAction && ` · ${s.lastAction}`}
            </p>
            <p className="tiny"><code>{s.cwdShort}</code> · <Link href={`/sessions#${encodeURIComponent(s.cwd)}`}>Reassign</Link></p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ e, data, crew }: { e: Ent; data: IslandData; crew: Crew }) {
  const open = (path: string, label = 'Open in Obsidian') => <a href={obsidianLink(data.vaultName, path)}>{label}</a>;
  switch (e.kind) {
    case 'stray':
      return (
        <>
          <div><span className="pill">Not placed yet</span><h2 style={{ marginTop: 6 }}>Waiting at the harbor</h2>
            <p className="small muted" style={{ margin: '4px 0 0' }}>These sessions run in folders that aren’t confirmed for a project yet.</p></div>
          <SessionList sessions={crew.strays} />
          <Link className="btn primary" href="/sessions">Place these folders →</Link>
        </>
      );
    case 'project': {
      const pr = e.p, days = pr.days ?? 999;
      const why = pr.status === 'active'
        ? days > RULES.heavyWeeds ? `Heavy weeds and vines: over ${RULES.heavyWeeds} days without recorded movement.`
          : days > RULES.weeds ? 'Weeds are creeping in. Atlas will ask about this at Dawn.'
            : days <= RULES.fresh ? 'Fresh scaffolding: recent movement. Workers appear while an agent session is running here.' : 'Scaffolding up, work in progress.'
        : pr.status === 'blocked' ? 'A barrier is up. Something outside your control is in the way.'
          : pr.status === 'paused' ? (days > RULES.projectFog ? 'Under a tarp and fogged in. Revive it, or archive it to free the land?' : 'Under a tarp, waiting.')
            : pr.status === 'stopped' ? 'Ruins. Write down why it stopped, so future you remembers.'
              : pr.status === 'done' ? 'Finished, with a gold roof. It also has a place in the Trophy Hall.' : 'Built and running, with a maintenance crew on site.';
      return (
        <>
          <div>
            <span className="pill">{STATUS_WORD[pr.status]}</span>{' '}
            {pr.venture && <span className="pill" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>own venture</span>}
            <h2 style={{ marginTop: 6 }}>{pr.name}</h2>
          </div>
          {pr.summary && <p className="small" style={{ margin: 0 }}>{pr.summary}</p>}
          <dl className="kv">
            {pr.client && <><dt>Client</dt><dd>{pr.client}</dd></>}
            <dt>Last movement</dt><dd>{fmtDate(pr.lastActivity)}{pr.days !== null && ` · ${pr.days} days`}</dd>
            {pr.deadline && <><dt>Deadline</dt><dd>{fmtDate(pr.deadline)}</dd></>}
          </dl>
          <div className="why"><b>Why it looks like this:</b> {why}</div>
          {pr.log.length > 0 && (
            <ul className="pu-log" aria-label="Latest updates">
              {pr.log.slice(0, 3).map((u, i) => <li key={i}><time dateTime={u.date}>{fmtDate(u.date)}</time>{u.text}</li>)}
            </ul>
          )}
          {!data.readOnly && <ProjectUpdate key={pr.path} path={pr.path} status={pr.status} today={data.today} />}
          {(crew.by.get(pr.id)?.length ?? 0) > 0 && <SessionList sessions={crew.by.get(pr.id)!} />}
          {open(pr.path)}
        </>
      );
    }
    case 'person': {
      const p = e.p;
      const l = data.isle?.life[p.id];
      if (l) return <VillagerDetail p={p} l={l} data={data} open={open(p.path)} />;
      const tip = { warm: 'The lantern is lit. Nothing to do.', cooling: 'Worth a two-line check-in this week.', fading: 'Maybe a coffee or a voice note?', fog: 'Rekindle this, or let it rest. Both are fine; just choose.' }[p.tier];
      return (
        <>
          <div><span className="pill">{p.company}</span><h2 style={{ marginTop: 6 }}>{p.name}</h2>{p.role && <div className="small muted">{p.role}</div>}</div>
          <dl className="kv">
            <dt>Last contact</dt><dd>{p.lastContact ? `${fmtDate(p.lastContact)} · ${p.days} days` : 'never logged'}</dd>
            <dt>Lantern</dt><dd>{TIER_LABEL[p.tier]}</dd>
            <dt>Mentioned in</dt><dd>{p.mentions} notes</dd>
          </dl>
          <div className="why"><b>Atlas:</b> {tip}</div>
          <div className="row">
            {!data.readOnly && p.tier !== 'warm' && <ActionButton className="btn good" action={() => lightLantern(p.path)}>We talked recently</ActionButton>}
            {open(p.path)}
          </div>
        </>
      );
    }
    case 'plaza': {
      const isle = data.isle!;
      return (
        <>
          <div><span className="pill">{isle.golden ? 'Golden Age ✨' : `The island of ${isle.era}`}</span><h2 style={{ marginTop: 6 }}>The Plaza</h2></div>
          <p className="small" style={{ margin: 0 }}>Land Atlas cleared for Wonders. Each one is unlocked by what you do, then paid for in Shells.</p>
          <ul className="list">
            {(Object.keys(WONDER_GOAL) as WonderKey[]).map((w) => (
              <li key={w} className="item"><h4>{BUILDINGS[w].icon} {BUILDINGS[w].name}{isle.wonders.includes(w) ? ' · standing' : ''}</h4><p>{BUILDINGS[w].does}. Unlocked by {WONDER_GOAL[w].need} {WONDER_GOAL[w].what}.</p></li>
            ))}
          </ul>
          {isle.statues.length > 0 && <p className="tiny muted" style={{ margin: 0 }}>Statues from earlier islands: {isle.statues.map((st) => `${BUILDINGS[st.key].icon} ${st.year}`).join(' · ')}</p>}
          <Link className="btn" href="/isle">Open the Treasury →</Link>
        </>
      );
    }
    case 'village': {
      const iv = data.isle?.villages[e.v.name];
      return (
        <>
          <div>{iv && <span className="pill">{iv.size}</span>}{iv?.festival && <> <span className="pill">🎉 Festival today</span></>}<h2 style={{ marginTop: 6 }}>{e.v.name}</h2></div>
          {iv && (
            <p className="small" style={{ margin: 0 }}>
              {iv.buildings.length
                ? iv.buildings.map((b) => `${BUILDINGS[b.key].icon} ${BUILDINGS[b.key].name}${b.level > 1 ? ` ★${b.level}` : ''}${b.closed ? ' (closed: upkeep unpaid)' : b.damaged ? ' (storm-damaged)' : ''}`).join(' · ')
                : 'No buildings yet. Atlas builds here when the village needs it.'}
            </p>
          )}
          <ul className="list">
            {e.v.people.map((p) => {
              const l = data.isle?.life[p.id];
              return <li key={p.id} className="item"><h4>{l?.life === 'ghost' ? '👻 ' : l?.life === 'sick' ? '🤒 ' : ''}{p.name}</h4><p>{p.role || '—'} · {l ? lifeLine(l) : TIER_LABEL[p.tier]}</p></li>;
            })}
          </ul>
        </>
      );
    }
    case 'belief':
      return <><h2>Banner</h2><BeliefCard b={e.b} vaultName={data.vaultName} readOnly={data.readOnly} /></>;
    case 'bet':
      return (
        <>
          <div><span className="pill">{BET_WORD[e.b.status]}</span><h2 style={{ marginTop: 6 }}>{e.b.title}</h2><div className="small muted">{e.b.kind}</div></div>
          {e.b.note && <div className="why">{e.b.note}</div>}
          {e.b.date && <p className="small" style={{ margin: 0 }}>{fmtDate(e.b.date)} · {e.b.days} days ago</p>}
          {open(e.b.path)}
        </>
      );
    default: {
      const m = {
        codex: ['The Codex', 'Your decisions, sealed with their context. Seals crack after 90 days, and then you judge them.', '/codex'],
        trophy: ['Trophy Hall', 'Milestones, wins, scholarship and scars. Each one is public or private.', '/trophies'],
        home: ['Home', 'Your character sheet: attributes, streak and class.', '/character'],
        tower: ['Atlas’s observatory', 'Your chief of staff lives here: Dawn plan and Dusk review, made for your phone.', '/today'],
      }[e.kind];
      return <><h2>{m[0]}</h2><p className="small" style={{ margin: 0 }}>{m[1]}</p><Link className="btn primary" href={m[2]}>Enter →</Link></>;
    }
  }
}

const CIRCLE_OPTIONS = (Object.keys(CLOCK) as Circle[]).map((c) => ({ value: c, label: CLOCK[c].label, hint: `sick at ${CLOCK[c].sick} days, ghost at ${CLOCK[c].dead}` }));

function VillagerDetail({ p, l, data, open }: { p: Person; l: LifeInfo; data: IslandData; open: React.ReactNode }) {
  const tip = {
    thriving: 'All good. They wave when you walk by.',
    idle: 'Sitting outside, a bit bored. A quick message keeps them going.',
    sick: `In bed. ${l.left} day${l.left === 1 ? '' : 's'} before they die. Two lines today would do it.`,
    ghost: 'Their ghost drifts over the grave. Talk to them and they come back, with a new life.',
    spirit: 'A golden spirit. Remembered, never neglected.',
    unknown: 'No contact logged yet: no meeting, no Dusk mention, no last_contact.',
  }[l.life];
  const health = l.days === null ? 0 : Math.max(4, 100 - (l.days / l.dead) * 100);
  return (
    <>
      <div>
        <span className={`pill life-${l.life}`}>{LIFE_WORD[l.life]}</span>{' '}
        {l.lives > 1 && <span className="pill">Life {l.lives}</span>}{' '}
        <span className="pill">{p.company}</span>
        <h2 style={{ marginTop: 6 }}>{p.name}</h2>{p.role && <div className="small muted">{p.role}</div>}
      </div>
      <dl className="kv">
        <dt>Last talked</dt><dd>{l.days === null ? 'never logged' : `${l.days} day${l.days === 1 ? '' : 's'} ago`}</dd>
        {l.about && <><dt>About</dt><dd>{l.about}</dd></>}
        {l.life !== 'spirit' && <><dt>Clock</dt><dd>sick at {l.sick} days · ghost after {l.dead}{l.dead > CLOCK[l.circle].dead ? ' (Clinic +7)' : ''}</dd></>}
      </dl>
      {l.life !== 'spirit' && l.life !== 'unknown' && <div className="life-bar" aria-hidden="true"><span className={`life-${l.life}`} style={{ width: `${l.life === 'ghost' ? 0 : health}%` }} /></div>}
      <div className="why"><b>Atlas:</b> {tip}</div>
      {!data.readOnly && l.life !== 'spirit' && (
        <div className="row">
          <ActionButton className="btn good" action={() => lightLantern(p.path)}>{l.life === 'ghost' ? '✨ We talked: bring them back' : '💬 We talked today'}</ActionButton>
          <PixelSelect<Circle> label="Circle" value={l.circle} options={CIRCLE_OPTIONS} onChange={(c) => { void setCircle(p.path, c); }} />
        </div>
      )}
      <div className="row">{open}<span className="tiny muted">Passed away? Add <code>in_memoriam: true</code> to their note.</span></div>
    </>
  );
}

export function BeliefCard({ b, vaultName, readOnly }: { b: Belief; vaultName: string; readOnly: boolean }) {
  const opts: [BeliefStatus, string][] = [['confirmed', '✓ That’s me'], ['adjusted', '✎ Close, adjust'], ['rejected', '✗ Not me']];
  return (
    <div className="belief">
      <div className={`flag ${b.status}`} />
      <div>
        <h4>{b.text}</h4>
        {b.evidence && <p>{b.evidence}</p>}
        <p className="tiny">
          <span className="conf" title={`Confidence ${b.confidence}/3`}>{[1, 2, 3].map((i) => <i key={i} className={i <= b.confidence ? 'on' : ''} />)}</span>{' '}
          confidence · <a href={obsidianLink(vaultName, b.path)}>note</a>
        </p>
        {!readOnly && (
          <div className="vote">
            {opts.map(([s, l]) => <ActionButton key={s} pressed={b.status === s} action={() => voteBelief(b.path, s)}>{l}</ActionButton>)}
          </div>
        )}
      </div>
    </div>
  );
}
