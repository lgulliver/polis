import type { Bot } from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";

const { Movements } = pathfinderModule;

type MovementOptions = {
  canDig: boolean;
  maxDropDown?: number;
};

export function createGroundMovements(bot: Bot, options: MovementOptions) {
  const movement = new Movements(bot);

  movement.canDig = options.canDig;
  movement.allow1by1towers = false;
  movement.allowParkour = false;
  movement.allowFreeMotion = true;
  movement.maxDropDown = options.maxDropDown ?? 8;

  return movement;
}
