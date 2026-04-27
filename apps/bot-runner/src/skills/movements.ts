import type { Bot } from "mineflayer";
import pathfinderModule from "mineflayer-pathfinder";

const { Movements } = pathfinderModule;

type MovementOptions = {
  canDig: boolean;
  maxDropDown?: number;
  allow1by1towers?: boolean;
  allowFreeMotion?: boolean;
  allowParkour?: boolean;
  canOpenDoors?: boolean;
};

export function createGroundMovements(bot: Bot, options: MovementOptions) {
  const movement = new Movements(bot);

  movement.canDig = options.canDig;
  movement.allow1by1towers = options.allow1by1towers ?? false;
  movement.allowParkour = options.allowParkour ?? false;
  movement.allowFreeMotion = options.allowFreeMotion ?? true;
  movement.canOpenDoors = options.canOpenDoors ?? false;
  movement.maxDropDown = options.maxDropDown ?? 8;

  return movement;
}
