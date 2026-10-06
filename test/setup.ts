import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll } from "vitest";
import { network } from "./network";

await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }).TEST_MIGRATIONS);

beforeAll(() => network.enable());
afterEach(() => network.resetHandlers());
afterAll(() => network.disable());
