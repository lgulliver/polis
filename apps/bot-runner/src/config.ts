import { config as loadDotEnv } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const OptionalCoordinateSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().finite().optional()
);

const OptionalBooleanSchema = z.preprocess((value) => {
  if (value === "") {
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean().default(false));

const LlmProviderSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["openai", "ollama"]).default("openai")
);

const EnvSchema = z.object({
  MC_HOST: z.string().min(1, "MC_HOST is required"),
  MC_PORT: z.coerce.number().int().min(1).max(65535),
  MC_VERSION: z.string().optional().transform((value) => value?.trim() || undefined),
  LOG_DIR: z.string().default("logs"),
  BASE_X: OptionalCoordinateSchema,
  BASE_Y: OptionalCoordinateSchema,
  BASE_Z: OptionalCoordinateSchema,
  AUTONOMY_ENABLED: OptionalBooleanSchema,
  LLM_PROVIDER: LlmProviderSchema,
  AUTONOMY_TICK_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434/v1"),
  OLLAMA_MODEL: z.string().default("qwen2.5:7b")
}).superRefine((env, context) => {
  const coordinates = [env.BASE_X, env.BASE_Y, env.BASE_Z];
  const configuredCount = coordinates.filter((value) => value !== undefined).length;

  if (configuredCount !== 0 && configuredCount !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "BASE_X, BASE_Y, and BASE_Z must all be provided together"
    });
  }
});

const AgentConfigSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  role: z.string().min(1),
  archetype: z.string().min(1),
  persona: z.string().min(1),
  description: z.string().min(1),
  mission: z.string().min(1).optional(),
  language: z.object({
    style: z.string().min(1)
  })
});

export type RuntimeEnv = z.infer<typeof EnvSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type LlmProviderName = RuntimeEnv["LLM_PROVIDER"];
export type BaseLocation = {
  x: number;
  y: number;
  z: number;
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../../");

loadDotEnv({ path: path.join(repoRoot, ".env") });

export function getRepoRoot(): string {
  return repoRoot;
}

export function loadRuntimeEnv(): RuntimeEnv {
  return EnvSchema.parse(process.env);
}

export function getConfiguredBaseLocation(env: RuntimeEnv): BaseLocation | undefined {
  if (env.BASE_X === undefined || env.BASE_Y === undefined || env.BASE_Z === undefined) {
    return undefined;
  }

  return {
    x: env.BASE_X,
    y: env.BASE_Y,
    z: env.BASE_Z
  };
}

export function loadAgentConfig(agentName: string): AgentConfig {
  const agentFile = path.join(repoRoot, "configs", "agents", `${agentName}.json`);
  const raw = readFileSync(agentFile, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return AgentConfigSchema.parse(parsed);
}

export function listConfiguredAgentNames(): string[] {
  return readdirSync(path.join(repoRoot, "configs", "agents"))
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.parse(entry).name);
}
