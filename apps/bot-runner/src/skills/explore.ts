import type { Bot } from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";
import type { EventLogger } from "../log.js";
import { createGroundMovements } from "./movements.js";
import { stopBot } from "./stop.js";

const { goals } = pathfinderModule;

export type ExploreOptions = {
  eventLogger: EventLogger;
  radiusMin?: number;
  radiusMax?: number;
  timeoutMs?: number;
};

export type ExploreResult =
  | { ok: true; destination: { x: number; y: number; z: number }; distanceTravelled: number }
  | { ok: false; reason: "timed_out" | "path_failed" };

export async function explore(bot: Bot, options: ExploreOptions): Promise<ExploreResult> {
  const radiusMin = options.radiusMin ?? 20;
  const radiusMax = options.radiusMax ?? 60;
  const timeoutMs = options.timeoutMs ?? 30_000;

  const origin = bot.entity.position.clone();
  const angle = Math.random() * 2 * Math.PI;
  const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
  const targetX = Math.round(origin.x + Math.cos(angle) * radius);
  const targetZ = Math.round(origin.z + Math.sin(angle) * radius);

  options.eventLogger.logEvent("explore_started", {
    origin: { x: Math.round(origin.x), z: Math.round(origin.z) },
    target: { x: targetX, z: targetZ },
    radius: Math.round(radius)
  });

  bot.pathfinder.setMovements(createGroundMovements(bot, {
    canDig: false,
    maxDropDown: 4,
    allowParkour: false,
    allowFreeMotion: false
  }));

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        stopBot(bot);
        reject(new Error("timed_out"));
      }, timeoutMs);

      bot.pathfinder.goto(new goals.GoalXZ(targetX, targetZ)).then(
        () => { clearTimeout(timeout); resolve(); },
        (err: unknown) => { clearTimeout(timeout); reject(err); }
      );
    });

    stopBot(bot);
    const arrived = bot.entity.position;
    const distanceTravelled = Math.round(arrived.distanceTo(origin));
    options.eventLogger.logEvent("explore_completed", {
      arrived: { x: Math.round(arrived.x), y: Math.round(arrived.y), z: Math.round(arrived.z) },
      distanceTravelled
    });
    return {
      ok: true,
      destination: { x: Math.round(arrived.x), y: Math.round(arrived.y), z: Math.round(arrived.z) },
      distanceTravelled
    };
  } catch (error) {
    stopBot(bot);
    const message = error instanceof Error ? error.message : String(error);
    const reason = message === "timed_out" ? "timed_out" : "path_failed";
    options.eventLogger.logEvent("explore_failed", { reason });
    return { ok: false, reason };
  }
}
