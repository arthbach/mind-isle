import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import type { Decision } from './mapping';
import type { SourceId } from './types';

/**
 * Session settings that have no home in the vault yet: which sources the user allowed,
 * and per-folder mapping decisions. (Confirmed mappings are also written to the project note's `repos:`.)
 * Phase C moves the consents into the vault's settings note.
 */
export interface SessionStore {
  sources: Partial<Record<SourceId, boolean>>;
  decisions: Record<string, Decision>;
}

const FILE = () => path.join(config.dataDir, 'sessions', 'state.json');
export const eventsDir = () => path.join(config.dataDir, 'events');

export async function readSessionStore(): Promise<SessionStore> {
  try {
    const d = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    return { sources: d.sources ?? {}, decisions: d.decisions ?? {} };
  } catch {
    return { sources: {}, decisions: {} };
  }
}

export async function updateSessionStore(fn: (s: SessionStore) => void): Promise<SessionStore> {
  const s = await readSessionStore();
  fn(s);
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  const tmp = `${FILE()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, FILE());
  return s;
}
