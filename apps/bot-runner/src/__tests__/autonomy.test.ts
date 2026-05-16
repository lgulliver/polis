import { describe, expect, it, vi } from "vitest";
import { createAutonomyController, parseAutonomyDecision } from "../autonomy.js";

const mockAgent = {
  name: "Ada",
  username: "Ada",
  role: "steward",
  archetype: "cautious cooperative village-builder",
  persona: "steady and civic-minded",
  description: "Builds slowly, coordinates often, avoids chaos.",
  language: {
    style: "cautious"
  }
};

function createEnv(overrides: Partial<{
  AUTONOMY_ENABLED: boolean;
  AUTONOMY_TICK_SECONDS: number;
}> = {}) {
  return {
    MC_HOST: "localhost",
    MC_PORT: 25565,
    MC_VERSION: undefined,
    LOG_DIR: "logs",
    BASE_X: undefined,
    BASE_Y: undefined,
    BASE_Z: undefined,
    AUTONOMY_ENABLED: overrides.AUTONOMY_ENABLED ?? true,
    LLM_PROVIDER: "openai" as const,
    AUTONOMY_TICK_SECONDS: overrides.AUTONOMY_TICK_SECONDS ?? 30,
    OPENAI_API_KEY: "test-key",
    ANTHROPIC_API_KEY: undefined
  };
}

function createBotStub() {
  return {
    username: "Ada",
    health: 20,
    food: 18,
    entity: {
      id: 1,
      position: {
        x: 0,
        y: 64,
        z: 0,
        distanceTo: () => 0
      }
    },
    entities: {},
    players: {},
    inventory: {
      items: () => []
    }
  };
}

describe("parseAutonomyDecision", () => {
  it("validates the strict JSON decision schema", () => {
    const parsed = parseAutonomyDecision(JSON.stringify({
      intention: "help the group by gathering materials",
      action: "chat",
      message: "I can help gather wood.",
      reason: "announce a simple cooperative intent"
    }));

    expect(parsed.valid).toBe(true);
    expect(parsed.decision).toEqual({
      intention: "help the group by gathering materials",
      action: "chat",
      message: "I can help gather wood.",
      reason: "announce a simple cooperative intent"
    });
  });

  it("turns invalid output into idle", () => {
    const parsed = parseAutonomyDecision("not valid json");

    expect(parsed.valid).toBe(false);
    expect(parsed.decision).toEqual({
      intention: "waiting",
      action: "idle",
      message: null,
      reason: "invalid_llm_output"
    });
  });

  it("rejects non-chat decisions that include a message", () => {
    const parsed = parseAutonomyDecision(JSON.stringify({
      action: "status",
      message: "hello",
      reason: "this should fail validation"
    }));

    expect(parsed.valid).toBe(false);
    expect(parsed.decision.action).toBe("idle");
  });
});

describe("createAutonomyController", () => {
  it("does not start ticks when autonomy is disabled", () => {
    const scheduler = {
      setInterval: vi.fn(() => ({ unref: vi.fn() })),
      clearInterval: vi.fn()
    };

    const controller = createAutonomyController({
      bot: createBotStub() as never,
      env: createEnv({ AUTONOMY_ENABLED: false }) as never,
      agent: mockAgent,
      eventLogger: { logEvent: vi.fn() },
      scheduler
    });

    controller.start();

    expect(scheduler.setInterval).not.toHaveBeenCalled();
  });

  it("prevents overlapping actions and enforces cooldown", async () => {
    let now = 0;
    let resolveFirstAction: ((value: {
      action: "status";
      ok: true;
      summary: "status_reported";
      details: {};
    }) => void) | undefined;

    const provider = {
      getDecision: vi.fn(async () => ({
        rawText: JSON.stringify({
          intention: "assess current health and resources",
          action: "status",
          message: null,
          reason: "check current wellbeing"
        })
      }))
    };
    const executeActionImpl = vi.fn(
      () => new Promise((resolve) => {
        resolveFirstAction = resolve as typeof resolveFirstAction;
      })
    );

    const controller = createAutonomyController({
      bot: createBotStub() as never,
      env: createEnv() as never,
      agent: mockAgent,
      eventLogger: { logEvent: vi.fn() },
      clock: { now: () => now },
      providerFactory: () => provider,
      executeActionImpl: executeActionImpl as never
    });

    const firstTick = controller.tick();
    await Promise.resolve();

    expect(await controller.tick()).toBe(false);

    resolveFirstAction?.({
      action: "status",
      ok: true,
      summary: "status_reported",
      details: {}
    });

    expect(await firstTick).toBe(true);
    expect(provider.getDecision).toHaveBeenCalledTimes(1);
    expect(executeActionImpl).toHaveBeenCalledTimes(1);

    now = 10_000;
    expect(await controller.tick()).toBe(false);

    now = 31_000;
    executeActionImpl.mockResolvedValueOnce({
      action: "status",
      ok: true,
      summary: "status_reported",
      details: {}
    });

    expect(await controller.tick()).toBe(true);
    expect(provider.getDecision).toHaveBeenCalledTimes(2);
  });
});
