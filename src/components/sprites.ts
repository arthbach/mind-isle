// 16×16 pixel sprites. Each row is 16 chars; '.' is transparent, other chars index the palette.
export interface SpriteDef { pal: Record<string, string>; rows: string[] }

export const SPRITES: Record<string, SpriteDef> = {
  atlas: {
    pal: { g: '#3f6fb8', l: '#4fae5c', w: '#cfe6ff', k: '#2a2320', s: '#e2b38a', e: '#1d1a1a', c: '#2c3e66', y: '#f2c14e' },
    rows: [
      '......gggg......', '....ggwlgggg....', '...gglllggggg...', '...ggglggllgg...', '....gggggllg....', '..ss..gggg..ss..',
      '..ss.kkkkkk.ss..', '..ss.kssssk.ss..', '..ss.sesses.ss..', '..sc.ssssss.cs..', '...cccyyyyccc...', '...cccccccccc...',
      '...ccccyycccc...', '...cccccccccc...', '....cc....cc....', '....kk....kk....',
    ],
  },
  traveler: {
    pal: { k: '#1d1a1a', s: '#e8b892', e: '#1d1a1a', r: '#b5735a', o: '#e0703a', y: '#f2c14e', d: '#a94f23' },
    rows: [
      '................', '.....kkkkkk.....', '....kkkkkkkk....', '....kssssssk....', '....sesssses....', '....ssssssss....',
      '....ssrrrrss....', '.....ssssss.....', '......ssss......', '...oooooooooo...', '..ooooooyyooooo.', '..oooooyyyyoooo.',
      '..ooooooyyooooo.', '..ssoooooooooss.', '..ssoodooodooss.', '....oooooooo....',
    ],
  },
  // Agent portraits for live sessions.
  claude: {
    pal: { h: '#e0703a', H: '#b8541f', s: '#efc29a', e: '#2a1e14', m: '#9c4a2a', c: '#c9643a', w: '#f6e7c8', k: '#3a2a1c' },
    rows: [
      '................', '.....hhhhhh.....', '....hhhhhhhh....', '...HHHHHHHHHH...', '....ssssssss....', '....sesssses....',
      '....ssssssss....', '....sssmmsss....', '.....ssssss.....', '...cccccccccc...', '..cccwccccwccc..', '..cccwccccwccc..',
      '..sscccccccccss.', '..sscccccccccss.', '....cccccccc....', '....kk....kk....',
    ],
  },
  codex: {
    pal: { m: '#5aa9c9', M: '#2f6f8f', y: '#ffd35a', l: '#bfe6f5', k: '#1d3a4a' },
    rows: [
      '.......mm.......', '.......m........', '....mmmmmmmm....', '...mMMMMMMMMm...', '...mMyyMMyyMm...', '...mMMMMMMMMm...',
      '...mMMllllMMm...', '....mmmmmmmm....', '......MMMM......', '...mmmmmmmmmm...', '..mmMMmmmmMMmm..', '..mm.mmmmmm.mm..',
      '..ll.mmmmmm.ll..', '.....mm..mm.....', '.....kk..kk.....', '................',
    ],
  },
  cup: {
    pal: { g: '#e0ab24', d: '#a87a12', w: '#fff2b0', b: '#6b4426' },
    rows: [
      '................', '...gggggggggg...', '.ggwggggggggdgg.', '.g.wgggggggdg.g.', '.g..gggggggd..g.', '..g.gggggggd.g..',
      '...ggggggggdd...', '.....gggggd.....', '......ggdd......', '.......gd.......', '.......gd.......', '.....ggggdd.....',
      '....bbbbbbbb....', '....bbbbbbbb....', '................', '................',
    ],
  },
  medal: {
    pal: { r: '#c0392b', b: '#3f6fb8', g: '#e0ab24', d: '#a87a12', w: '#fff2b0' },
    rows: [
      '................', '...rrr....bbb...', '....rrr..bbb....', '.....rrrbbb.....', '......rrbb......', '.......gg.......',
      '.....gggggg.....', '....gwggggdg....', '....gwgggggg....', '....ggggggdg....', '....ggggggdd....', '.....ggggdd.....',
      '.......gd.......', '................', '................', '................',
    ],
  },
  book: {
    pal: { p: '#6b4fa0', d: '#4a3672', w: '#f3ead6', g: '#e0ab24' },
    rows: [
      '................', '................', '...pppppppppp...', '...pwwwwwwwwpd..', '...pwwwwwwwwpd..', '...pwwgggwwwpd..',
      '...pwwwwwwwwpd..', '...pwwwwwwwwpd..', '...pwwwwwwwwpd..', '...pwwwwwwwwpd..', '...pwwwwwwwwpd..', '...pppppppppppd.',
      '....dddddddddd..', '................', '................', '................',
    ],
  },
  star: {
    pal: { g: '#e0ab24', w: '#fff2b0', d: '#a87a12' },
    rows: [
      '................', '.......gg.......', '.......gg.......', '......gwgg......', '......gwgg......', '.ggggggwggggggg.',
      '..ggggwggggggd..', '...gggggggggd...', '....gggggggd....', '....ggggggdd....', '...gggd..dggg...', '...ggd....dgg...',
      '..gd........dg..', '................', '................', '................',
    ],
  },
  scar: {
    pal: { s: '#e8c9a0', d: '#b89a74', r: '#c0392b' },
    rows: [
      '................', '................', '.........ss.....', '........ssss....', '.......ssdsss...', '......sssdsss...',
      '.....ssrsdsss...', '....ssssrsss....', '...ssssssrs.....', '...sssdssss.....', '....sssdss......', '.....ssss.......',
      '......ss........', '................', '................', '................',
    ],
  },
  build: {
    pal: { w: '#8a5a2b', c: '#efe0bd', b: '#4a78c2' },
    rows: [
      '................', '.......ww.......', '..wwwwwwwwwwww..', '..w..........w..', '..w..........w..', '..wwwwwwwwwwww..',
      '..w..........w..', '..w.cccccccc.w..', '..w.cbbccbbc.w..', '..w.cccccccc.w..', '..w.cbbccbbc.w..', '..wwwwwwwwwwww..',
      '..w.cccccccc.w..', '..w.cccccccc.w..', '................', '................',
    ],
  },
  lock: {
    pal: { g: '#8f8f8f', d: '#5d5d5d', k: '#3a3a3a' },
    rows: [
      '................', '................', '.....gggggg.....', '....gg....gg....', '....g......g....', '....g......g....',
      '...dddddddddd...', '...dggggggggd...', '...dgggkkgggd...', '...dgggkkgggd...', '...dggggkgggd...', '...dggggggggd...',
      '...dddddddddd...', '................', '................', '................',
    ],
  },
};

export function drawSprite(canvas: HTMLCanvasElement, def: SpriteDef) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 16, 16);
  def.rows.forEach((row, y) =>
    [...row.padEnd(16, '.')].slice(0, 16).forEach((ch, x) => {
      const c = def.pal[ch];
      if (ch !== '.' && c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
    }),
  );
}
