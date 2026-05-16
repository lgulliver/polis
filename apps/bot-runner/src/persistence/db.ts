import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Db = Database.Database;

export function openDatabase(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "polis.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

function applySchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      name        TEXT PRIMARY KEY,
      username    TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'member',
      traits      TEXT NOT NULL DEFAULT '{}',
      trust_json  TEXT NOT NULL DEFAULT '{}',
      mission     TEXT,
      joined_at   INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS places (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      x          INTEGER NOT NULL,
      y          INTEGER NOT NULL,
      z          INTEGER NOT NULL,
      named_by   TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS significant_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      agent_name TEXT,
      event_type TEXT NOT NULL,
      summary    TEXT NOT NULL
    );
  `);
}
