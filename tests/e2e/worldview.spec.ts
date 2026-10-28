import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SESSIONS } from '../../playwright.config';

// On the sessions server (writable; the summariser is a fake, see playwright.config).
const vault = path.resolve('.palace-e2e/vault');
const write = (rel: string, body: string) => { fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true }); fs.writeFileSync(path.join(vault, rel), body); };
const SHOTS = process.env.E2E_SHOTS;
const shoot = async (page: import('@playwright/test').Page, name: string) => {
  if (!SHOTS) return;
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator(name === 'interview' ? '.interview' : '.wv').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/wv_${name}_${w}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
};

test.describe.configure({ mode: 'serial' });

test('worldview: opt in to one folder, scan, reveal, reject, and the Hall never shows it', async ({ page }) => {
  write('Journal/Reflections.md', '---\ntype: journal\n---\n- I believe honesty matters more than comfort.\n- I value quiet mornings with my family.\nMaya said she believes in luck.\n');
  write('Private/Canary.md', '---\ntype: journal\n---\nI believe CANARY-E2E is the answer.\n');

  await page.goto(`${SESSIONS}/banners`);
  const wing = page.locator('.wv');
  await expect(wing.getByText('What may Mind Isle read')).toBeVisible();
  await wing.scrollIntoViewIfNeeded();
  await shoot(page, 'consent');
  await wing.getByText('Only these folders').click();
  await wing.getByLabel('Journal', { exact: true }).check();
  await wing.getByRole('button', { name: 'Save my choice' }).click();
  await expect(wing.getByText(/may read only: Journal/)).toBeVisible();

  await wing.getByRole('button', { name: 'Scan now' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.locator('.wv-banner')).toHaveCount(2, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const scan = JSON.parse(fs.readFileSync(path.resolve('.palace-e2e/data-sessions/worldview/scan.json'), 'utf8'));
  expect(scan.notesRead.every((r: string) => r.startsWith('Journal/'))).toBe(true);

  // Blurred until revealed.
  await expect(page.locator('.wv-veil')).toHaveCount(1);
  await page.locator('.wv').scrollIntoViewIfNeeded();
  await shoot(page, 'veiled');
  await page.locator('.wv').getByRole('button', { name: 'Reveal' }).click();
  await expect(page.locator('.wv-veil')).toHaveCount(0);
  await expect(page.locator('.wv-banner', { hasText: 'luck' })).toHaveCount(0); // Maya's view, not the owner's
  await shoot(page, 'revealed');

  await page.locator('.wv-banner', { hasText: 'quiet mornings' }).getByRole('button', { name: '✗ Not me' }).click();
  await expect(page.locator('.wv-banner')).toHaveCount(1);
  expect(fs.existsSync(path.join(vault, 'Mind Isle/Worldview/I value quiet mornings with my family.md'))).toBe(false);

  await page.goto(`${SESSIONS}/hall`);
  await expect(page.getByText('honesty')).toHaveCount(0);
});

test('worldview: the interview asks at Dusk, and Forget removes what Mind Isle proposed', async ({ page }) => {
  await page.goto(`${SESSIONS}/today`); // 19:00 on this server: Dusk
  await expect(page.getByText('Atlas asks')).toBeVisible(); // "Also ask me" was on by default
  const box = page.locator('.interview');
  await box.scrollIntoViewIfNeeded();
  await shoot(page, 'interview');
  await box.getByRole('textbox').fill('Keeping my word to clients, even when it costs me. The rest is negotiable.');
  await box.getByRole('button', { name: 'Save answer' }).click();
  await expect(page.getByText('Atlas asks')).toHaveCount(0);

  await page.goto(`${SESSIONS}/banners`);
  await page.locator('.wv').getByRole('button', { name: 'Reveal' }).click();
  await expect(page.locator('.wv-banner', { hasText: 'Keeping my word to clients' })).toContainText('From your answer at Dusk');

  await page.locator('.wv').getByRole('button', { name: 'Forget…' }).click();
  await shoot(page, 'forget');
  await page.locator('.wv').getByRole('button', { name: 'Forget proposals' }).click();
  await expect(page.getByText('You used Forget.')).toBeVisible();
  await expect(page.locator('.wv-banner')).toHaveCount(0);
  expect(fs.readFileSync(path.join(vault, 'Mind Isle/Settings.md'), 'utf8')).toMatch(/worldview: \{ scan: revoked/);
});
