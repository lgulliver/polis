import { describe, expect, it } from "vitest";
import {
  CollectWoodOptionsSchema,
  SkillResultSchema
} from "../skills/collectWood.js";

describe("CollectWoodOptionsSchema", () => {
  it("applies defaults for omitted numeric options", () => {
    const eventLogger = {
      logEvent: () => {}
    };

    expect(CollectWoodOptionsSchema.parse({ eventLogger })).toEqual({
      targetCount: 8,
      searchRadius: 32,
      maxBlocks: 8,
      timeoutMs: 120000,
      eventLogger
    });
  });

  it("rejects invalid option values", () => {
    const eventLogger = {
      logEvent: () => {}
    };

    expect(() =>
      CollectWoodOptionsSchema.parse({
        targetCount: 0,
        searchRadius: 32,
        maxBlocks: 8,
        timeoutMs: 120000,
        eventLogger
      })
    ).toThrow();
  });
});

describe("SkillResultSchema", () => {
  it("accepts a failure result with a clear reason", () => {
    expect(
      SkillResultSchema.parse({
        ok: false,
        collectedCount: 2,
        blocksDug: 3,
        reason: "target_not_reached"
      })
    ).toEqual({
      ok: false,
      collectedCount: 2,
      blocksDug: 3,
      reason: "target_not_reached"
    });
  });

  it("rejects a failure result without a reason", () => {
    expect(() =>
      SkillResultSchema.parse({
        ok: false,
        collectedCount: 2,
        blocksDug: 3
      })
    ).toThrow();
  });
});
