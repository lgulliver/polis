import type { SqliteDb } from "./sqliteDb.js";

export type SignificantEventType =
  | "cooperation_success"
  | "betrayal_observed"
  | "resource_secured"
  | "resource_shared"
  | "death"
  | "ritual_participated"
  | "discovery"
  | "conflict_initiated"
  | "conflict_resolved"
  | "place_named"
  | "first_contact"
  | "commitment_made"
  | "commitment_kept"
  | "commitment_broken";

export type SignificantEvent = {
  id: number;
  timestamp: number;
  eventType: SignificantEventType;
  sourceAgent: string | null;
  targetAgent: string | null;
  payload: Record<string, unknown>;
};

type EventRow = {
  id: number;
  timestamp: number;
  event_type: string;
  source_agent: string | null;
  target_agent: string | null;
  payload_json: string;
};

function rowToEvent(row: EventRow): SignificantEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    eventType: row.event_type as SignificantEventType,
    sourceAgent: row.source_agent ?? null,
    targetAgent: row.target_agent ?? null,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>
  };
}

export function createSignificantEventsRepository(db: SqliteDb) {
  function record(
    eventType: SignificantEventType,
    sourceAgent: string | null,
    targetAgent: string | null,
    payload: Record<string, unknown> = {}
  ): SignificantEvent {
    const result = db.prepare(`
      INSERT INTO significant_events (timestamp, event_type, source_agent, target_agent, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(Date.now(), eventType, sourceAgent, targetAgent, JSON.stringify(payload));

    return {
      id: result.lastInsertRowid as number,
      timestamp: Date.now(),
      eventType,
      sourceAgent,
      targetAgent,
      payload
    };
  }

  function findByAgent(agentName: string, limit = 20): SignificantEvent[] {
    const rows = db.prepare(`
      SELECT * FROM significant_events
      WHERE source_agent = ? OR target_agent = ?
      ORDER BY timestamp DESC LIMIT ?
    `).all(agentName, agentName, limit) as EventRow[];
    return rows.map(rowToEvent);
  }

  function findByType(eventType: SignificantEventType, limit = 20): SignificantEvent[] {
    const rows = db.prepare(`
      SELECT * FROM significant_events WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?
    `).all(eventType, limit) as EventRow[];
    return rows.map(rowToEvent);
  }

  function findRecent(sinceMs: number, limit = 50): SignificantEvent[] {
    const rows = db.prepare(`
      SELECT * FROM significant_events WHERE timestamp > ? ORDER BY timestamp DESC LIMIT ?
    `).all(Date.now() - sinceMs, limit) as EventRow[];
    return rows.map(rowToEvent);
  }

  return { record, findByAgent, findByType, findRecent };
}

export type SignificantEventsRepository = ReturnType<typeof createSignificantEventsRepository>;
