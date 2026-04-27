import { describe, expect, it } from "vitest";
import { buildStatusMessage } from "../skills/status.js";

describe("buildStatusMessage", () => {
  it("reports numeric coordinates when position is available", () => {
    const bot = {
      health: 20,
      food: 18,
      entity: {
        position: {
          x: 12.34,
          y: 64,
          z: -5.67
        }
      },
      inventory: {
        items: () => []
      }
    };

    expect(buildStatusMessage(bot as never)).toBe("hp=20 | food=18 | pos=12.3,64.0,-5.7 | inventory=empty");
  });

  it("falls back when coordinates are not finite", () => {
    const bot = {
      health: 18.9,
      food: 17,
      entity: {
        position: {
          x: Number.NaN,
          y: 63,
          z: Number.NaN
        }
      },
      inventory: {
        items: () => []
      }
    };

    expect(buildStatusMessage(bot as never)).toBe("hp=18.9 | food=17 | pos=unknown,63.0,unknown | inventory=empty");
  });
});
