// The personality avatar (roadmap §7): self-reported only, never inferred from notes.
// Layers on a 16×16 base: skin and face, hair, outfit (from MBTI temperament or the top Big Five trait),
// an emblem and accent colour (Enneagram), a banner for E types and a companion pet for I types.
import type { SpriteDef } from '@/components/sprites';

export type Trait = 'O' | 'C' | 'E' | 'A' | 'N';
export interface Personality { mbti: string | null; enneagram: number | null; big5: Trait[] }
export interface Look { hair: keyof typeof HAIR; skin: keyof typeof SKIN; color: keyof typeof COLORS | null }
export type Outfit = 'traveler' | 'scholar' | 'bard' | 'knight' | 'ranger';

export const MBTI = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'] as const;
export const TRAITS: Record<Trait, string> = { O: 'Openness', C: 'Conscientiousness', E: 'Extraversion', A: 'Agreeableness', N: 'Sensitivity (neuroticism)' };
export const ENNEAGRAM = ['Reformer', 'Helper', 'Achiever', 'Individualist', 'Investigator', 'Loyalist', 'Enthusiast', 'Challenger', 'Peacemaker'];

export const HAIR = { black: '#1d1a1a', brown: '#5a3a22', auburn: '#8a3b22', blonde: '#d9b25a', grey: '#9a9a9a', scarf: '' } as const;
export const SKIN = { 1: '#f4d3b5', 2: '#e8b892', 3: '#d19a6e', 4: '#a96f45', 5: '#7a4a2c', 6: '#4e2f1e' } as const;
export const COLORS = { ember: '#e0703a', moss: '#4f9a5c', sky: '#3f6fb8', plum: '#7a4fa0', gold: '#c9961c', rose: '#c0506a', slate: '#5d6878' } as const;
const EMBLEM_COLOR = ['#c0392b', '#e0703a', '#e0ab24', '#7a4fa0', '#2c3e66', '#3f6fb8', '#f2c14e', '#8a3b22', '#4f9a5c'];

export const DEFAULT_LOOK: Look = { hair: 'black', skin: 2, color: null };
export const NO_PERSONALITY: Personality = { mbti: null, enneagram: null, big5: [] };

/** MBTI temperament: Analyst (NT), Diplomat (NF), Sentinel (SJ), Explorer (SP). */
export function temperament(mbti: string | null): 'NT' | 'NF' | 'SJ' | 'SP' | null {
  if (!mbti || !/^[EI][NS][TF][JP]$/.test(mbti)) return null;
  if (mbti[1] === 'N') return mbti[2] === 'T' ? 'NT' : 'NF';
  return mbti[3] === 'J' ? 'SJ' : 'SP';
}

const OUTFIT_OF: Record<'NT' | 'NF' | 'SJ' | 'SP', Outfit> = { NT: 'scholar', NF: 'bard', SJ: 'knight', SP: 'ranger' };
const OUTFIT_OF_TRAIT: Record<Trait, Outfit> = { O: 'scholar', A: 'bard', C: 'knight', E: 'ranger', N: 'traveler' };
const OUTFIT_COLORS: Record<Outfit, { main: string; shade: string; trim: string }> = {
  traveler: { main: '#e0703a', shade: '#a94f23', trim: '#f2c14e' },
  scholar: { main: '#5b3f8c', shade: '#3b2860', trim: '#e0ab24' },
  bard: { main: '#3f8f5c', shade: '#2a6340', trim: '#f2c14e' },
  knight: { main: '#9aa3ad', shade: '#5d6878', trim: '#e0ab24' },
  ranger: { main: '#6b7a3a', shade: '#4a5426', trim: '#8a5a2b' },
};
/** The same colour, darker: shades follow a custom outfit colour. */
const darken = (hex: string, k = 0.65) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;

const TRAIT_COLOR: Record<Trait, string> = { O: '#7a4fa0', C: '#3f6fb8', E: '#e0703a', A: '#4f9a5c', N: '#c0506a' };

export interface Avatar {
  body: SpriteDef;
  companion: SpriteDef | null;
  outfit: Outfit;
  /** Plain-language explanation of each layer, for the Character page. */
  layers: string[];
}

// Base figure. h: hair, s: skin, e: eyes, r: mouth, o: outfit, O: outfit shade, t: trim.
const BASE = [
  '................', '.....hhhhhh.....', '....hhhhhhhh....', '....hssssssh....', '....sesssses....', '....ssssssss....',
  '....ssrrrrss....', '.....ssssss.....', '......ssss......', '...oooooooooo...', '..oooooooooooo..', '..oooooooooooo..',
  '..oooooooooooo..', '..ssoooooooooss.', '..ssooOooooOoss.', '....oooooooo....',
];

const put = (rows: string[], y: number, x: number, ch: string) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + ch.length); };

function dressed(outfit: Outfit, scarf: boolean): string[] {
  const r = [...BASE];
  if (outfit === 'scholar') { // long robe with a gold stripe down the front
    for (let y = 9; y <= 15; y++) put(r, y, 7, 'tt');
    r[15] = '...OooottooooO..';
  } else if (outfit === 'bard') { // cloak: dark edges and a clasp
    for (let y = 9; y <= 14; y++) { put(r, y, y === 9 ? 3 : 2, 'O'); put(r, y, y === 9 ? 12 : 13, 'O'); }
    put(r, 9, 7, 'tt');
  } else if (outfit === 'knight') { // armour plates and shoulder guards
    r[9] = '..OoooooooooooO.';
    r[11] = '..OOOOOOOOOOOO..';
    put(r, 13, 4, 'OOOOOOOOO');
  } else if (outfit === 'ranger') { // hood over the hair and a belt
    r[1] = '.....oooooo.....'; r[2] = '....oooooooo....'; r[3] = '....ossssssO....';
    r[12] = '..tttttttttttt..';
  }
  if (scarf && outfit !== 'ranger') { // headscarf in the outfit colour, framing the face
    r[1] = '.....oooooo.....'; r[2] = '....oooooooo....'; r[3] = '...oossssssoo...'; r[4] = '...osesssseso...'; r[5] = '...ossssssssO...';
    r[6] = '...ossrrrrssO...'; r[7] = '....oossssooO...';
  }
  return r;
}

// Enneagram emblems, 2 columns × 3 rows on the chest.
const EMBLEMS = [
  ['yy', 'yy', 'yy'], ['.y', 'yy', 'y.'], ['y.', 'yy', '.y'], ['yy', '..', 'yy'], ['.y', '.y', 'yy'],
  ['yy', 'y.', 'yy'], ['y.', '.y', 'y.'], ['yy', 'yy', '..'], ['..', 'yy', 'yy'],
];

const COMPANIONS: Record<'owl' | 'fox' | 'cat', SpriteDef> = {
  owl: {
    pal: { b: '#8a5a2b', d: '#5a3a1a', w: '#f6e7c8', e: '#1d1a1a', y: '#f2c14e' },
    rows: ['................', '................', '................', '................', '................', '................',
      '....b......b....', '....bbbbbbbb....', '....bwwbbwwb....', '....bweyyewb....', '....bbbyybbb....', '....dbwwwwbd....',
      '....dbwwwwbd....', '.....bbbbbb.....', '......y..y......', '................'],
  },
  fox: {
    pal: { o: '#e0703a', d: '#a94f23', w: '#f6e7c8', e: '#1d1a1a' },
    rows: ['................', '................', '................', '................', '................', '................',
      '................', '...o....o.......', '...oo..oo.......', '...oooooo.......', '...oeooeo....oo.', '....owwo....ooo.',
      '....oooooooooo..', '....oooooooooo..', '....d.d..d.d....', '................'],
  },
  cat: {
    pal: { g: '#5d6878', d: '#3a4250', p: '#e0a0b0', e: '#f2c14e' },
    rows: ['................', '................', '................', '................', '................', '................',
      '................', '...g...g........', '...gg.gg........', '...ggggg........', '...gegeg.....g..', '...ggpgg.....g..',
      '....gggggggggg..', '....gggggggggg..', '....d.d...d.d...', '................'],
  },
};

export function avatarFor(p: Personality, look: Look): Avatar {
  const temp = temperament(p.mbti);
  const outfit: Outfit = temp ? OUTFIT_OF[temp] : p.big5[0] ? OUTFIT_OF_TRAIT[p.big5[0]] : 'traveler';
  const scarf = look.hair === 'scarf';
  const rows = dressed(outfit, scarf);
  const oc = OUTFIT_COLORS[outfit];
  const main = look.color ? COLORS[look.color] : oc.main;
  const accent = p.enneagram ? EMBLEM_COLOR[p.enneagram - 1] : p.big5[1] ? TRAIT_COLOR[p.big5[1]] : oc.trim;
  const layers: string[] = [];
  layers.push(temp ? `${({ scholar: 'Scholar’s robe', bard: 'Bard’s cloak', knight: 'Knight’s armour', ranger: 'Ranger’s hood' } as Record<Outfit, string>)[outfit]}: ${({ NT: 'Analyst', NF: 'Diplomat', SJ: 'Sentinel', SP: 'Explorer' })[temp]} (${p.mbti})`
    : p.big5[0] ? `Outfit from your strongest trait, ${TRAITS[p.big5[0]]}` : 'Traveller’s tunic (no personality set)');

  if (p.enneagram) {
    EMBLEMS[p.enneagram - 1].forEach((pat, i) => [...pat].forEach((c, j) => { if (c !== '.') put(rows, 10 + i, 7 + j, 'y'); }));
    layers.push(`Emblem of the ${ENNEAGRAM[p.enneagram - 1]} (Enneagram ${p.enneagram})`);
  } else if (p.big5[1]) layers.push(`Accent from your second trait, ${TRAITS[p.big5[1]]}`);

  let companion: SpriteDef | null = null;
  if (p.mbti?.[0] === 'E') { // a banner in hand
    for (let y = 3; y <= 15; y++) put(rows, y, 15, 'p');
    put(rows, 3, 12, 'fff'); put(rows, 4, 12, 'fff'); put(rows, 5, 13, 'ff');
    layers.push('Banner-bearer (extravert)');
  } else if (p.mbti?.[0] === 'I') {
    const kind = temp === 'NT' ? 'owl' : temp === 'SJ' ? 'cat' : 'fox';
    companion = COMPANIONS[kind];
    layers.push(`${kind === 'owl' ? 'An' : 'A'} ${kind} companion (introvert)`);
  }
  return {
    outfit, companion, layers,
    body: {
      pal: { h: HAIR[look.hair] || main, s: SKIN[look.skin], e: '#1d1a1a', r: '#b5735a', o: main, O: look.color ? darken(main) : oc.shade, t: oc.trim, y: accent, p: '#6b4426', f: accent },
      rows,
    },
  };
}

/** Parse the settings note's `personality:` and `avatar:` lines; anything invalid is ignored. */
export function parsePersonality(v: unknown): Personality {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const mbti = typeof o.mbti === 'string' && (MBTI as readonly string[]).includes(o.mbti.toUpperCase()) ? o.mbti.toUpperCase() : null;
  const n = Number(o.enneagram);
  const big5 = (Array.isArray(o.big5) ? o.big5 : []).map((t) => String(t).toUpperCase()).filter((t): t is Trait => t in TRAITS).slice(0, 2);
  return { mbti, enneagram: Number.isInteger(n) && n >= 1 && n <= 9 ? n : null, big5 };
}
export function parseLook(v: unknown): Look {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const hair = String(o.hair ?? '') in HAIR ? (String(o.hair) as Look['hair']) : DEFAULT_LOOK.hair;
  const skin = String(o.skin ?? '') in SKIN ? (Number(o.skin) as Look['skin']) : DEFAULT_LOOK.skin;
  const color = String(o.color ?? '') in COLORS ? (String(o.color) as Look['color']) : null;
  return { hair, skin, color };
}
