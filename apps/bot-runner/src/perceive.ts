import type { Bot } from "mineflayer";
import type { EventPayload } from "./log.js";

type KnownEntity = Bot["entities"][number];

export type PerceptionSnapshot = {
  health: number;
  food: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  nearbyPlayers: Array<{ name: string; distance: number }>;
  nearbyEntities: Array<{ name: string; distance: number }>;
  inventorySummary: Array<{
    name: string;
    count: number;
  }>;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarizeEntity(entity: KnownEntity): string {
  return entity.displayName || entity.name || entity.type;
}

export function buildPerceptionSnapshot(bot: Bot): PerceptionSnapshot & EventPayload {
  const nearbyEntities = Object.values(bot.entities)
    .filter((entity) => entity.id !== bot.entity.id)
    .sort((left, right) => left.position.distanceTo(bot.entity.position) - right.position.distanceTo(bot.entity.position))
    .slice(0, 8);

  return {
    health: bot.health,
    food: bot.food,
    position: {
      x: round1(bot.entity.position.x),
      y: round1(bot.entity.position.y),
      z: round1(bot.entity.position.z)
    },
    nearbyPlayers: Object.values(bot.players)
      .filter((player) => player.username !== bot.username && player.entity)
      .map((player) => ({
        name: player.username,
        distance: Math.round(player.entity!.position.distanceTo(bot.entity.position))
      })),
    nearbyEntities: nearbyEntities.map((entity) => ({
      name: summarizeEntity(entity),
      distance: Math.round(entity.position.distanceTo(bot.entity.position))
    })),
    inventorySummary: bot.inventory.items().map((item) => ({
      name: item.name,
      count: item.count
    }))
  };
}
