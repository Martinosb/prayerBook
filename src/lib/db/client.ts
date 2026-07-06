import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import { CREATE_TABLES_SQL } from "./schema";

let db: SQLiteDatabase | null = null;

/** Local SQLite database — the single source of truth every screen reads from. */
export function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync("prayerbook.db");
    db.execSync("PRAGMA journal_mode = WAL;");
    db.execSync(CREATE_TABLES_SQL);
  }
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
