// Background music and UI sounds, synthesized with Web Audio. The songs are original loops written as note
// lists below, so the repo ships no audio files and nothing is fetched.

type Song = { bpm: number; chords: number[][]; lead: (number | null)[]; leadWave: OscillatorType; arpWave: OscillatorType };

const _ = null;
// MIDI note numbers. Eight eighth-notes per bar; four chords repeat under an eight-bar melody.
export const SONGS: Record<'day' | 'night', Song & { title: string }> = {
  day: {
    title: 'Harbor Morning',
    bpm: 104,
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    lead: [
      72, _, 76, _, 79, 77, 76, _, 76, _, 72, _, 69, _, 72, 74, 77, _, 76, 74, 72, _, 69, _, 71, _, 74, _, 79, _, _, _,
      79, _, 76, 77, 79, _, 84, _, 81, _, 79, 76, 72, _, 76, _, 77, 76, 74, 72, 74, _, 77, _, 74, _, 71, _, 67, _, _, _,
    ],
    leadWave: 'square',
    arpWave: 'square',
  },
  night: {
    title: 'Lantern Night',
    bpm: 76,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    lead: [
      69, _, _, 72, 76, _, _, _, 77, _, 76, _, 72, _, _, _, 72, _, _, 76, 79, _, 76, _, 74, _, _, _, 71, _, _, _,
      76, _, _, 77, 76, _, 72, _, 72, _, 69, _, 65, _, _, _, 67, _, 72, _, 76, _, 79, _, 74, _, _, _, _, _, _, _,
    ],
    leadWave: 'triangle',
    arpWave: 'triangle',
  },
};

let ctx: AudioContext | null = null;
let music: GainNode | null = null;
let sfx: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let playing: keyof typeof SONGS | null = null;
let step = 0;
let next = 0;
let fade = 0; // bumped on every play/stop, so a stale fade-out timer does nothing

const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  // A gentle low-pass keeps square waves from sounding harsh.
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 2800;
  soft.connect(ctx.destination);
  music = ctx.createGain();
  music.gain.value = 0;
  music.connect(soft);
  sfx = ctx.createGain();
  sfx.gain.value = 0.18;
  sfx.connect(soft);
  return ctx;
}

function tone(freq: number, at: number, dur: number, wave: OscillatorType, level: number, out: AudioNode) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.03);
}

// Schedules a little ahead of the clock, so timing stays steady even when the page is busy.
function schedule() {
  const c = ctx, song = playing ? SONGS[playing] : null;
  if (!c || !song || !music) return;
  const eighth = 60 / song.bpm / 2;
  while (next < c.currentTime + 0.25) {
    const bar = Math.floor(step / 8), i = step % 8;
    const chord = song.chords[bar % song.chords.length];
    if (i === 0 || i === 3 || i === 4 || i === 6) tone(hz(chord[0] - 24), next, eighth * 1.7, 'triangle', 0.55, music);
    tone(hz(chord[i % 3] + (i >= 4 ? 12 : 0)), next, eighth * 0.7, song.arpWave, 0.07, music);
    const lead = song.lead[step % song.lead.length];
    if (lead) tone(hz(lead), next, eighth * 1.9, song.leadWave, 0.16, music);
    next += eighth;
    step++;
  }
}

/** Must first be called from a click or key press: browsers only allow sound after one. */
export function playMusic(track: keyof typeof SONGS, volume: number) {
  const c = audio();
  if (!c || !music) return;
  if (c.state === 'suspended') void c.resume();
  fade++;
  music.gain.cancelScheduledValues(c.currentTime);
  music.gain.setTargetAtTime(volume * 0.28, c.currentTime, 0.4);
  if (playing === track && timer) return;
  playing = track;
  step = 0;
  next = c.currentTime + 0.1;
  clearInterval(timer);
  timer = setInterval(schedule, 50);
  schedule();
}

export function setMusicVolume(volume: number) {
  if (ctx && music && playing) music.gain.setTargetAtTime(volume * 0.28, ctx.currentTime, 0.1);
}

export function stopMusic() {
  if (!ctx || !music || !playing) return;
  music.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  const token = ++fade;
  setTimeout(() => { if (token === fade) { clearInterval(timer); timer = undefined; playing = null; } }, 1200);
}

/** Pause everything while the tab is hidden. */
export function suspendAudio(hidden: boolean) {
  if (!ctx) return;
  if (hidden) void ctx.suspend();
  else void ctx.resume();
}

export const audioReady = () => !!ctx && ctx.state === 'running';

const BLIPS = { nav: [72, 79], open: [67, 72, 76], close: [76, 67], select: [84] } as const;

/** A short UI sound. */
export function blip(kind: keyof typeof BLIPS) {
  const c = audio();
  if (!c || !sfx) return;
  if (c.state === 'suspended') void c.resume();
  BLIPS[kind].forEach((n, i) => tone(hz(n), c.currentTime + i * 0.045, 0.09, 'square', 0.5, sfx!));
}
