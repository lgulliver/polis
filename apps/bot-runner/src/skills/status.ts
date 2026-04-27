import type { Bot } from "mineflayer";

export type InventoryEntry = {
  name: string;
  count: number;
};

export type StatusSnapshot = {
  health: number;
  food: number;
  position: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  usefulInventory: InventoryEntry[];
};

function listInventory(bot: Bot): InventoryEntry[] {
  const items = bot.inventory.items();

  return items.map((item) => ({
    name: item.name,
    count: item.count
  }));
}

function summarizeInventory(items: InventoryEntry[]): string {

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

function formatPosition(position: StatusSnapshot["position"]): string {
  const x = position.x ?? Number.NaN;
  const y = position.y ?? Number.NaN;
  const z = position.z ?? Number.NaN;

  return [formatCoordinate(x), formatCoordinate(y), formatCoordinate(z)].join(",");
}

export function buildStatusSnapshot(bot: Bot): StatusSnapshot {
  const pos = bot.entity?.position;

  if (!pos) {
    return {
      health: bot.health,
      food: bot.food,
      position: {
        x: null,
        y: null,
        z: null
      },
      usefulInventory: listInventory(bot)
    };
  }

  return {
    health: bot.health,
    food: bot.food,
    position: {
      x: Number.isFinite(pos.x) ? pos.x : null,
      y: Number.isFinite(pos.y) ? pos.y : null,
      z: Number.isFinite(pos.z) ? pos.z : null
    },
    usefulInventory: listInventory(bot)
  };
}

export function buildStatusMessage(bot: Bot): string {
  const snapshot = buildStatusSnapshot(bot);

  return [
    `hp=${snapshot.health}`,
    `food=${snapshot.food}`,
    `pos=${formatPosition(snapshot.position)}`,
    `inventory=${summarizeInventory(snapshot.usefulInventory)}`
  ].join(" | ");
}
