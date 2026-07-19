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
    // Wait out the ETL's brief in-place rewrite instead of throwing SQLITE_BUSY.
    // (busy_timeout is a connection setting — safe on a read-only handle.)
    _db.pragma("busy_timeout = 5000");
  }
  return _db;
}
