import { test, expect } from '@playwright/test';
test('home navigation and responsive layout', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Every fight has a story. Know them all.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`home-${testInfo.project.name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Start Chatting', exact: true }).first().click();
  await expect(page.getByLabel('Ask a UFC question')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('public informational pages render and directories redirect into chat', async ({ page }) => {
  for (const route of ['/about', '/privacy', '/terms']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main h1')).toBeVisible();
  }
  for (const route of ['/fighters', '/events', '/rankings', '/news', '/compare', '/status']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/(chat|admin)(\?.*)?$/);
  }
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
});
test('chat handles infrastructure unavailability honestly', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Verified retrieval and usage controls are unavailable. Check /status.',
      }),
    }),
  );
  await page.goto('/chat');
  await page.getByLabel('Ask a UFC question').fill('What is the next UFC event?');
  await page.getByLabel('Send question').click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText('unavailable');
});

test('corner section uses balanced columns, mobile stacking and 32px spacing', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const section = page.locator('.how-section');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading', { name: 'A good answer has a corner.' })).toBeVisible();
  const grid = page.locator('.corner-layout');
  const layout = await grid.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      columns: css.gridTemplateColumns.split(' ').map(Number.parseFloat),
      top: css.marginTop,
    };
  });
  expect(layout.top).toBe('32px');
  const mobile = (page.viewportSize()?.width || 0) <= 767;
  expect(layout.columns).toHaveLength(mobile ? 1 : 2);
  if (!mobile) expect(Math.abs(layout.columns[0] - layout.columns[1])).toBeLessThan(1);
  await expect(page.locator('.corner-content')).toHaveAttribute('data-reveal-from', 'left');
  const poster = section.getByRole('img', {
    name: 'Collage of MMA champions wearing championship belts',
  });
  await expect(poster).toBeVisible();
  await expect
    .poll(() =>
      poster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  const posterSize = await poster.boundingBox();
  expect(posterSize!.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.7 + 1);
  expect(await poster.evaluate((image) => getComputedStyle(image).objectFit)).toBe('contain');
  await page.screenshot({
    path: testInfo.outputPath('corner-section.png'),
    fullPage: false,
    animations: 'disabled',
  });
});

test('visual stage preserves four distinct cards and stacks them in reading order', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const stage = page.locator('.visual-stage');
  await stage.scrollIntoViewIfNeeded();
  const cards = [
    stage.locator('.chat-preview'),
    stage.locator('.ufc-float-card'),
    stage.locator('.float-left'),
    stage.locator('.float-right'),
  ];
  for (const card of cards) await expect(card).toBeVisible();
  await expect(cards[0]).toContainText('What makes a complete fighter?');
  await expect(cards[1]).toContainText('Built for UFC fans');
  await expect(cards[2]).toContainText('Source-linked');
  await expect(cards[2]).toContainText('Ask anything about the octagon...');
  await expect(cards[2]).toContainText('Beyond the record.');
  await expect(cards[3]).toContainText('Sources. Not speculation.');
  await expect(stage.locator('.stage-ufc-logo')).toBeVisible();
  await expect
    .poll(() =>
      stage
        .locator('.stage-ufc-logo')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  expect(await stage.evaluate((el) => getComputedStyle(el).marginTop)).toBe('32px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!,
        b = boxes[j]!;
      expect(
        a.x + a.width <= b.x + 1 ||
          b.x + b.width <= a.x + 1 ||
          a.y + a.height <= b.y + 1 ||
          b.y + b.height <= a.y + 1,
      ).toBe(true);
    }
  if (page.viewportSize()!.width <= 1023) {
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
    for (const card of cards)
      expect(await card.evaluate((el) => getComputedStyle(el).position)).toBe('static');
  } else {
    expect((await stage.boundingBox())!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await page.screenshot({ path: testInfo.outputPath('visual-stage.png'), animations: 'disabled' });
  if (testInfo.project.name === 'desktop') {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 820, height: 1180 },
    ]) {
      await page.setViewportSize(viewport);
      await stage.scrollIntoViewIfNeeded();
      const stageBox = (await stage.boundingBox())!;
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const resized = await Promise.all(cards.map((card) => card.boundingBox()));
      if (viewport.width >= 1024) {
        expect(stageBox.height).toBeLessThanOrEqual(viewport.height);
        for (const box of resized) {
          expect(box!.y).toBeGreaterThanOrEqual(stageBox.y - 4);
          expect(box!.y + box!.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 4);
        }
        expect(
          Math.abs(resized[1]!.x + resized[1]!.width / 2 - (stageBox.x + stageBox.width / 2)),
        ).toBeLessThan(stageBox.width * 0.1);
      } else {
        for (let i = 1; i < resized.length; i++)
          expect(resized[i]!.y).toBeGreaterThanOrEqual(resized[i - 1]!.y + resized[i - 1]!.height);
      }
      for (let i = 0; i < resized.length; i++)
        for (let j = i + 1; j < resized.length; j++) {
          const a = resized[i]!,
            b = resized[j]!;
          expect(
            a.x + a.width <= b.x + 1 ||
              b.x + b.width <= a.x + 1 ||
              a.y + a.height <= b.y + 1 ||
              b.y + b.height <= a.y + 1,
          ).toBe(true);
        }
      await stage.screenshot({
        path: testInfo.outputPath(`visual-stage-${viewport.width}.png`),
        animations: 'disabled',
      });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => cards[1].evaluate((el) => getComputedStyle(el).animationName))
    .toBe('none');
  expect(await page.locator('.hero > [data-reveal-from] img, .header img').count()).toBe(0);
});

test('typing indicator appears while waiting, survives streaming and disappears at completion', async ({
  page,
}, testInfo) => {
  await page.goto('/chat');
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (input !== '/api/chat') return original(input, init);
      return new Response(
        new ReadableStream({
          start(controller) {
            Object.assign(window, { chatTestStream: controller });
          },
        }),
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      );
    };
  });
  await page.getByLabel('Ask a UFC question').fill('What is the next UFC event?');
  await page.getByLabel('Send question').click();
  const status = page.getByRole('status');
  await expect(status).toHaveText('Working on your answer...');
  await expect(status.locator('.typing-dots > span')).toHaveCount(3);
  await page.evaluate(() => {
    const stream = (window as unknown as { chatTestStream: ReadableStreamDefaultController })
      .chatTestStream;
    stream.enqueue(
      new TextEncoder().encode(
        JSON.stringify({ type: 'text', text: 'Verified streaming fixture' }) + '\n',
      ),
    );
  });
  await expect(page.getByText('Verified streaming fixture')).toBeVisible();
  await expect(status).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('chat-typing.png'), animations: 'disabled' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      status
        .locator('.typing-dots > span')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe('none');
  await page.evaluate(() =>
    (
      window as unknown as { chatTestStream: ReadableStreamDefaultController }
    ).chatTestStream.close(),
  );
  await expect(status).toHaveCount(0);
  await expect(page.getByText('Verified streaming fixture')).toBeVisible();
});
