import type { Bot } from "mineflayer";
import type { EventPayload } from "./log.js";

type KnownEntity = Bot["entities"][number];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarizeEntity(entity: KnownEntity): string {
  return entity.displayName || entity.name || entity.type;
}

export function buildPerceptionSnapshot(bot: Bot): EventPayload {
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
      .map((player) => player.username),
    nearbyEntities: nearbyEntities.map((entity) => summarizeEntity(entity)),
    inventorySummary: bot.inventory.items().map((item) => ({
      name: item.name,
      count: item.count
    }))
  };
}
