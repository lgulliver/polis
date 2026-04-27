import type { Bot } from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";
import { createGroundMovements } from "./movements.js";

const { goals } = pathfinderModule;

export function followPlayer(bot: Bot, playerName: string): boolean {
  const player = bot.players[playerName];
  const entity = player?.entity;

  if (!entity) {
    return false;
  }

  bot.pathfinder.setMovements(createGroundMovements(bot, {
    canDig: false,
    maxDropDown: 8
  }));
  bot.pathfinder.setGoal(new goals.GoalFollow(entity, 1), true);

  return true;
}
