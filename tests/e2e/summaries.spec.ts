import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { AGENTS, SESSIONS } from '../../playwright.config';
import { SECRET } from '../fixtures/agents';

// Runs after sessions.spec, on the same fake agent installs. The summariser is a fake (see playwright.config).
const vault = path.resolve('.palace-e2e/vault');
const note = path.join(vault, 'Mind Isle', 'Settings.md');
const cwd = path.join(AGENTS, 'home', 'code', 'lighthouse-app');
const line = (o: unknown) => `${JSON.stringify(o)}\n`;
const SHOTS = process.env.E2E_SHOTS;

test.describe.configure({ mode: 'serial' });

test('summaries stay off until turned on, then a finished session can be summarised with one click', async ({ page }) => {
  await page.goto(`${SESSIONS}/settings/agents`);
  const claude = page.locator('[data-source="claude-code"]');
  if (await claude.getByRole('button', { name: 'Allow' }).count()) await claude.getByRole('button', { name: 'Allow' }).click();
  await expect(claude).toContainText('on');

  await page.goto(`${SESSIONS}/settings/summaries`);
  await expect(page.getByText(/^Off\./)).toBeVisible();
  if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/sum_settings_off.png` }); }
  await page.getByRole('button', { name: 'Turn on summaries' }).click();
  await expect(page.getByText(/On since/)).toBeVisible();
  // As if summaries had been on since this morning (editing the note, as a user could in Obsidian).
  fs.writeFileSync(note, fs.readFileSync(note, 'utf8').replace(/since: "[^"]+"/, `since: "${new Date(Date.now() - 6 * 3_600_000).toISOString()}"`));

  // A Claude Code session that ended five hours ago, with secrets in it.
  const t = Date.now() - 5 * 3_600_000;
  const dir = path.join(AGENTS, 'home', '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.writeFileSync(path.join(dir, 'e2e-done.jsonl'),
    line({ type: 'user', sessionId: 'e2e-done', cwd, timestamp: new Date(t - 5 * 60_000).toISOString(), message: { role: 'user', content: `Fix onboarding, key ${SECRET}` } })
    + line({ type: 'ai-title', sessionId: 'e2e-done', aiTitle: 'E2E onboarding fix' })
    + line({ type: 'assistant', sessionId: 'e2e-done', cwd, timestamp: new Date(t).toISOString(), message: { content: [{ type: 'text', text: 'Done.' }] } }));

  await page.goto(`${SESSIONS}/sessions`);
  const row = page.locator('.hist li', { hasText: 'E2E onboarding fix' });
  await expect(row.getByRole('button', { name: 'Summarise' })).toBeVisible();
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    if (!SHOTS) break;
    await page.setViewportSize({ width: w, height: h });
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/sum_history_${w}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await row.getByRole('button', { name: 'Summarise' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.locator('.hist li', { hasText: 'E2E onboarding fix' }).getByRole('link', { name: /Open note/ })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  const files = fs.readdirSync(path.join(vault, 'Sessions'));
  expect(files).toHaveLength(1);
  const written = fs.readFileSync(path.join(vault, 'Sessions', files[0]), 'utf8');
  expect(written).toContain('session_id: "e2e-done"');
  expect(written).toContain('- [ ] Ask Maya Chen to test on Android');
  expect(written).not.toContain(SECRET);
  if (SHOTS) {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${SESSIONS}/settings/summaries`);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/sum_settings_on_${w}.png` });
    }
  }
});

test('at Dusk, waiting sessions come as one batch, with a scroll on the project’s building', async ({ page }) => {
  const dir = path.join(AGENTS, 'home', '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  // Summaries on for a month, and one session that ended 27 days ago: its transcript is about to expire.
  fs.writeFileSync(note, fs.readFileSync(note, 'utf8').replace(/since: "[^"]+"/, `since: "${new Date(Date.now() - 30 * 86_400_000).toISOString()}"`));
  for (const [id, title, hours] of [['e2e-w1', 'Pricing page copy', 4], ['e2e-w2', 'Android crash on login', 4], ['e2e-old', 'Old onboarding spike', 27 * 24]] as const) {
    const t = Date.now() - hours * 3_600_000;
    fs.writeFileSync(path.join(dir, `${id}.jsonl`),
      line({ type: 'user', sessionId: id, cwd, timestamp: new Date(t - 6 * 60_000).toISOString(), message: { role: 'user', content: 'Work on it' } })
      + line({ type: 'ai-title', sessionId: id, aiTitle: title })
      + line({ type: 'assistant', sessionId: id, cwd, timestamp: new Date(t).toISOString(), message: { content: [{ type: 'text', text: 'Done.' }] } }));
  }
  await page.goto(`${SESSIONS}/sessions`); // records the new sessions

  await page.goto(SESSIONS);
  await expect(page.locator('.scroll-pin')).toHaveCount(1);
  await expect(page.locator('.scroll-pin')).toContainText('3');
  if (SHOTS) { await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/sum_island.png` }); }

  await page.goto(`${SESSIONS}/today`); // 19:00 on this server: Dusk
  await page.getByRole('button', { name: /Dawn · plan/ }).click();
  await expect(page.locator('.retention')).toContainText('1 waiting session will lose its transcript in about 3 days');
  if (SHOTS) { await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/sum_dawn_warning.png` }); }
  await page.locator('.retention').getByRole('button', { name: 'Review at Dusk' }).click();
  const batch = page.locator('.scrolls');
  await expect(batch).toContainText('3 sessions to remember');
  await batch.getByRole('button', { name: 'Review one by one' }).click();
  await expect(batch.getByText('Android crash on login')).toBeVisible();
  await expect(batch.getByRole('button', { name: 'Always save for Lighthouse App' })).toHaveCount(3);
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    if (!SHOTS) break;
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/sum_dusk_${w}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await batch.getByRole('button', { name: 'Save all' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.locator('.scrolls')).toHaveCount(0, { timeout: 1000 });
    expect(fs.readdirSync(path.join(vault, 'Sessions'))).toHaveLength(4);
  }).toPass({ timeout: 15_000 });
  await page.goto(SESSIONS);
  await expect(page.locator('.scroll-pin')).toHaveCount(0);
});
