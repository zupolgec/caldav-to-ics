import { type APIRequestContext, expect, test } from "@playwright/test";

const FIXTURES = "http://localhost:8790";

async function signInLink(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.get(`/__dev/outbox?to=${encodeURIComponent(email)}`);
  expect(response.ok()).toBe(true);
  const match = /http:\/\/localhost:8797\/login\/verify\?token=[\w-]+/.exec(await response.text());
  expect(match).not.toBeNull();
  return match![0];
}

test.use({ locale: "it-IT" });

test("someone signs up, merges two calendars and shares the links", async ({ page, request, context }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  // Landing page in Italian, then switch to English and back.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tutti i tuoi calendari");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("All your calendars");
  await page.getByRole("link", { name: "Italiano" }).click();

  // Sign up with a one-time link.
  await page.getByLabel("La tua email").first().fill(email);
  await page.getByRole("button", { name: "Ricevi il link di accesso" }).first().click();
  await expect(page.getByRole("heading", { name: "Controlla la posta" })).toBeVisible();
  await page.goto(await signInLink(request, email));
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Entra" }).click();

  // Empty dashboard invites to add the first calendar.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Aggiungi il tuo primo calendario")).toBeVisible();

  // The help explains where to find calendar links.
  await page.getByRole("button", { name: "Dove trovo il link?" }).click();
  const help = page.getByRole("dialog");
  await expect(help.getByRole("heading", { name: "Google Calendar" })).toBeVisible();
  await help.getByRole("button", { name: "Chiudi" }).click();
  await expect(help).toBeHidden();

  // Add two calendars.
  const input = page.getByLabel("Link del calendario", { exact: true });
  await input.fill(`${FIXTURES}/work.ics`);
  await page.getByRole("button", { name: "Aggiungi calendario" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Work" })).toBeVisible();
  await input.fill(`${FIXTURES}/family.ics`);
  await page.getByRole("button", { name: "Aggiungi calendario" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Family" })).toBeVisible();

  // A wrong link is explained, not added.
  await input.fill(`${FIXTURES}/missing.ics`);
  await page.getByRole("button", { name: "Aggiungi calendario" }).click();
  await expect(page.getByRole("alert")).toContainText("non è stato trovato");

  // Copy the full link and read both feeds like a calendar app would.
  const fullField = page.getByLabel("Calendario completo");
  const busyField = page.getByLabel("Calendario occupato");
  const fullUrl = await fullField.inputValue();
  const busyUrl = await busyField.inputValue();
  await page.getByRole("button", { name: "Copia" }).first().click();
  await expect(page.getByRole("button", { name: "Copiato" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(fullUrl);

  const full = await (await request.get(fullUrl)).text();
  expect(full).toContain("SUMMARY:Secret project kickoff");
  expect(full).toContain("SUMMARY:Dentist");
  const busy = await (await request.get(busyUrl)).text();
  expect(busy).not.toContain("Secret project kickoff");
  expect(busy).toContain("SUMMARY:Occupato");

  // The preview shows this week, with every detail or only busy time.
  await page.getByRole("link", { name: "Anteprima", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anteprima" })).toBeVisible();
  const today = page.locator("li[aria-current=date]");
  await expect(today.getByText("Planning")).toBeVisible();
  await page.getByRole("link", { name: "Occupato", exact: true }).click();
  await expect(today.getByText("Planning")).toBeHidden();
  await expect(today.getByText("Occupato")).toBeVisible();

  // Rename the calendar in the settings.
  await page.getByRole("link", { name: "Impostazioni" }).click();
  await page.getByLabel("Nome del calendario").fill("Agenda di prova");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("status")).toContainText("Salvato");
  expect(await (await request.get(fullUrl)).text()).toContain("X-WR-CALNAME:Agenda di prova");

  // Remove a calendar.
  await page.getByRole("link", { name: "Calendari", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("listitem").filter({ hasText: "Work" }).getByRole("button", { name: "Rimuovi" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Work" })).toBeHidden();
  expect(await (await request.get(fullUrl)).text()).not.toContain("Secret project kickoff");

  // Sign out.
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tutti i tuoi calendari");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
