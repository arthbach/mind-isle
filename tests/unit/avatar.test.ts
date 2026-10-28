import { describe, expect, it } from 'vitest';
import { avatarFor, DEFAULT_LOOK, MBTI, NO_PERSONALITY, parseLook, parsePersonality, temperament } from '@/lib/avatar';

describe('personality avatar', () => {
  it('maps MBTI temperaments to outfits', () => {
    expect(['INTJ', 'ENFP', 'ISTJ', 'ESTP'].map((m) => avatarFor({ ...NO_PERSONALITY, mbti: m }, DEFAULT_LOOK).outfit))
      .toEqual(['scholar', 'bard', 'knight', 'ranger']);
    expect(MBTI.every((m) => temperament(m))).toBe(true);
  });

  it('gives extraverts a banner and introverts a companion', () => {
    const e = avatarFor({ ...NO_PERSONALITY, mbti: 'ENTJ' }, DEFAULT_LOOK);
    const i = avatarFor({ ...NO_PERSONALITY, mbti: 'INTJ' }, DEFAULT_LOOK);
    expect(e.companion).toBeNull();
    expect(e.body.rows.every((r) => r[15] === 'p' || r[15] === '.')).toBe(true);
    expect(e.body.rows.filter((r) => r[15] === 'p').length).toBeGreaterThan(10);
    expect(i.companion).not.toBeNull();
    expect(i.layers).toContain('An owl companion (introvert)');
  });

  it('uses Big Five when there is no MBTI: outfit from the top trait, accent from the second', () => {
    const a = avatarFor({ mbti: null, enneagram: null, big5: ['C', 'O'] }, DEFAULT_LOOK);
    expect(a.outfit).toBe('knight');
    expect(a.layers).toEqual(['Outfit from your strongest trait, Conscientiousness', 'Accent from your second trait, Openness']);
  });

  it('starts as a plain traveller, and honours the user’s own colours', () => {
    const a = avatarFor(NO_PERSONALITY, { hair: 'scarf', skin: 5, color: 'sky' });
    expect(a.outfit).toBe('traveler');
    expect(a.body.pal.o).toBe('#3f6fb8');
    expect(a.body.pal.h).toBe('#3f6fb8'); // the scarf takes the outfit colour
    expect(a.body.pal.s).toBe('#7a4a2c');
  });

  it('reads only valid values from the settings note', () => {
    expect(parsePersonality({ mbti: 'intj', enneagram: 12, big5: ['c', 'x', 'o', 'a'] })).toEqual({ mbti: 'INTJ', enneagram: null, big5: ['C', 'O'] });
    expect(parsePersonality({ mbti: 'ABCD' }).mbti).toBeNull();
    expect(parseLook({ hair: 'purple', skin: 9, color: 'moss' })).toEqual({ hair: 'black', skin: 2, color: 'moss' });
  });
});
