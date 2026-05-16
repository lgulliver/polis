import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type SqliteDb = InstanceType<typeof DatabaseSync>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS agents (
    name         TEXT    PRIMARY KEY,
    username     TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'member',
    traits_json  TEXT    NOT NULL DEFAULT '{}',
    trust_json   TEXT    NOT NULL DEFAULT '{}',
    mission      TEXT,
    agent_state  TEXT    NOT NULL DEFAULT 'Idle',
    joined_at    INTEGER NOT NULL,
    last_seen    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS named_places (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    x            REAL    NOT NULL,
    y            REAL    NOT NULL,
    z            REAL    NOT NULL,
    radius       REAL    NOT NULL DEFAULT 5,
    place_type   TEXT    NOT NULL DEFAULT 'landmark',
    claimed_by   TEXT,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS significant_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp    INTEGER NOT NULL,
    event_type   TEXT    NOT NULL,
    source_agent TEXT,
    target_agent TEXT,
    payload_json TEXT    NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_sig_events_source    ON significant_events(source_agent);
  CREATE INDEX IF NOT EXISTS idx_sig_events_type      ON significant_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_sig_events_timestamp ON significant_events(timestamp);

  CREATE TABLE IF NOT EXISTS commitments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent  TEXT    NOT NULL,
    to_agent    TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    deadline    INTEGER,
    status      TEXT    NOT NULL DEFAULT 'active',
    created_at  INTEGER NOT NULL,
    resolved_at INTEGER
  );
`;

export function openSqliteDb(dataDir: string): SqliteDb {
  mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "polis.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
