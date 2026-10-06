import { type Page, expect, test } from "@playwright/test";

async function overflow(page: Page) {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
}

async function signUp(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const text = await (await page.request.get(`/__dev/outbox?to=${encodeURIComponent(email)}`)).text();
  await page.goto(/http:\/\/localhost:8797\/login\/verify\?token=[\w-]+/.exec(text)![0]);
  await page.getByRole("button", { name: "Sign in" }).click();
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`pages never scroll sideways, and short pages fit the window (${viewport.width}×${viewport.height})`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport, locale: "en-US" })).newPage();
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      expect((await overflow(page)).x, path).toBeLessThanOrEqual(0);
    }
    expect((await overflow(page)).y, "/login").toBeLessThanOrEqual(0);

    await signUp(page, `layout-${viewport.width}-${Date.now()}@example.com`);
    await expect(page).toHaveURL(/\/dashboard$/);
    const dashboard = await overflow(page);
    expect(dashboard.x, "/dashboard").toBeLessThanOrEqual(0);
    // The empty dashboard fits on a desktop screen: nothing to scroll.
    if (viewport.width >= 1024) expect(dashboard.y, "/dashboard").toBeLessThanOrEqual(0);
    await page.goto("/settings");
    expect((await overflow(page)).x, "/settings").toBeLessThanOrEqual(0);
  });
}
