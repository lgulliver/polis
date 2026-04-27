import { config as loadDotEnv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const OptionalCoordinateSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().finite().optional()
);

const EnvSchema = z.object({
  MC_HOST: z.string().min(1, "MC_HOST is required"),
  MC_PORT: z.coerce.number().int().min(1).max(65535),
  MC_VERSION: z.string().optional().transform((value) => value?.trim() || undefined),
  LOG_DIR: z.string().default("logs"),
  BASE_X: OptionalCoordinateSchema,
  BASE_Y: OptionalCoordinateSchema,
  BASE_Z: OptionalCoordinateSchema,
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional()
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
  archetype: z.string().min(1),
  persona: z.string().min(1),
  description: z.string().min(1)
});

export type RuntimeEnv = z.infer<typeof EnvSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
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
