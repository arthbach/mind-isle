import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

/**
 * The app's own state — only what has no natural home in the vault.
 * Everything else (check-ins, contacts, beliefs) is written to the vault itself.
 *
 * This is a JSON file so the app has zero infrastructure. To use a database,
 * reimplement readStore/updateStore with the same shape.
 */
export interface StoreData {
  /** Verdicts on decisions that came from meeting/daily notes (decision notes store theirs in frontmatter). */
  verdicts: Record<string, string>;
}

const FILE = path.join(config.dataDir, 'state.json');
const EMPTY: StoreData = { verdicts: {} };

export async function readStore(): Promise<StoreData> {
  try {
    return { ...EMPTY, ...JSON.parse(await fs.readFile(FILE, 'utf8')) };
  } catch {
    return { ...EMPTY };
  }
}

export async function updateStore(fn: (s: StoreData) => void): Promise<void> {
  const data = await readStore();
  fn(data);
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, FILE);
}
