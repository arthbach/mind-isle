import path from 'node:path';

const env = process.env;
const list = (v: string | undefined, fallback: string) =>
  (v ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);

const dataDir = path.resolve(/*turbopackIgnore: true*/ env.PALACE_DATA_DIR || '.palace');
const isDemo = !env.VAULT_PATH;
// Without a vault, run on a private copy of the demo vault so trying the app never edits the repo.
const vaultPath = isDemo ? path.join(/*turbopackIgnore: true*/ dataDir, 'demo-vault') : path.resolve(/*turbopackIgnore: true*/ env.VAULT_PATH as string);

const hhmm = (v: string | undefined, fallback: string) => (v && /^\d{2}:\d{2}$/.test(v) ? v : fallback);

export const config = {
  isDemo,
  vaultPath,
  demoSource: path.resolve(/*turbopackIgnore: true*/ 'demo-vault'),
  vaultName: env.PALACE_VAULT_NAME || path.basename(vaultPath),
  owner: env.PALACE_OWNER_NAME || 'Traveler',
  title: env.PALACE_TITLE || 'Mind Isle',
  dailyDir: env.PALACE_DAILY_DIR || '01 Daily',
  exclude: list(env.PALACE_EXCLUDE, '.obsidian,.trash,.git,node_modules,Templates,Archive,_attachments').map((s) => s.toLowerCase()),
  privateTags: list(env.PALACE_PRIVATE_TAGS, 'private,career,personal').map((s) => s.toLowerCase().replace(/^#/, '')),
  timeZone: env.PALACE_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
  dataDir,
  readOnly: env.PALACE_READ_ONLY === 'true',
  checkinGate: env.PALACE_CHECKIN_GATE === 'off' ? ('off' as const) : ('soft' as const),
  duskFrom: hhmm(env.PALACE_DUSK_FROM, '17:00'),
  climate: {
    kind: env.PALACE_CLIMATE,
    wetMonths: env.PALACE_WET_MONTHS ? env.PALACE_WET_MONTHS.split(',').map(Number).filter((m) => m >= 1 && m <= 12) : undefined,
  },
};
