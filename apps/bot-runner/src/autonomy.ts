import type { Bot } from "mineflayer";
import { z } from "zod";
import type { AgentConfig, RuntimeEnv } from "./config.js";
import type { Action } from "./decisions.js";
import { executeAction, type ExecutionResult } from "./execute.js";
import type { EventLogger } from "./log.js";
import { buildPerceptionSnapshot, type PerceptionSnapshot } from "./perceive.js";
import { createDecisionProvider, type DecisionProvider } from "./llm/provider.js";
import { buildAutonomyPrompt, type PromptChatEntry, type PromptSkillResult } from "./llm/prompt.js";
import { createStateMachine, type AgentState } from "./stateMachine.js";

const MAX_RECENT_CHAT = 8;
const MAX_RECENT_SKILL_RESULTS = 6;
const MAX_RECENT_PERCEPTIONS = 4;

const AutonomyDecisionSchema = z.object({
  intention: z.string().trim().min(1).max(500),
  action: z.enum(["chat", "collect_wood", "create_chest", "explore", "idle"]),
  message: z.string().trim().min(1).max(120).nullable(),
  reason: z.string().trim().min(1).max(240)
}).superRefine((value, context) => {
  if (value.action === "chat" && value.message === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "message is required when action is chat",
      path: ["message"]
    });
  }

  if (value.action !== "chat" && value.message !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "message must be null unless action is chat",
      path: ["message"]
    });
  }
});

export type AutonomyDecision = z.infer<typeof AutonomyDecisionSchema>;

type SchedulerHandle = {
  unref?: () => void;
};

type Scheduler = {
  setInterval: (callback: () => void, delayMs: number) => SchedulerHandle;
  clearInterval: (handle: SchedulerHandle) => void;
};

type Clock = {
  now: () => number;
};

type AutonomyControllerInput = {
  bot: Bot;
  env: RuntimeEnv;
  agent: AgentConfig;
  eventLogger: EventLogger;
  scheduler?: Scheduler;
  clock?: Clock;
  providerFactory?: (env: RuntimeEnv) => DecisionProvider;
  executeActionImpl?: typeof executeAction;
};

export type AutonomyController = {
  start: () => void;
  stop: () => void;
  tick: () => Promise<boolean>;
  recordPerception: (snapshot: PerceptionSnapshot) => void;
  recordChat: (sender: string, message: string) => void;
  recordSkillResult: (result: ExecutionResult, source: "manual" | "autonomy") => void;
  getState: () => AgentState;
};

function idleDecision(reason: string): AutonomyDecision {
  return {
    intention: "waiting",
    action: "idle",
    message: null,
    reason
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pushBounded<T>(items: T[], value: T, maxSize: number): void {
  items.push(value);

  if (items.length > maxSize) {
    items.shift();
  }
}

function toAction(decision: AutonomyDecision): Action {
  switch (decision.action) {
    case "chat": {
      return {
        kind: "chat",
        message: decision.message ?? ""
      };
    }
    case "collect_wood": {
      return { kind: "collect_wood" };
    }
    case "create_chest": {
      return { kind: "create_chest" };
    }
    case "explore": {
      return { kind: "explore" };
    }
    case "idle": {
      return { kind: "idle" };
    }
  }
}

export function parseAutonomyDecision(rawText: string): {
  decision: AutonomyDecision;
  valid: boolean;
  error?: string;
} {
  try {
    const parsed = JSON.parse(rawText) as unknown;

    return {
      decision: AutonomyDecisionSchema.parse(parsed),
      valid: true
    };
  } catch (error) {
    return {
      decision: idleDecision("invalid_llm_output"),
      valid: false,
      error: toErrorMessage(error)
    };
  }
}

export function createAutonomyController(input: AutonomyControllerInput): AutonomyController {
  const scheduler = input.scheduler ?? {
    setInterval: (callback: () => void, delayMs: number) => setInterval(callback, delayMs),
    clearInterval: (handle: SchedulerHandle) => clearInterval(handle as ReturnType<typeof setInterval>)
  };
  const clock = input.clock ?? {
    now: () => Date.now()
  };
  const recentChat: PromptChatEntry[] = [];
  const recentSkillResults: PromptSkillResult[] = [];
  const recentPerceptions: PerceptionSnapshot[] = [];
  const tickMs = input.env.AUTONOMY_TICK_SECONDS * 1_000;
  const executeActionImpl = input.executeActionImpl ?? executeAction;
  const stateMachine = createStateMachine("Idle", input.eventLogger, input.agent.name);
  let provider: DecisionProvider | undefined;
  let intervalHandle: SchedulerHandle | undefined;
  let actionInFlight = false;
  let lastDecisionAt = Number.NEGATIVE_INFINITY;

  function recordPerception(snapshot: PerceptionSnapshot): void {
    pushBounded(recentPerceptions, snapshot, MAX_RECENT_PERCEPTIONS);
    stateMachine.applyGuards(snapshot.health, snapshot.food);
  }

  function recordChat(sender: string, message: string): void {
    pushBounded(recentChat, { sender, message }, MAX_RECENT_CHAT);
  }

  function recordSkillResult(result: ExecutionResult, source: "manual" | "autonomy"): void {
    pushBounded(
      recentSkillResults,
      {
        action: result.action,
        ok: result.ok,
        source,
        summary: result.summary,
        details: result.details
      },
      MAX_RECENT_SKILL_RESULTS
    );
  }

  async function tick(): Promise<boolean> {
    if (!input.env.AUTONOMY_ENABLED) {
      return false;
    }

    const now = clock.now();

    if (actionInFlight || now - lastDecisionAt < tickMs) {
      return false;
    }

    actionInFlight = true;
    lastDecisionAt = now;

    try {
      const currentPerception = buildPerceptionSnapshot(input.bot);
      recordPerception(currentPerception);
      input.eventLogger.logEvent("autonomy_tick_started", {
        tickSeconds: input.env.AUTONOMY_TICK_SECONDS
      });

      const prompt = buildAutonomyPrompt({
        agent: input.agent,
        currentState: stateMachine.getState(),
        currentPerception,
        recentPerceptions,
        recentChat,
        recentSkillResults
      });

      input.eventLogger.logEvent("llm_decision_requested", {
        provider: input.env.LLM_PROVIDER,
        recentChatCount: recentChat.length,
        recentSkillResultCount: recentSkillResults.length,
        recentPerceptionCount: recentPerceptions.length
      });

      if (!provider) {
        provider = (input.providerFactory ?? createDecisionProvider)(input.env);
      }

      let decision: AutonomyDecision;
      let rawText = "";

      try {
        rawText = (await provider.getDecision(prompt)).rawText;
        input.eventLogger.logEvent("llm_decision_received", {
          rawText
        });

        const parsedDecision = parseAutonomyDecision(rawText);
        if (!parsedDecision.valid) {
          input.eventLogger.logEvent("llm_decision_invalid", {
            rawText,
            error: parsedDecision.error ?? "invalid_llm_output"
          });
        }

        decision = parsedDecision.decision;
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        input.eventLogger.logEvent("llm_decision_invalid", {
          error: errorMessage
        });
        decision = idleDecision("llm_request_failed");
      }

      const action = toAction(decision);
      input.eventLogger.logEvent("autonomy_action_started", {
        intention: decision.intention,
        action: decision.action,
        reason: decision.reason
      });

      const result = await executeActionImpl({
        bot: input.bot,
        action,
        env: input.env,
        eventLogger: input.eventLogger
      });

      recordSkillResult(result, "autonomy");
      stateMachine.transitionFromAction(decision.action, result.ok);

      const payload = {
        intention: decision.intention,
        action: decision.action,
        reason: decision.reason,
        summary: result.summary,
        ok: result.ok,
        details: result.details
      };

      if (result.ok) {
        input.eventLogger.logEvent("autonomy_action_completed", payload);
      } else {
        input.eventLogger.logEvent("autonomy_action_failed", payload);
      }

      return true;
    } finally {
      actionInFlight = false;
    }
  }

  function start(): void {
    if (!input.env.AUTONOMY_ENABLED || intervalHandle) {
      return;
    }

    intervalHandle = scheduler.setInterval(() => {
      void tick();
    }, tickMs);
    intervalHandle.unref?.();
  }

  function stop(): void {
    if (!intervalHandle) {
      return;
    }

    scheduler.clearInterval(intervalHandle);
    intervalHandle = undefined;
  }

  return {
    start,
    stop,
    tick,
    recordPerception,
    recordChat,
    recordSkillResult,
    getState: stateMachine.getState
  };
}
