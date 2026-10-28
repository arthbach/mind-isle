import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SESSIONS } from '../../playwright.config';

const settings = () => fs.readFileSync(path.resolve('.palace-e2e/vault/Mind Isle/Settings.md'), 'utf8');
const SHOTS = process.env.E2E_SHOTS;

test('character: attributes explain themselves, and the avatar comes from what you enter', async ({ page }) => {
  await page.goto(`${SESSIONS}/character`);
  await expect(page.locator('.bar', { hasText: 'Follow-through' })).toBeVisible();
  await page.locator('details.why').first().locator('summary').click();
  await expect(page.locator('details.why').first()).toContainText('last 30 days');

  await page.getByRole('button', { name: /4 quick questions/ }).click();
  for (const a of ['time alone', 'patterns and possibilities', 'logic, even if it stings', 'decided and done']) await page.getByRole('button', { name: a }).click();
  await expect(page.getByRole('combobox').first()).toHaveValue('INTJ');
  await page.getByRole('combobox').nth(1).selectOption('5');
  await page.getByRole('radio', { name: 'brown' }).click();
  await expect(page.locator('.avatar-preview')).toContainText('Scholar’s robe: Analyst (INTJ)');
  await expect(page.locator('.avatar-preview')).toContainText('An owl companion (introvert)');
  if (SHOTS) for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/char_${w}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Save avatar' }).click();
  await expect(page.getByText('Saved to Mind Isle/Settings.md.')).toBeVisible();
  expect(settings()).toMatch(/personality: \{ mbti: INTJ, enneagram: 5, big5: \[\] \}/);
  expect(settings()).toMatch(/avatar: \{ hair: brown, skin: 2, color: null \}/);

  await page.goto(`${SESSIONS}/hall`);
  await expect(page.locator('.hall-face canvas')).toHaveCount(2); // avatar + owl
});
