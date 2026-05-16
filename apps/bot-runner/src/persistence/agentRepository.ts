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

function validateAgent(raw: unknown): PersistedAgent {
  const a = raw as PersistedAgent;
  return {
    name: a.name,
    username: a.username,
    status: a.status,
    traits: TraitVectorSchema.parse(a.traits),
    trustValues: a.trustValues ?? {},
    mission: a.mission ?? null,
    joinedAt: a.joinedAt,
    lastSeen: a.lastSeen
  };
}

export function createAgentRepository(db: Db) {
  function upsert(agent: PersistedAgent): void {
    const store = db.read();
    store.agents[agent.name] = agent;
    db.write(store);
  }

  function findByName(name: string): PersistedAgent | undefined {
    const store = db.read();
    const raw = store.agents[name];
    return raw ? validateAgent(raw) : undefined;
  }

  function findByStatus(status: AgentStatus): PersistedAgent[] {
    const store = db.read();
    return Object.values(store.agents)
      .filter((a) => a.status === status)
      .map(validateAgent);
  }

  function findAll(): PersistedAgent[] {
    const store = db.read();
    return Object.values(store.agents).map(validateAgent);
  }

  function updateStatus(name: string, status: AgentStatus): void {
    const store = db.read();
    const existing = store.agents[name];
    if (existing) {
      store.agents[name] = { ...existing, status, lastSeen: Date.now() };
      db.write(store);
    }
  }

  return { upsert, findByName, findByStatus, findAll, updateStatus };
}

export type AgentRepository = ReturnType<typeof createAgentRepository>;
