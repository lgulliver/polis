import type { Bot } from "mineflayer";

export function stopBot(bot: Bot): void {
  bot.pathfinder.stop();
  bot.clearControlStates();
}
