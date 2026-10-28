import { expect, test } from '@playwright/test';
import { SESSIONS } from '../../playwright.config';

test('the island fills the screen, zooms and pans, and a drag is not a click', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(SESSIONS);
  const frame = page.locator('.map-frame');
  const world = page.locator('.map-world');
  // Full screen, opening on the whole island.
  await expect(frame).toHaveAttribute('data-zoom', '1.00');
  const box = (await frame.boundingBox())!;
  expect(box).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(frame).toHaveAttribute('data-zoom', '1.40');
  const before = (await world.boundingBox())!;
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(600, 390, { steps: 6 });
  await page.mouse.up();
  const after = (await world.boundingBox())!;
  expect(before.x - after.x).toBeGreaterThan(50); // it stops where the island edge meets the HUD
  // Panning over a building doesn't select it.
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCount(0);

  await page.mouse.wheel(0, 400);
  await expect(frame).toHaveAttribute('data-zoom', '1.00'); // can't zoom out past the whole island
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Fit the whole island' }).click();
  await expect(frame).toHaveAttribute('data-zoom', '1.00');
});

test('all navigation is in the hotbar: number keys open windows over the island, Esc closes them', async ({ page }) => {
  await page.goto(SESSIONS);
  const hotbar = page.getByRole('navigation', { name: 'Sections' });
  await expect(hotbar.getByRole('link')).toHaveCount(9);
  await expect(hotbar.getByRole('link', { name: /Island/ })).toHaveAttribute('aria-current', 'page');

  await page.keyboard.press('4');
  await expect(page).toHaveURL(/\/codex$/);
  await expect(page.getByRole('heading', { name: 'The Codex' })).toBeVisible();
  await expect(page.locator('canvas[data-season]')).toBeVisible(); // the island stays behind the window
  await expect(hotbar.getByRole('link', { name: /Codex/ })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`${SESSIONS}/?$`));

  await hotbar.getByRole('link', { name: /Settings/ }).click();
  for (const name of ['World', 'Sound', 'Display', 'Agents']) await expect(page.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  await page.getByRole('link', { name: /^Display/ }).click();
  await expect(page).toHaveURL(/\/settings\/display$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/settings$/); // a settings page goes back to the settings menu
});

test('music and sound effects have their own settings page, and the HUD button follows it', async ({ page }) => {
  await page.goto(`${SESSIONS}/settings/sound`);
  const music = page.getByRole('switch', { name: 'Music' });
  await expect(music).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Music on' })).toHaveAttribute('aria-pressed', 'true');
  await music.click();
  await expect(music).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: 'Music off' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('radio', { name: 'Lantern Night' }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Music' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'Lantern Night' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('m');
  await expect(page.getByRole('switch', { name: 'Music' })).toHaveAttribute('aria-checked', 'true');
});

test('the Treasury: Atlas’s first week, the villagers who need you, and what it builds next', async ({ page }) => {
  await page.goto(SESSIONS);
  await expect(page.getByRole('link', { name: /Shells in the treasury/ })).toBeVisible();
  await page.keyboard.press('9');
  await expect(page).toHaveURL(/\/isle$/);
  await expect(page.getByRole('heading', { name: 'Atlas, Owner of the isle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who needs you' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Last nights' })).toBeVisible();
  await expect(page.locator('.isle-nights li')).toHaveCount(7);
  // Six buildings with levels, three Wonders.
  await expect(page.locator('.isle-catalog li')).toHaveCount(9);
  await expect(page.getByRole('heading', { name: 'Wonders' })).toBeVisible();
  await page.getByRole('link', { name: 'The year so far →' }).click();
  await expect(page).toHaveURL(/\/isle\/eras$/);
  await expect(page.getByRole('heading', { name: /The island of 2026 \(so far\)/ })).toBeVisible();
  await page.getByRole('link', { name: '←', exact: true }).click();
  await expect(page).toHaveURL(/\/isle$/);
});
