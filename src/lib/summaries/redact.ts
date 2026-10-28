// Redaction runs on transcript text before anything else sees it: the summariser, a log, a note.
// It errs on the side of removing too much. Each match becomes a visible marker, e.g. [redacted: api key],
// so a summary can still say that a key was set without ever containing it.

export interface RedactOptions {
  /** Keep email addresses and phone numbers (off by default). */
  keepContacts?: boolean;
  /** Extra regular expressions from the settings note. Invalid ones are skipped. */
  patterns?: string[];
}

export interface Redacted {
  text: string;
  /** How many of each kind were removed. */
  counts: Record<string, number>;
}

const mark = (kind: string) => `[redacted: ${kind}]`;

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

// Order matters: whole blocks and specific formats first, so the generic rules don't split them.
const RULES: { kind: string; re: RegExp; keep?: (m: string, ...g: string[]) => string }[] = [
  { kind: 'private key', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g },
  { kind: 'api key', re: /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g },
  { kind: 'api key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'api key', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { kind: 'api key', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: 'api key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'api key', re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: 'api key', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: 'token', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: 'token', re: /\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{16,}/gi, keep: (_m, scheme) => `${scheme} ${mark('token')}` },
  // scheme://user:password@host keeps the host, drops the credentials.
  { kind: 'password', re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, keep: (_m, scheme) => `${scheme}${mark('password')}@` },
  // .env style: NAME=value at the start of a line (optionally `export`, optionally quoted). The name stays.
  { kind: 'env value', re: /^([ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]*[ \t]*=[ \t]*)(?!\[redacted)(\S.*)$/gm, keep: (_m, name) => `${name}${mark('env value')}` },
  // key: value / "key": "value" where the key says it's secret.
  {
    kind: 'secret',
    re: /((?:["']?)[\w.-]*(?:secret|password|passwd|pwd|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)["']?[ \t]*[:=][ \t]*["']?)(?!\[redacted)([^\s"',;}]{6,})/gi,
    keep: (_m, key) => `${key}${mark('secret')}`,
  },
];

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Phone-shaped digit runs: optional +country, optional (area), then groups. At least 9 digits in total.
const PHONE = /(?<![\w.:/-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{3,4}[ .-]\d{3,4}(?:[ .-]\d{2,4})?(?![\w:/-]|\.\d)/g;
// Candidate random strings (no slashes: those are paths); the check below decides.
const TOKENISH = /(?<![A-Za-z0-9_\-+=])[A-Za-z0-9_\-+=]{24,}(?![A-Za-z0-9_\-+=])/g;

/**
 * A generated secret has one long random piece: letters and several digits, with high entropy.
 * Identifiers, dated names, encoded folder names and UUIDs split into short or word-like pieces instead.
 */
export function looksRandom(s: string): boolean {
  return s.split(/[-_.+=]+/).some((part) => {
    if (part.length < 16 || /^[a-f0-9]+$/i.test(part)) return false;
    const digits = part.replace(/\D/g, '').length;
    const letters = part.replace(/[^A-Za-z]/g, '').length;
    return digits >= 3 && letters >= 3 && entropy(part) >= 3.8;
  });
}

export function redact(text: string, opts: RedactOptions = {}): Redacted {
  const counts: Record<string, number> = {};
  const hit = (kind: string) => { counts[kind] = (counts[kind] ?? 0) + 1; };
  let out = text;
  for (const r of RULES) {
    out = out.replace(r.re, (m: string, ...g: string[]) => { hit(r.kind); return r.keep ? r.keep(m, ...g) : mark(r.kind); });
  }
  for (const p of opts.patterns ?? []) {
    let re: RegExp;
    try { re = new RegExp(p, 'gi'); } catch { continue; }
    out = out.replace(re, (m) => (m ? (hit('custom'), mark('custom')) : m));
  }
  out = out.replace(TOKENISH, (m) => (looksRandom(m) ? (hit('token'), mark('token')) : m));
  if (!opts.keepContacts) {
    out = out.replace(EMAIL, () => (hit('email'), mark('email')));
    out = out.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? (hit('phone'), mark('phone')) : m));
  }
  return { text: out, counts };
}
