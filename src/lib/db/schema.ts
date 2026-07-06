/**
 * Local mirror of the portal_* Postgres tables (see docs/PORTAL_SPEC.md §2),
 * plus three bookkeeping columns on every syncable table:
 *   _dirty   — 1 if this row has local changes not yet pushed to Supabase
 *   _deleted — 1 if this row was deleted locally and the delete needs pushing
 *              (kept around as a tombstone until the push succeeds, then the
 *              row is hard-deleted from SQLite)
 *   _synced_at — last time this row's current state matched the server
 *
 * portal_reminder_sends and portal_push_subscriptions are intentionally not
 * mirrored — they're server/cron-only, never written from the client.
 *
 * days_of_week (int[] remotely) is stored as a JSON text column since SQLite
 * has no array type — see toDaysArray/fromDaysArray in local-store.ts.
 */
export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS portal_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  sms_opt_in INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  last_ai_request_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS portal_categories (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON portal_categories(user_id);
-- Mirrors the remote unique index on (user_id, lower(name)) — catches a
-- duplicate name locally, instantly, instead of writing a row that would
-- fail silently and forever when it eventually reaches Postgres's own
-- unique constraint during a background push.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name
  ON portal_categories(user_id, name COLLATE NOCASE) WHERE _deleted = 0;

CREATE TABLE IF NOT EXISTS portal_prayer_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  answered_at TEXT,
  voice_note_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON portal_prayer_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_category ON portal_prayer_requests(category_id);

CREATE TABLE IF NOT EXISTS portal_scriptures (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reference TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scriptures_request ON portal_scriptures(request_id);

CREATE TABLE IF NOT EXISTS portal_prayer_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  prayed_on TEXT NOT NULL,
  prayed_at TEXT,
  duration_minutes INTEGER,
  note TEXT,
  voice_note_path TEXT,
  created_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_logs_request ON portal_prayer_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_date ON portal_prayer_logs(user_id, prayed_on);

CREATE TABLE IF NOT EXISTS portal_prayer_plans (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  request_id TEXT,
  category_id TEXT,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL,
  days_of_week TEXT,
  times_per_period INTEGER NOT NULL DEFAULT 1,
  window_start TEXT,
  window_end TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_plans_user ON portal_prayer_plans(user_id);

CREATE TABLE IF NOT EXISTS portal_reminders (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  request_id TEXT,
  label TEXT NOT NULL,
  remind_time TEXT NOT NULL,
  days_of_week TEXT NOT NULL,
  lead_minutes INTEGER NOT NULL DEFAULT 15,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON portal_reminders(user_id);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

export const SYNCABLE_TABLES = [
  "portal_profiles",
  "portal_categories",
  "portal_prayer_requests",
  "portal_scriptures",
  "portal_prayer_logs",
  "portal_prayer_plans",
  "portal_reminders",
] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];
