import type { Bot } from "mineflayer";

function summarizeInventory(bot: Bot): string {
  const items = bot.inventory.items();

  if (items.length === 0) {
    return "empty";
  }

  return items
    .map((item) => `${item.name}x${item.count}`)
    .join(", ");
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "unknown";
}

function formatPosition(bot: Bot): string {
  const pos = bot.entity?.position;

  if (!pos) {
    return "unknown";
  }

  return [formatCoordinate(pos.x), formatCoordinate(pos.y), formatCoordinate(pos.z)].join(",");
}

export function buildStatusMessage(bot: Bot): string {
  return [
    `hp=${bot.health}`,
    `food=${bot.food}`,
    `pos=${formatPosition(bot)}`,
    `inventory=${summarizeInventory(bot)}`
  ].join(" | ");
}
