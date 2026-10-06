import { defineConfig, devices } from "@playwright/test";

// E2E tests run against `wrangler dev` with its own local state in .wrangler/e2e,
// never against the development data.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:8797", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node e2e/calendar-server.ts", port: 8790, reuseExistingServer: false },
    {
      command:
        "rm -rf .wrangler/e2e && npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e && npx wrangler dev --port 8797 --persist-to .wrangler/e2e --var DEV_OUTBOX:1 --var ENCRYPTION_KEY:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY= --var EMAIL_FROM:login@localhost",
      url: "http://localhost:8797/healthz",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
