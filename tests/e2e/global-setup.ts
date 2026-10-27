import { cpSync, rmSync } from 'node:fs';

// Fresh test vault and app state for every run, so `npx playwright test` is as safe as `npm run test:e2e`.
export default function globalSetup() {
  for (const dir of ['.palace-e2e/vault', '.palace-e2e/data', '.palace-e2e/data-sessions', '.palace-e2e/agents']) {
    rmSync(dir, { recursive: true, force: true });
  }
  cpSync('demo-vault', '.palace-e2e/vault', { recursive: true });
}
