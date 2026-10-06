// Secrets and optional variables that `wrangler types` can't see in wrangler.jsonc.
declare namespace Cloudflare {
  interface Env {
    /** 32 random bytes, base64. Encrypts calendar links and passwords at rest. */
    ENCRYPTION_KEY: string;
    /** "1" only in local E2E runs: keeps the last email per address readable at /__dev/outbox. */
    DEV_OUTBOX?: string;
  }
}
interface Env {
  ENCRYPTION_KEY: string;
  DEV_OUTBOX?: string;
}
