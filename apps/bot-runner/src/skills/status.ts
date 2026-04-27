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

export function buildStatusMessage(bot: Bot): string {
  const pos = bot.entity.position;
  return [
    `hp=${bot.health}`,
    `food=${bot.food}`,
    `pos=${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}`,
    `inventory=${summarizeInventory(bot)}`
  ].join(" | ");
}
