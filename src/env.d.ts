// Secrets are not part of wrangler.jsonc, so `wrangler types` doesn't know about them.
declare namespace Cloudflare {
  interface Env {
    SOURCES?: string;
    FULL_TOKEN?: string;
    BUSY_TOKEN?: string;
  }
}
interface Env {
  SOURCES?: string;
  FULL_TOKEN?: string;
  BUSY_TOKEN?: string;
}
