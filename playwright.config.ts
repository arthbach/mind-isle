import path from 'node:path';
import { defineConfig } from '@playwright/test';

// Servers are polled at /login, which never reads the vault: Playwright starts them before
// globalSetup copies the demo vault in.
// Two servers over the same throwaway vault, pinned to the morning and the evening of one day.
// Explicit env always wins over .env.local, so these runs can never reach a real vault.
const env = (now: string) => ({
  VAULT_PATH: path.resolve('.palace-e2e/vault'),
  PALACE_DATA_DIR: path.resolve('.palace-e2e/data'),
  PALACE_NOW: now,
  PALACE_TIMEZONE: 'UTC',
  PALACE_DUSK_FROM: '17:00',
  PALACE_CHECKIN_GATE: 'soft',
  PALACE_PASSCODE: '',
  PALACE_READ_ONLY: 'false',
  PALACE_OWNER_NAME: 'Tester',
  // Even the check-in servers never look at real agent folders.
  ...agentEnv,
});

export const MORNING = 'http://localhost:3301';
export const EVENING = 'http://localhost:3302';
export const SESSIONS = 'http://localhost:3303';
/** Fake agent installs for the sessions server (created by the sessions spec). */
export const AGENTS = path.resolve('.palace-e2e/agents');
const agentEnv = {
  PALACE_HOME_DIR: path.join(AGENTS, 'home'),
  PALACE_CLAUDE_DIR: path.join(AGENTS, 'home', '.claude'),
  PALACE_CODEX_DIR: path.join(AGENTS, 'home', '.codex'),
  PALACE_ORCA_DIR: path.join(AGENTS, 'orca'),
};

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: MORNING,
    // Locally reuse the installed Chrome; CI installs Playwright's Chromium.
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'npx next start -p 3301', url: `${MORNING}/login`, env: env('2026-10-26T08:00:00Z'), reuseExistingServer: false, timeout: 60_000 },
    { command: 'npx next start -p 3302', url: `${EVENING}/login`, env: env('2026-10-26T19:00:00Z'), reuseExistingServer: false, timeout: 60_000 },
    {
      command: 'npx next start -p 3303', url: `${SESSIONS}/login`, reuseExistingServer: false, timeout: 60_000,
      env: {
        ...env('2026-10-26T19:00:00Z'), PALACE_CHECKIN_GATE: 'off', PALACE_DATA_DIR: path.resolve('.palace-e2e/data-sessions'),
        // Never a real agent CLI in tests: summaries go to a fake that answers instantly.
        PALACE_SUMMARISER_CMD: JSON.stringify([process.execPath, path.resolve('tests/fixtures/fake-summariser.mjs')]),
      },
    },
  ],
});
