import type { EventLogger } from "./log.js";

export type AgentState = "Idle" | "Exploring" | "Gathering" | "Socialising" | "Resting" | "Planning";

const RESTING_HEALTH_THRESHOLD = 6;
const RESTING_FOOD_THRESHOLD = 4;
const RECOVERY_HEALTH_THRESHOLD = 14;
const RECOVERY_FOOD_THRESHOLD = 14;

// Map from action kind to the state it represents while underway / after success
const ACTION_STATE: Partial<Record<string, AgentState>> = {
  explore: "Exploring",
  collect_wood: "Gathering",
  create_chest: "Gathering",
  chat: "Socialising",
  follow_player: "Socialising",
  status: "Idle",
  idle: "Idle",
  stop: "Idle",
  noop: "Idle"
};

export type StateMachine = {
  getState: () => AgentState;
  /** Call on every perception tick — applies health/food emergency guards. */
  applyGuards: (health: number, food: number) => void;
  /** Call after an action completes to advance state from its outcome. */
  transitionFromAction: (action: string, ok: boolean) => void;
  serialize: () => AgentState;
};

export function createStateMachine(
  initialState: AgentState = "Idle",
  eventLogger?: EventLogger,
  agentName?: string
): StateMachine {
  let state: AgentState = initialState;

  function set(next: AgentState): void {
    if (next === state) return;
    const prev = state;
    state = next;
    eventLogger?.logEvent("state_transition", { agent: agentName ?? null, from: prev, to: next });
  }

  function getState(): AgentState {
    return state;
  }

  function applyGuards(health: number, food: number): void {
    if (state === "Resting") {
      // Only leave Resting when sufficiently recovered
      if (health >= RECOVERY_HEALTH_THRESHOLD && food >= RECOVERY_FOOD_THRESHOLD) {
        set("Idle");
      }
      return;
    }
    if (health < RESTING_HEALTH_THRESHOLD || food < RESTING_FOOD_THRESHOLD) {
      set("Resting");
    }
  }

  function transitionFromAction(action: string, ok: boolean): void {
    if (state === "Resting") return; // guards take priority

    if (!ok) {
      // Failed actions return to Idle so the agent can replan
      set("Idle");
      return;
    }

    const target = ACTION_STATE[action];
    if (target) {
      set(target);
    } else {
      set("Idle");
    }
  }

  function serialize(): AgentState {
    return state;
  }

  return { getState, applyGuards, transitionFromAction, serialize };
}
