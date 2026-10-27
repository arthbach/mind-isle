import fs from 'node:fs';
import path from 'node:path';

export const vault = () => process.env.VAULT_PATH as string;
export const read = (rel: string) => fs.readFileSync(path.join(vault(), rel), 'utf8');
export const write = (rel: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(vault(), rel)), { recursive: true });
  fs.writeFileSync(path.join(vault(), rel), content);
};
export const exists = (rel: string) => fs.existsSync(path.join(vault(), rel));
export const DAILY = '01 Daily/2026-10-26.md';
