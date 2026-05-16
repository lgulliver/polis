import type { Db } from "./db.js";
import { TraitVectorSchema, type TraitVector } from "../traits.js";

export type AgentStatus = "member" | "wanderer" | "departed";

export type PersistedAgent = {
  name: string;
  username: string;
  status: AgentStatus;
  traits: TraitVector;
  trustValues: Record<string, number>;
  mission: string | null;
  joinedAt: number;
  lastSeen: number;
};

type Row = {
  name: string;
  username: string;
  status: string;
  traits: string;
  trust_json: string;
  mission: string | null;
  joined_at: number;
  last_seen: number;
};

function rowToAgent(row: Row): PersistedAgent {
  return {
    name: row.name,
    username: row.username,
    status: row.status as AgentStatus,
    traits: TraitVectorSchema.parse(JSON.parse(row.traits)),
    trustValues: JSON.parse(row.trust_json) as Record<string, number>,
    mission: row.mission,
    joinedAt: row.joined_at,
    lastSeen: row.last_seen
  };
}

export function createAgentRepository(db: Db) {
  const upsert = db.prepare<[string, string, string, string, string, string | null, number, number]>(`
    INSERT INTO agents (name, username, status, traits, trust_json, mission, joined_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      username  = excluded.username,
      status    = excluded.status,
      traits    = excluded.traits,
      trust_json = excluded.trust_json,
      mission   = excluded.mission,
      last_seen = excluded.last_seen
  `);

  const findByName = db.prepare<[string], Row>(`SELECT * FROM agents WHERE name = ?`);
  const findByStatus = db.prepare<[string], Row>(`SELECT * FROM agents WHERE status = ?`);
  const findAll = db.prepare<[], Row>(`SELECT * FROM agents`);
  const updateStatus = db.prepare<[string, number, string]>(
    `UPDATE agents SET status = ?, last_seen = ? WHERE name = ?`
  );

  return {
    upsert(agent: PersistedAgent): void {
      upsert.run(
        agent.name,
        agent.username,
        agent.status,
        JSON.stringify(agent.traits),
        JSON.stringify(agent.trustValues),
        agent.mission,
        agent.joinedAt,
        agent.lastSeen
      );
    },

    findByName(name: string): PersistedAgent | undefined {
      const row = findByName.get(name);
      return row ? rowToAgent(row) : undefined;
    },

    findByStatus(status: AgentStatus): PersistedAgent[] {
      return findByStatus.all(status).map(rowToAgent);
    },

    findAll(): PersistedAgent[] {
      return findAll.all().map(rowToAgent);
    },

    updateStatus(name: string, status: AgentStatus): void {
      updateStatus.run(status, Date.now(), name);
    }
  };
}

export type AgentRepository = ReturnType<typeof createAgentRepository>;
