import { test, expect } from '@playwright/test';
test('home navigation and responsive layout', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Every fight has a story. Know them all.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `docs/screenshots/home-${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Start Chatting', exact: true }).first().click();
  await expect(page.getByLabel('Ask a UFC question')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('all directories and information pages render', async ({ page }) => {
  for (const route of [
    '/fighters',
    '/events',
    '/rankings',
    '/news',
    '/compare',
    '/about',
    '/status',
    '/privacy',
    '/terms',
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test('chat handles infrastructure unavailability honestly', async ({ page }) => {
  await page.goto('/chat');
  await page.getByLabel('Ask a UFC question').fill('What is the next UFC event?');
  await page.getByLabel('Send question').click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText('unavailable');
});
