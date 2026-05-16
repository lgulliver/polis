import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { PersistedAgent } from "./agentRepository.js";

export type Store = {
  agents: Record<string, PersistedAgent>;
};

export type Db = {
  read: () => Store;
  write: (store: Store) => void;
};

export function openDatabase(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, "polis-state.json");

  function read(): Store {
    if (!existsSync(filePath)) {
      return { agents: {} };
    }
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as Store;
  }

  function write(store: Store): void {
    writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
  }

  return { read, write };
}
