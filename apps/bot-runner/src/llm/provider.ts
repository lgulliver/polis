import type { RuntimeEnv } from "../config.js";
import { createOpenAiDecisionProvider } from "./openai.js";
import type { LlmPrompt } from "./prompt.js";

export type DecisionProviderResponse = {
  rawText: string;
};

export type DecisionProvider = {
  getDecision: (prompt: LlmPrompt) => Promise<DecisionProviderResponse>;
};

export function createDecisionProvider(env: RuntimeEnv): DecisionProvider {
  switch (env.LLM_PROVIDER) {
    case "openai": {
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required when AUTONOMY_ENABLED=true and LLM_PROVIDER=openai");
      }

      return createOpenAiDecisionProvider({
        apiKey: env.OPENAI_API_KEY
      });
    }
  }
}