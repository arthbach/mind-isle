import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { EVENING, MORNING } from '../../playwright.config';

const vault = path.resolve('.palace-e2e/vault');
const read = (rel: string) => fs.readFileSync(path.join(vault, rel), 'utf8');
const DAILY = '01 Daily/2026-10-26.md';

// One day, in order: morning skip → plan from /today → evening Dusk gate → close → no gate.
test.describe.configure({ mode: 'serial' });

test('the island opens with Dawn, and skipping it sticks for the day', async ({ page }) => {
  await page.goto(`${MORNING}/codex`);
  const gate = page.getByRole('dialog', { name: 'Dawn check-in' });
  await expect(gate).toBeVisible();
  await expect(gate.getByText('Today I will…')).toBeVisible();

  await gate.getByRole('button', { name: /Skip today’s Dawn/ }).click();
  await expect(gate).toBeHidden();
  await expect(page.getByRole('heading', { name: 'The Codex' })).toBeVisible();
  expect(read(DAILY)).toMatch(/skipped: \[dawn\]/);

  // A different browser (another device) sees the same thing: the skip lives in the vault.
  const other = await page.context().browser()!.newPage();
  await other.goto(MORNING);
  await expect(other.getByRole('dialog')).toHaveCount(0);
  await other.close();
});

test('/today shows the same check-in inline, and Dawn writes the plan into the daily note', async ({ page }) => {
  await page.goto(`${MORNING}/today`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.checkin')).toHaveCount(1);
  const add = page.getByLabel('Add a plan item');
  await add.fill('Ship the new onboarding flow');
  await add.press('Enter');
  await add.fill('Coffee with Maya');
  await add.press('Enter');
  await expect(page.locator('.intent', { hasText: 'Coffee with Maya' }).getByText('Maya Chen')).toBeVisible();
  await page.getByRole('button', { name: 'Energy 4 of 5' }).click();
  await page.getByRole('button', { name: 'Lock in today’s plan' }).click();
  await expect(page.getByText(/Locked in\./)).toBeVisible();
  const raw = read(DAILY);
  expect(raw).toContain('- [ ] Ship the new onboarding flow\n- [ ] Coffee with Maya');
  expect(raw).toMatch(/plan_locked: true/);
  expect(raw).toMatch(/energy: 4/);
});

test('in the evening every page opens Dusk, and closing the day removes it', async ({ page }) => {
  await page.goto(`${EVENING}/banners`);
  const gate = page.getByRole('dialog', { name: 'Dusk check-in' });
  await expect(gate).toBeVisible();

  const first = gate.locator('.intent.col', { hasText: 'Ship the new onboarding flow' });
  await first.getByRole('button', { name: '✓ Done' }).click();
  await gate.locator('.intent.col', { hasText: 'Coffee with Maya' }).getByRole('button', { name: '→ Tomorrow' }).click();
  await gate.getByLabel('Who did you talk to?').fill('Maya');
  await gate.getByLabel('Who did you talk to?').press('Enter');
  await gate.getByLabel('Decision').fill('Weekly demos stay on Fridays');
  await gate.getByRole('button', { name: 'Close the day' }).click();

  await expect(gate).toBeHidden();
  await expect(page.getByRole('heading', { name: /Banner Wall/ })).toBeVisible();
  const raw = read(DAILY);
  expect(raw).toContain('- [x] Ship the new onboarding flow ✅ 2026-10-26');
  expect(raw).toContain('- [>] Coffee with Maya');
  expect(raw).toContain('## People\n- [[Maya Chen]]');
  expect(read('04 People/Maya Chen.md')).toContain('last_contact: 2026-10-26');

  await page.goto(EVENING);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the season is picked on its own settings page, and the island behind it follows', async ({ page }) => {
  await page.goto(`${EVENING}/settings/world`);
  const canvas = page.locator('canvas[data-season]');
  await expect(canvas).toHaveAttribute('data-season', 'autumn'); // Auto, UTC in October
  const pick = async (name: string) => {
    await page.getByRole('button', { name: /^Season:/ }).click();
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
  };
  for (const [name, season] of [['Winter', 'winter'], ['Wet season', 'wet'], ['Dry season', 'dry'], ['Spring', 'spring']]) {
    await pick(name);
    await expect(canvas).toHaveAttribute('data-season', season);
  }
  await page.reload();
  await expect(page.locator('canvas[data-season]')).toHaveAttribute('data-season', 'spring');
  await expect(page.getByRole('button', { name: 'Season: Spring' })).toBeVisible();

  // Keyboard: open with ArrowDown, move to the top (Auto), choose with Enter, Escape closes without choosing.
  await page.getByRole('button', { name: /^Season:/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas[data-season]')).toHaveAttribute('data-season', 'autumn');
});
