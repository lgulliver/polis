import { mkdirSync } from "node:fs";
import path from "node:path";
import pino from "pino";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EventPayload = Record<string, JsonValue>;

export type EventLogger = {
  logEvent: (type: string, payload?: EventPayload) => void;
};

export function createLoggers(logDir: string): { logger: pino.Logger; eventLogger: EventLogger } {
  mkdirSync(logDir, { recursive: true });

  const appLogger = pino({
    name: "polis-bot-runner",
    level: process.env.LOG_LEVEL ?? "info"
  });

  const eventStream = pino.destination({
    dest: path.join(logDir, "events.jsonl"),
    mkdir: true,
    sync: false
  });

  const eventLogger = pino(
    {
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime
    },
    eventStream
  );

  return {
    logger: appLogger,
    eventLogger: {
      logEvent(type, payload = {}) {
        eventLogger.info({ type, ...payload });
      }
    }
  };
}
