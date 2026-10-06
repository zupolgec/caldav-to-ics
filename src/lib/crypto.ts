const encoder = new TextEncoder();
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Random URL-safe token of `length` base62 characters (about 5.95 bits each). */
export function randomToken(length = 24): string {
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      // 248 = 4 × 62: rejecting larger bytes keeps every character equally likely.
      if (byte < 248 && out.length < length) out.push(ALPHABET[byte % 62]);
    }
  }
  return out.join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const keys = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new Error("ENCRYPTION_KEY is not set");
  let key = keys.get(secret);
  if (!key) {
    const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
    if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
    key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keys.set(secret, key);
  }
  return key;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Encrypts a JSON-serializable value with AES-256-GCM. Output: "v1.<iv>.<ciphertext>". */
export async function encryptJson(secret: string | undefined, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(secret), encoder.encode(JSON.stringify(value)));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
}

export async function decryptJson<T>(secret: string | undefined, payload: string): Promise<T> {
  const [version, iv, data] = payload.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("unknown encrypted payload");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await importKey(secret), fromBase64(data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
