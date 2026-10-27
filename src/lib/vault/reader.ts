import fs from 'node:fs/promises';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { splitFrontmatter } from './markdown';

export interface Note {
  /** Vault-relative path with forward slashes, e.g. "03 Projects/Foo/Foo.md". */
  rel: string;
  name: string;
  fm: Record<string, unknown>;
  body: string;
  raw: string;
  mtime: number;
}

function ensureVault() {
  if (config.isDemo && !existsSync(config.vaultPath)) {
    cpSync(config.demoSource, config.vaultPath, { recursive: true });
  }
  if (!existsSync(config.vaultPath)) {
    throw new Error(`Vault not found at ${config.vaultPath}. Check VAULT_PATH in .env.local.`);
  }
}

function excluded(name: string): boolean {
  if (name.startsWith('.')) return true;
  const n = name.toLowerCase();
  return config.exclude.some((e) => n === e || n.endsWith(` ${e}`));
}

async function walk(dir: string, out: string[]) {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (excluded(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(abs, out);
    else if (ent.isFile() && ent.name.endsWith('.md')) out.push(abs);
  }
}

export async function loadNotes(): Promise<Note[]> {
  ensureVault();
  const files: string[] = [];
  await walk(config.vaultPath, files);
  return Promise.all(
    files.map(async (abs) => {
      const [raw, st] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
      const { fm, body } = splitFrontmatter(raw);
      return {
        rel: path.relative(config.vaultPath, abs).split(path.sep).join('/'),
        name: path.basename(abs, '.md'),
        fm,
        body,
        raw,
        mtime: st.mtimeMs,
      };
    }),
  );
}
