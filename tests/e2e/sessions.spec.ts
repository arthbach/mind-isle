import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { AGENTS, SESSIONS } from '../../playwright.config';
import { makeAgentFixtures, writeRegistry } from '../fixtures/agents';

const vault = path.resolve('.palace-e2e/vault');
const events = path.resolve('.palace-e2e/data-sessions/events');
let fx: ReturnType<typeof makeAgentFixtures>;

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  fs.rmSync(AGENTS, { recursive: true, force: true });
  fs.rmSync(path.resolve('.palace-e2e/data-sessions'), { recursive: true, force: true });
  fx = makeAgentFixtures(AGENTS);
});

const row = (page: Page, cwd: string) => page.locator(`li[data-cwd="${cwd}"]`);
const settings = () => fs.readFileSync(path.join(fx.claude, 'settings.json'), 'utf8');

test('nothing is read until a source is allowed', async ({ page }) => {
  await page.goto(`${SESSIONS}/settings/agents`);
  for (const s of ['orca', 'claude-code', 'codex']) await expect(page.locator(`[data-source="${s}"]`)).toContainText('off');
  await page.goto(`${SESSIONS}/sessions`);
  await expect(page.getByRole('heading', { name: 'Which project is each folder?' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open Settings → Agents' })).toBeVisible();
});

test('allowing Claude Code maps folders by confidence and asks about the rest', async ({ page }) => {
  await page.goto(`${SESSIONS}/settings/agents`);
  await page.locator('[data-source="claude-code"]').getByRole('button', { name: 'Allow' }).click();
  await expect(page.locator('[data-source="claude-code"]').getByRole('button', { name: 'Turn off' })).toBeVisible();
  await page.goto(`${SESSIONS}/sessions`);
  await expect(page.getByRole('heading', { name: 'Which project is each folder?' })).toBeVisible();

  await expect(row(page, fx.cwd.lighthouse)).toHaveAttribute('data-kind', 'confirmed');
  await expect(row(page, fx.cwd.northwind)).toHaveAttribute('data-kind', 'ask');
  await expect(row(page, fx.cwd.scratch)).toHaveAttribute('data-kind', 'harbor');
  await expect(page.locator('.hotbar .tab-badge')).toHaveText(/\d+/);

  // An unmatched folder never defaults to "Not a project".
  await expect(row(page, fx.cwd.scratch).getByRole('button', { name: 'Project: Choose…' })).toBeVisible();
  await expect(row(page, fx.cwd.scratch).getByRole('button', { name: 'Save' })).toBeDisabled();

  // Accept the suggestion for Northwind: written into the project note.
  await row(page, fx.cwd.northwind).getByRole('button', { name: 'Save' }).click();
  await expect(row(page, fx.cwd.northwind)).toHaveAttribute('data-kind', 'confirmed');
  expect(fs.readFileSync(path.join(vault, '03 Projects/Northwind Routing/Northwind Routing.md'), 'utf8')).toContain('repos: ["~/code/northwind-routing"]');
});

test('live hooks install next to existing ones', async ({ page }) => {
  await page.goto(`${SESSIONS}/settings/agents`);
  await page.locator('[data-source="claude-code"]').getByRole('button', { name: 'Install live hooks' }).click();
  await expect(page.locator('[data-source="claude-code"]').getByRole('button', { name: 'Remove live hooks' })).toBeVisible();
  expect(settings()).toContain('mind-palace-hook');
  expect(settings()).toContain('other-tool notify');
});

test('three running sessions are three workers, and a permission request shows up live', async ({ page }) => {
  writeRegistry(fx.claude, ['lh-1', 'lh-2', 'lh-3'].map((id) => ({ pid: process.pid, sessionId: id, cwd: fx.cwd.lighthouse, status: 'busy' })));
  writeRegistry(fx.claude, [{ pid: process.pid, sessionId: 'sc-1', cwd: fx.cwd.scratch, status: 'busy' }]);
  await page.goto(SESSIONS);
  const canvas = page.locator('canvas[data-live]');
  await expect(canvas).toHaveAttribute('data-live', /(^| )lighthouse-app:3:0( |$)/, { timeout: 5000 });
  // A small crew pin over the building; hovering it opens a bubble with one portrait per session.
  const pin = page.locator('.crew-pin[data-project="lighthouse-app"]');
  await expect(pin).toHaveAccessibleName('Lighthouse App: 3 live sessions');
  await expect(pin.locator('.crew-pin-n')).toHaveText('3');
  await pin.hover();
  await expect(pin).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.crew-pop .crew-face')).toHaveCount(3);
  // scratch isn't placed in a project yet: its session waits at the harbor in its own dashed pin.
  await expect(canvas).toHaveAttribute('data-strays', '1');
  await expect(page.locator('.crew-pin.stray')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.locator('.crew-pop')).toHaveCount(0);
  // 3 Lighthouse + scratch (registry) + Northwind (its log was written moments ago, so it counts as live, dashed).
  await expect(page.locator('.live-head')).toContainText('5 sessions');
  await expect(page.locator('.live-card')).toHaveCount(4); // the strip stays compact…
  await page.getByRole('button', { name: 'Show all 5 sessions' }).click();
  await expect(page.locator('.live-card')).toHaveCount(5); // …until asked
  await expect(page.locator('.live-card.inferred')).toHaveCount(1);

  // The real hook script, as Claude Code would run it.
  const r = spawnSync('node', ['scripts/palace-hook.mjs', '--mind-palace-hook', 'claude', events], {
    input: JSON.stringify({ session_id: 'lh-2', cwd: fx.cwd.lighthouse, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }),
    encoding: 'utf8',
  });
  expect(r.status).toBe(0);
  const started = Date.now();
  await expect(canvas).toHaveAttribute('data-live', /(^| )lighthouse-app:3:1( |$)/, { timeout: 3000 });
  expect(Date.now() - started).toBeLessThan(3000);
  await expect(page.locator('.live-card.needs_you')).toHaveCount(1);
  await expect(pin).toHaveClass(/needs/);
  await expect(pin.locator('.crew-pin-alert')).toBeVisible();
  await expect(pin).toHaveAccessibleName('Lighthouse App: 3 live sessions, 1 waiting for you');
  await expect(page.locator('.live-card').first()).toHaveAttribute('data-state', 'needs_you');

  // Clicking the pin (or a strip card) selects the building and lists its sessions.
  await pin.click();
  await expect(page.getByRole('heading', { name: 'Live sessions' })).toBeVisible();
  await expect(page.locator('aside [data-state]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.locator('.live-card.needs_you').click();
  await expect(page.locator('aside [data-state]')).toHaveCount(3);
});

test('turning the source off removes its sessions and its hooks', async ({ page }) => {
  await page.goto(`${SESSIONS}/settings/agents`);
  await page.locator('[data-source="claude-code"]').getByRole('button', { name: 'Turn off' }).click();
  await expect(page.locator('[data-source="claude-code"]')).toContainText('off');
  expect(settings()).not.toContain('mind-palace-hook');
  expect(settings()).toContain('other-tool notify');
  await page.goto(SESSIONS);
  await expect(page.locator('canvas[data-live]')).toHaveAttribute('data-live', '');
  await expect(page.locator('.live-card')).toHaveCount(0);
});
