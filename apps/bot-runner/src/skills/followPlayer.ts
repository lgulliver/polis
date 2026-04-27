import type { Bot } from "mineflayer";
import { goals, Movements } from "mineflayer-pathfinder";

export function followPlayer(bot: Bot, playerName: string): boolean {
  const player = bot.players[playerName];
  const entity = player?.entity;

  if (!entity) {
    return false;
  }

  const movement = new Movements(bot);
  movement.canDig = false;
  movement.allow1by1towers = false;
  bot.pathfinder.setMovements(movement);
  bot.pathfinder.setGoal(new goals.GoalFollow(entity, 1), true);

  return true;
}
