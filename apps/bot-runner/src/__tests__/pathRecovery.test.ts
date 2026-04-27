import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createGroundMovementsMock } = vi.hoisted(() => ({
  createGroundMovementsMock: vi.fn()
}));

vi.mock("../skills/movements.js", () => ({
  createGroundMovements: createGroundMovementsMock
}));

import { installPathRecovery } from "../skills/pathRecovery.js";

type MovementState = {
  canDig: boolean;
  maxDropDown: number;
  allow1by1towers: boolean;
  allowFreeMotion: boolean;
  allowParkour: boolean;
  canOpenDoors: boolean;
};

class BotStub extends EventEmitter {
  pathfinder: {
    movements: MovementState;
    setMovements: ReturnType<typeof vi.fn>;
  };

  constructor(movements: MovementState) {
    super();

    this.pathfinder = {
      movements,
      setMovements: vi.fn((nextMovements: MovementState) => {
        this.pathfinder.movements = nextMovements;
      })
    };
  }
}

function createLogger() {
  return {
    logEvent: vi.fn()
  };
}

describe("installPathRecovery", () => {
  beforeEach(() => {
    createGroundMovementsMock.mockReset();
  });

  it("enables digging when pathfinder reports no path", () => {
    const recoveredMovements: MovementState = {
      canDig: true,
      maxDropDown: 4,
      allow1by1towers: false,
      allowFreeMotion: true,
      allowParkour: false,
      canOpenDoors: false
    };
    createGroundMovementsMock.mockReturnValueOnce(recoveredMovements);

    const bot = new BotStub({
      canDig: false,
      maxDropDown: 4,
      allow1by1towers: false,
      allowFreeMotion: true,
      allowParkour: false,
      canOpenDoors: false
    });
    const eventLogger = createLogger();

    installPathRecovery(bot as never, eventLogger);
    bot.emit("path_update", { status: "noPath", path: [] });

    expect(createGroundMovementsMock).toHaveBeenCalledWith(bot, {
      canDig: true,
      maxDropDown: 4,
      allow1by1towers: false,
      allowFreeMotion: true,
      allowParkour: false,
      canOpenDoors: false
    });
    expect(bot.pathfinder.setMovements).toHaveBeenCalledWith(recoveredMovements);
    expect(eventLogger.logEvent).toHaveBeenCalledWith("path_update", {
      status: "noPath",
      pathLength: 0,
      canDig: false
    });
    expect(eventLogger.logEvent).toHaveBeenCalledWith("path_recovery_enabled_digging", {
      trigger: "noPath",
      maxDropDown: 4,
      allowFreeMotion: true
    });
  });

  it("does not rewrite movements when digging is already allowed", () => {
    const bot = new BotStub({
      canDig: true,
      maxDropDown: 8,
      allow1by1towers: false,
      allowFreeMotion: true,
      allowParkour: false,
      canOpenDoors: false
    });
    const eventLogger = createLogger();

    installPathRecovery(bot as never, eventLogger);
    bot.emit("path_reset", "stuck");

    expect(createGroundMovementsMock).not.toHaveBeenCalled();
    expect(bot.pathfinder.setMovements).not.toHaveBeenCalled();
    expect(eventLogger.logEvent).toHaveBeenCalledWith("path_reset", {
      reason: "stuck",
      canDig: true
    });
  });
});