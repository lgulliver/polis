import { describe, expect, it, vi } from "vitest";
import {
  CreateSharedChestOptionsSchema,
  CreateSharedChestResultSchema,
  createSharedChest
} from "../skills/createSharedChest.js";

function createEventLogger() {
  return {
    logEvent: vi.fn()
  };
}

function createInsufficientMaterialsBot() {
  return {
    entity: {
      position: {
        x: 0,
        y: 64,
        z: 0,
        constructor: class Vec3Mock {
          constructor(
            public x: number,
            public y: number,
            public z: number
          ) {}

          offset(deltaX: number, deltaY: number, deltaZ: number) {
            return new Vec3Mock(this.x + deltaX, this.y + deltaY, this.z + deltaZ);
          }
        }
      }
    },
    inventory: {
      items: () => []
    },
    pathfinder: {
      setMovements: vi.fn(),
      goto: vi.fn(),
      stop: vi.fn()
    },
    registry: {
      blocksByName: {},
      itemsByName: {}
    },
    findBlock: vi.fn(),
    blockAt: vi.fn(),
    recipesFor: vi.fn(),
    craft: vi.fn(),
    equip: vi.fn(),
    placeBlock: vi.fn(),
    clearControlStates: vi.fn(),
    stopDigging: vi.fn()
  };
}

describe("CreateSharedChestOptionsSchema", () => {
  it("applies defaults for omitted numeric options", () => {
    const eventLogger = createEventLogger();

    expect(CreateSharedChestOptionsSchema.parse({ eventLogger })).toEqual({
      timeoutMs: 90000,
      placementSearchRadius: 6,
      eventLogger
    });
  });

  it("rejects invalid option values", () => {
    const eventLogger = createEventLogger();

    expect(() =>
      CreateSharedChestOptionsSchema.parse({
        timeoutMs: 999,
        placementSearchRadius: 6,
        eventLogger
      })
    ).toThrow();
  });
});

describe("createSharedChest", () => {
  it("fails fast with insufficient materials", async () => {
    const eventLogger = createEventLogger();
    const bot = createInsufficientMaterialsBot();

    await expect(
      createSharedChest(bot as never, {
        eventLogger,
        timeoutMs: 5000
      })
    ).resolves.toEqual({
      ok: false,
      reason: "insufficient_materials"
    });

    expect(eventLogger.logEvent).toHaveBeenCalledWith(
      "create_chest_failed",
      expect.objectContaining({ reason: "insufficient_materials" })
    );
  });
});

describe("CreateSharedChestResultSchema", () => {
  it("accepts the expected success result shape", () => {
    expect(
      CreateSharedChestResultSchema.parse({
        ok: true,
        chestLocation: { x: 1, y: 64, z: 2 },
        craftingTableLocation: { x: 0, y: 64, z: 2 }
      })
    ).toEqual({
      ok: true,
      chestLocation: { x: 1, y: 64, z: 2 },
      craftingTableLocation: { x: 0, y: 64, z: 2 }
    });
  });
});
