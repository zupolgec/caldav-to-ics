// Visual review helper: SCREENSHOTS=1 npx playwright test screenshots
import { expect, test } from "@playwright/test";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to take screenshots");

const out = (name: string) => `test-results/screens/${name}.png`;

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`pages on ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, locale: "it-IT" });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out(`${name}-landing`), fullPage: true });
    await page.goto("/lang/en?next=/");
    await page.screenshot({ path: out(`${name}-landing-en`) });
    await page.goto("/lang/it?next=/login");

    const email = `shots-${name}-${Date.now()}@example.com`;
    await page.getByLabel("La tua email").fill(email);
    await page.getByRole("button", { name: "Ricevi il link di accesso" }).click();
    await page.screenshot({ path: out(`${name}-sent`) });
    const text = await (await page.request.get(`/__dev/outbox?to=${encodeURIComponent(email)}`)).text();
    await page.goto(/http:\/\/localhost:8797\/login\/verify\?token=[\w-]+/.exec(text)![0]);
    await page.screenshot({ path: out(`${name}-verify`) });
    await page.getByRole("button", { name: "Entra" }).click();
    await page.screenshot({ path: out(`${name}-dashboard-empty`), fullPage: true });

    for (const file of ["work.ics", "family.ics"]) {
      await page.getByLabel("Link del calendario", { exact: true }).fill(`http://localhost:8790/${file}`);
      await page.getByRole("button", { name: "Aggiungi calendario" }).click();
      await expect(page.getByRole("status")).toBeVisible();
    }
    await page.reload();
    await page.screenshot({ path: out(`${name}-dashboard`), fullPage: true });
    await page.getByLabel("Link del calendario", { exact: true }).fill("http://localhost:8790/nope.ics");
    await page.getByRole("button", { name: "Aggiungi calendario" }).click();
    await page.screenshot({ path: out(`${name}-dashboard-error`), fullPage: true });
    await page.getByRole("button", { name: "Dove trovo il link?" }).click();
    await page.screenshot({ path: out(`${name}-help`) });
    await page.keyboard.press("Escape");
    await page.goto("/preview");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: out(`${name}-preview`), fullPage: true });
    await page.goto("/preview?view=busy");
    await page.screenshot({ path: out(`${name}-preview-busy`), fullPage: true });
    await page.goto("/settings");
    await page.screenshot({ path: out(`${name}-settings`), fullPage: true });
    await context.close();
  });
}
