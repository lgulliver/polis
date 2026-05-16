import OpenAI from "openai";
import type { DecisionProvider } from "./provider.js";
import type { LlmPrompt } from "./prompt.js";

type CreateOllamaDecisionProviderInput = {
  baseUrl: string;
  model: string;
};

function normalizeMessageContent(content: string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText> | null): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => part.text).join("");
  }

  return "";
}

export function createOllamaDecisionProvider(input: CreateOllamaDecisionProviderInput): DecisionProvider {
  const client = new OpenAI({
    baseURL: input.baseUrl,
    apiKey: "ollama"
  });

  return {
    async getDecision(prompt: LlmPrompt) {
      const completion = await client.chat.completions.create({
        model: input.model,
        temperature: 0.2,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: prompt.system
          },
          {
            role: "user",
            content: prompt.user
          }
        ]
      });

      const rawText = normalizeMessageContent(completion.choices[0]?.message.content ?? null).trim();

      if (!rawText) {
        throw new Error("Ollama returned empty content");
      }

      return {
        rawText
      };
    }
  };
}
