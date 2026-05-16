import type { SqliteDb } from "./sqliteDb.js";
import { TraitVectorSchema, type TraitVector } from "../traits.js";
import type { AgentState } from "../stateMachine.js";

export type AgentStatus = "member" | "wanderer" | "departed";

export type PersistedAgent = {
  name: string;
  username: string;
  status: AgentStatus;
  traits: TraitVector;
  trustValues: Record<string, number>;
  mission: string | null;
  agentState: AgentState;
  joinedAt: number;
  lastSeen: number;
};

type AgentRow = {
  name: string;
  username: string;
  status: string;
  traits_json: string;
  trust_json: string;
  mission: string | null;
  agent_state: string;
  joined_at: number;
  last_seen: number;
};

function rowToAgent(row: AgentRow): PersistedAgent {
  return {
    name: row.name,
    username: row.username,
    status: row.status as AgentStatus,
    traits: TraitVectorSchema.parse(JSON.parse(row.traits_json)),
    trustValues: JSON.parse(row.trust_json) as Record<string, number>,
    mission: row.mission ?? null,
    agentState: (row.agent_state ?? "Idle") as AgentState,
    joinedAt: row.joined_at,
    lastSeen: row.last_seen
  };
}

export function createAgentRepository(db: SqliteDb) {
  function upsert(agent: PersistedAgent): void {
    const stmt = db.prepare(`
      INSERT INTO agents (name, username, status, traits_json, trust_json, mission, agent_state, joined_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        username    = excluded.username,
        status      = excluded.status,
        traits_json = excluded.traits_json,
        trust_json  = excluded.trust_json,
        mission     = excluded.mission,
        agent_state = excluded.agent_state,
        last_seen   = excluded.last_seen
    `);
    stmt.run(
      agent.name,
      agent.username,
      agent.status,
      JSON.stringify(agent.traits),
      JSON.stringify(agent.trustValues),
      agent.mission,
      agent.agentState,
      agent.joinedAt,
      agent.lastSeen
    );
  }

  function findByName(name: string): PersistedAgent | undefined {
    const row = db.prepare("SELECT * FROM agents WHERE name = ?").get(name) as AgentRow | undefined;
    return row ? rowToAgent(row) : undefined;
  }

  function findByStatus(status: AgentStatus): PersistedAgent[] {
    const rows = db.prepare("SELECT * FROM agents WHERE status = ?").all(status) as AgentRow[];
    return rows.map(rowToAgent);
  }

  function findAll(): PersistedAgent[] {
    const rows = db.prepare("SELECT * FROM agents").all() as AgentRow[];
    return rows.map(rowToAgent);
  }

  function updateStatus(name: string, status: AgentStatus): void {
    db.prepare("UPDATE agents SET status = ?, last_seen = ? WHERE name = ?")
      .run(status, Date.now(), name);
  }

  function updateState(name: string, agentState: AgentState): void {
    db.prepare("UPDATE agents SET agent_state = ?, last_seen = ? WHERE name = ?")
      .run(agentState, Date.now(), name);
  }

  return { upsert, findByName, findByStatus, findAll, updateStatus, updateState };
}

export type AgentRepository = ReturnType<typeof createAgentRepository>;
