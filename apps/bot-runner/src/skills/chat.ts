import type { Bot } from "mineflayer";

export function sendChat(bot: Bot, message: string): void {
  bot.chat(message);
}
