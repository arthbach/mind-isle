import { describe, expect, it } from 'vitest';
import { entropy, looksRandom, redact } from '@/lib/summaries/redact';

// Fake secrets, built at runtime so no scanner mistakes this file for a leak.
const fake = {
  openai: `sk-proj-${'A1b2C3d4E5f6G7h8'.repeat(3)}`,
  anthropic: `sk-ant-api03-${'Zx9Yw8Vu7Ts6Rq5P'.repeat(4)}`,
  aws: `AKIA${'IOSFODNN7EXAMPLE'}`,
  github: `ghp_${'a1B2c3D4e5F6g7H8i9J0'.repeat(2)}`,
  stripe: `sk_live_${'4eC39HqLyjWDarjtT1zdp7dc'}`,
  jwt: `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.${'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'}`,
  random: 'Qm9vT2s4bkx2Wk1xR3pYcDdhVWU5',
};

const clean = (t: string, o = {}) => redact(t, o).text;

describe('redaction', () => {
  it('removes every known key format and keeps the words around it', () => {
    for (const [name, key] of Object.entries(fake)) {
      const out = clean(`use ${key} here`);
      expect(out, name).not.toContain(key);
      expect(out, name).toMatch(/^use \[redacted: [a-z ]+\] here$/);
    }
  });

  it('removes .env values but keeps the names', () => {
    const env = 'DATABASE_URL=postgres://app:hunter2@db.local/app\nexport STRIPE_KEY="abc123def456"\nNODE_ENV=production';
    const out = clean(env);
    expect(out).toBe('DATABASE_URL=[redacted: env value]\nexport STRIPE_KEY=[redacted: env value]\nNODE_ENV=[redacted: env value]');
  });

  it('removes passwords from URLs and secret-looking settings, keeping the host and key', () => {
    expect(clean('connect to https://admin:s3cr3tpass@example.com/db')).toBe('connect to https://[redacted: password]@example.com/db');
    expect(clean('{"api_key": "abcdef123456", "name": "demo"}')).toBe('{"api_key": "[redacted: secret]", "name": "demo"}');
    expect(clean('Authorization: Bearer abcdefghijklmnop1234')).toBe('Authorization: Bearer [redacted: token]');
  });

  it('removes private key blocks whole', () => {
    const block = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\nAAAAB3NzaC1yc2E\n-----END OPENSSH PRIVATE KEY-----';
    expect(clean(`key:\n${block}\ndone`)).toBe('key:\n[redacted: private key]\ndone');
  });

  it('removes emails and phone numbers unless the user keeps them', () => {
    const t = 'Mail maya.chen@example.com or call +62 812-3456-7890 or (555) 123-4567.';
    expect(clean(t)).toBe('Mail [redacted: email] or call [redacted: phone] or [redacted: phone].');
    expect(clean(t, { keepContacts: true })).toBe(t);
  });

  it('applies the user’s own patterns and skips invalid ones', () => {
    expect(clean('Project Bluebird ships Friday', { patterns: ['Bluebird', '(unclosed'] })).toBe('Project [redacted: custom] ships Friday');
  });

  it('leaves ordinary code, paths, hashes, dates and versions alone', () => {
    const t = [
      'Edited src/components/DayCheckin.tsx and src/lib/sessions/records.ts',
      'commit 5719f4c2a8b9e0d1c3f4a5b6c7d8e9f0a1b2c3d4 on 2026-10-27 at 14:26',
      'const sessionHistoryDays = 7; npm install next@16.4.3',
      'session id 0e1fc446-835e-4278-95be-6211f56b950f, port 3000, 1234 tests',
    ].join('\n');
    expect(clean(t)).toBe(t);
  });

  it('counts what it removed', () => {
    expect(redact(`${fake.aws} and ${fake.github}\nTOKEN=x`).counts).toEqual({ 'api key': 2, 'env value': 1 });
  });

  it('is safe to run twice', () => {
    const once = clean(`A=${fake.openai} ${fake.jwt}`);
    expect(clean(once)).toBe(once);
  });

  it('measures randomness', () => {
    expect(entropy('aaaa')).toBe(0);
    expect(entropy(fake.random)).toBeGreaterThan(4.2);
  });
});

describe('random-string detection', () => {
  it('flags generated keys but not identifiers, dated names, folder names or ids', () => {
    expect(looksRandom('Qm9vT2s4bkx2Wk1xR3pYcDdhVWU5')).toBe(true);
    expect(looksRandom('live_9f8Gh2Kq7Lm3Np5Rs1Tv4Wx6')).toBe(true);
    for (const s of [
      'mcp__claude_ai_Google_Drive__search_files', 'PROMPT_CHECK_IMPORT_2026-10-25',
      '-Users-someone-Desktop-Client-Project-code', '0e1fc446-835e-4278-95be-6211f56b950f',
      'useLayoutEffectForPositioning', 'feature-branch-name-for-the-thing',
    ]) expect(looksRandom(s), s).toBe(false);
  });
});
