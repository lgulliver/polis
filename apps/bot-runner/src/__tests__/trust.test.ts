import { describe, expect, it, vi } from "vitest";
import { createSocialController } from "../social/actions.js";
import { clampTrust, createTrustMap, DEFAULT_TRUST } from "../social/trust.js";

function createEventLogger() {
  return {
    logEvent: vi.fn()
  };
}

function createBotStub() {
  return {
    username: "Ada",
    chat: vi.fn(),
    health: 20,
    food: 18,
    entity: {
      position: {
        x: 0,
        y: 64,
        z: 0,
        distanceTo(other: { x: number; y: number; z: number }) {
          const dx = this.x - other.x;
          const dy = this.y - other.y;
          const dz = this.z - other.z;
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
      }
    },
    inventory: {
      items: () => []
    },
    players: {}
  };
}

const agent = {
  name: "Ada",
  username: "Ada",
  role: "steward",
  archetype: "cautious cooperative village-builder",
  persona: "measured, polite, collective-minded",
  description: "Prefers safe progress, shared shelter, and stable routines over risky solo heroics.",
  language: {
    style: "cautious"
  }
};

describe("trust", () => {
  it("defaults to 0.5", () => {
    const trust = createTrustMap({
      username: "Ada",
      agent: "Ada",
      role: "steward",
      style: "cautious",
      eventLogger: createEventLogger()
    });

    expect(DEFAULT_TRUST).toBe(0.5);
    expect(trust.getTrust("Hopper")).toBe(0.5);
  });

  it("clamps trust deltas between 0 and 1", () => {
    const trust = createTrustMap({
      username: "Ada",
      agent: "Ada",
      role: "steward",
      style: "cautious",
      eventLogger: createEventLogger()
    });

    trust.applyDelta("Hopper", 2, "gratitude_expressed");
    trust.applyDelta("Hopper", -5, "heard_shelter_proposal");

    expect(clampTrust(1.5)).toBe(1);
    expect(clampTrust(-0.25)).toBe(0);
    expect(trust.getTrust("Hopper")).toBe(0);
  });

  it("thank applies +0.05", () => {
    const eventLogger = createEventLogger();
    const bot = createBotStub();
    const social = createSocialController({
      bot: bot as never,
      agent,
      eventLogger,
      knownBotNames: ["Ada", "Hopper"]
    });

    social.execute({ kind: "thank_player", targetPlayer: "Hopper" });

    expect(social.getTrust("Hopper")).toBe(0.55);
    expect(bot.chat).toHaveBeenCalledWith("Hopper, thank you. that helps the group.");
  });
});
