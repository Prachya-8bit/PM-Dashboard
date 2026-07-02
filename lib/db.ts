// lib/db.ts
// Server-side only. Reads aggregated SQLite — no connection to SYS.
// The SQLite file is populated by etl/etl.py (cron every 10 min).
import "server-only"; // npm i server-only
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "dashboard.db");

// Lazy singleton — opened once, reused across requests
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
    // No PRAGMAs needed for read-only — they're write ops and will fail
  }
  return _db;
}
