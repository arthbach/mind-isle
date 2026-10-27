// Runs before every test file, before any app module is imported (config reads env at import time).
import { cpSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(os.tmpdir(), 'mind-palace-test-'));
cpSync(path.resolve('demo-vault'), path.join(dir, 'vault'), { recursive: true });

process.env.VAULT_PATH = path.join(dir, 'vault');
process.env.PALACE_DATA_DIR = path.join(dir, 'data');
process.env.PALACE_TIMEZONE = 'UTC';
process.env.PALACE_NOW = '2026-10-26T08:00:00Z';
process.env.PALACE_READ_ONLY = 'false';
process.env.PALACE_DUSK_FROM = '17:00';
process.env.PALACE_CHECKIN_GATE = 'soft';
delete process.env.PALACE_CLIMATE;
delete process.env.PALACE_WET_MONTHS;
