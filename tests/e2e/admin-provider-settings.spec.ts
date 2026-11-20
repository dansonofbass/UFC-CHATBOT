import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

test('Admin switches providers, secondary slots and configured models without exposing secrets', async ({
  page,
  context,
  baseURL,
}) => {
  const secret = process.env.ADMIN_BROWSER_TEST_SECRET;
  test.skip(!secret, 'Run with an isolated server and ADMIN_BROWSER_TEST_SECRET.');
  const expiry = String(Date.now() + 3600000);
  const signature = createHmac('sha256', secret!).update(expiry).digest('hex');
  await context.addCookies([
    {
      name: 'octagon_admin_session',
      value: `${expiry}.${signature}`,
      url: baseURL!,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  let settings = {
    activeAI: 'groq',
    groq: { slot: 1, model: 'fixture/groq' },
    openrouter: { slot: 1, model: 'openrouter/free' },
    data: { provider: 'ufcalendar', slot: 1 },
  };
  const view = () => ({
    settings,
    ai: {
      groq: {
        models: ['fixture/groq', 'fixture/groq-alt'],
        slots: [1, 2].map((slot) => ({ slot, configured: true, label: '****' })),
      },
      openrouter: {
        models: ['openrouter/free', 'fixture/model:free'],
        slots: [1, 2].map((slot) => ({ slot, configured: true, label: '****' })),
      },
    },
    data: {
      provider: 'ufcalendar',
      slots: [1, 2, 3].map((slot) => ({ slot, configured: slot < 3, label: '****' })),
    },
    fallback: 'Groq → free OpenRouter on recoverable errors; no key rotation.',
  });
  const calls: unknown[] = [];
  await page.route('**/api/admin/provider-settings', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: view() });
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === 'save') {
      settings = body.settings;
      return route.fulfill({ json: view() });
    }
    return route.fulfill({
      json: {
        result: { ok: true, code: 'connected', message: 'Connection accepted (synthetic test).' },
      },
    });
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'AI Provider Settings' })).toBeVisible();
  await page.getByLabel('Active AI Provider', { exact: true }).selectOption('openrouter');
  await page.getByLabel('Active openrouter key slot', { exact: true }).selectOption('2');
  await page.getByLabel('openrouter model', { exact: true }).selectOption('fixture/model:free');
  await page.getByRole('button', { name: 'Save provider settings' }).click();
  await expect(
    page.getByText('Provider settings saved. Subsequent requests use this selection.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Active AI Provider', { exact: true })).toHaveValue('openrouter');
  await expect(page.getByLabel('Active openrouter key slot', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Test OpenRouter Key 2', exact: true }).click();
  await expect(
    page.getByText('Connection accepted (synthetic test).', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Active AI Provider', { exact: true }).selectOption('groq');
  await page.getByLabel('Active groq key slot', { exact: true }).selectOption('2');
  await page.getByLabel('groq model', { exact: true }).selectOption('fixture/groq-alt');
  await page.getByLabel('Active UFCalendar credential', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Save provider settings' }).click();
  await expect(
    page.getByText('Provider settings saved. Subsequent requests use this selection.'),
  ).toBeVisible();
  expect(calls).toContainEqual({
    action: 'save',
    settings: {
      ...settings,
      activeAI: 'groq',
      groq: { slot: 2, model: 'fixture/groq-alt' },
      data: { provider: 'ufcalendar', slot: 2 },
    },
  });
  await expect(page.getByRole('heading', { name: 'UFC Data Provider Settings' })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Provider settings' });
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  expect(await page.locator('input[type=password],input[name=apiKey]').count()).toBe(0);
});
