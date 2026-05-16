import type { EventLogger } from "../log.js";
import { logSocialEvent } from "./events.js";

export const DEFAULT_TRUST = 0.5;

export function clampTrust(value: number): number {
  return Math.min(1, Math.max(0, value));
}

type CreateTrustMapInput = {
  username: string;
  agent: string;
  role: string;
  style: string;
  eventLogger: EventLogger;
  initialValues?: Record<string, number>;
};

export type TrustDeltaReason = "gratitude_expressed" | "heard_shelter_proposal";

export type TrustMap = {
  getTrust: (target: string) => number;
  applyDelta: (target: string, delta: number, reason: TrustDeltaReason) => {
    trustBefore: number;
    trustAfter: number;
  };
  serialize: () => Record<string, number>;
};

export function createTrustMap(input: CreateTrustMapInput): TrustMap {
  const values = new Map<string, number>(Object.entries(input.initialValues ?? {}));

  function keyFor(target: string): string {
    return target.trim().toLowerCase();
  }

  function getTrust(target: string): number {
    return values.get(keyFor(target)) ?? DEFAULT_TRUST;
  }

  function applyDelta(target: string, delta: number, reason: TrustDeltaReason) {
    const trustBefore = getTrust(target);
    const trustAfter = clampTrust(trustBefore + delta);

    values.set(keyFor(target), trustAfter);
    logSocialEvent(input.eventLogger, "trust_delta_applied", {
      username: input.username,
      agent: input.agent,
      role: input.role,
      style: input.style,
      target,
      delta,
      reason,
      trustBefore,
      trustAfter
    });

    return {
      trustBefore,
      trustAfter
    };
  }

  function serialize(): Record<string, number> {
    return Object.fromEntries(values);
  }

  return {
    getTrust,
    applyDelta,
    serialize
  };
}
