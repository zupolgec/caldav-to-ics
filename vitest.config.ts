import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        kvNamespaces: ["FEEDS"],
        bindings: {
          FULL_TOKEN: "full-token-test",
          BUSY_TOKEN: "busy-token-test",
          OWNER_EMAILS: "me@example.com",
          SOURCES: "[]",
        },
      },
    }),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
});
