-- Accounts. Sign-in is passwordless: a one-time link is emailed to the address.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'it',
  created_at INTEGER NOT NULL
);

-- One-time sign-in links. Only a SHA-256 hash of the token is stored.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  locale TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX login_tokens_email ON login_tokens (email, created_at);

-- Browser sessions. Only a SHA-256 hash of the cookie value is stored.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- The merged calendar of each user: settings, secret URL tokens and refresh state.
-- The generated .ics bodies live in KV under feed:<user_id>:full and feed:<user_id>:busy.
CREATE TABLE feeds (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  full_token TEXT NOT NULL UNIQUE,
  busy_token TEXT NOT NULL UNIQUE,
  calendar_name TEXT NOT NULL,
  busy_title TEXT NOT NULL,
  past_days INTEGER NOT NULL DEFAULT 90,
  extra_emails TEXT NOT NULL DEFAULT '',
  input_hash TEXT,
  full_etag TEXT,
  busy_etag TEXT,
  modified_at INTEGER,
  event_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  next_refresh_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX feeds_due ON feeds (next_refresh_at);

-- Calendars a user merges. URL and credentials are encrypted (AES-GCM) in `secret`;
-- `url_hint` is a masked version safe to display.
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ics', 'caldav')),
  label TEXT NOT NULL,
  url_hint TEXT NOT NULL,
  secret TEXT NOT NULL,
  color INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_fetched_at INTEGER,
  last_error TEXT,
  content_hash TEXT,
  event_count INTEGER
);
CREATE INDEX sources_user ON sources (user_id, created_at);
