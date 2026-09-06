/**
 * Bot behaviour.
 *
 * A bot is a small state machine over three engine queries: `findPath` for
 * where to walk, `lineOfSight` for whether it can see you, and `hitscan` for
 * whether its shot connects. All three are the same code the renderer and
 * the player use, so a bot can never see through a wall the player cannot,
 * or hit something its own bullet would not reach.
 */
import type { Raycaster } from '@cathode/sdk';

export type Team = 'attack' | 'defend';

export interface Fighter {
  id: number;
  team: Team;
  x: number;
  y: number;
  angle: number;
  health: number;
  alive: boolean;
  /** Bots only: what they are currently doing. */
  state?: BotState;
  path?: { x: number; y: number }[];
  repathIn?: number;
  fireIn?: number;
  reactIn?: number;
  target?: number;
}

export type BotState = 'advance' | 'engage' | 'hold';

export interface BotTuning {
  /** Cells per second. */
  speed: number;
  /** How far a bot can notice someone, in cells. */
  sight: number;
  /** Seconds between shots. */
  fireInterval: number;
  /** Seconds of hesitation after first seeing a target. */
  reaction: number;
  /** Radians of aim error; larger is worse aim. */
  spread: number;
  /** Damage per shot that lands. */
  damage: number;
  /** Seconds between path recalculations. */
  repathInterval: number;
}

export const DIFFICULTY: Record<string, BotTuning> = {
  recruit: {
    speed: 1.5, sight: 9, fireInterval: 0.85, reaction: 0.55,
    spread: 0.16, damage: 12, repathInterval: 1.1,
  },
  regular: {
    speed: 1.9, sight: 12, fireInterval: 0.55, reaction: 0.32,
    spread: 0.09, damage: 18, repathInterval: 0.8,
  },
  veteran: {
    speed: 2.3, sight: 16, fireInterval: 0.38, reaction: 0.18,
    spread: 0.05, damage: 24, repathInterval: 0.6,
  },
};

export interface BotWorld {
  rc: Raycaster;
  fighters: Fighter[];
  /** Where this bot wants to end up when it has nobody to shoot. */
  objectiveFor(bot: Fighter): { x: number; y: number };
  /** Called when a bot's shot connects. */
  onHit(shooter: Fighter, victim: Fighter, damage: number): void;
  /** Called when a bot fires, so the game can draw and sound it. */
  onFire(shooter: Fighter, hitX: number, hitY: number): void;
  rng(): number;
}

const BODY_RADIUS = 0.24;

/** The closest living enemy this bot can actually see. */
export function spotTarget(world: BotWorld, bot: Fighter, sight: number): Fighter | null {
  let best: Fighter | null = null;
  let bestDist = sight;

  for (const other of world.fighters) {
    if (!other.alive || other.team === bot.team) continue;
    const dist = Math.hypot(other.x - bot.x, other.y - bot.y);
    if (dist > bestDist) continue;
    if (!world.rc.lineOfSight(bot.x, bot.y, other.x, other.y)) continue;
    best = other;
    bestDist = dist;
  }
  return best;
}

/** Turn `angle` toward `want` by at most `maxStep` radians. */
export function turnToward(angle: number, want: number, maxStep: number): number {
  let delta = want - angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return angle + Math.max(-maxStep, Math.min(maxStep, delta));
}

/**
 * Walk one step along the bot's path, dropping waypoints as it reaches them.
 * Returns true while there is still somewhere to go.
 */
function followPath(world: BotWorld, bot: Fighter, speed: number, dt: number): boolean {
  while (bot.path && bot.path.length) {
    const next = bot.path[0];
    const tx = next.x + 0.5;
    const ty = next.y + 0.5;
    const dist = Math.hypot(tx - bot.x, ty - bot.y);
    if (dist < 0.3) {
      bot.path.shift();
      continue;
    }
    const step = Math.min(dist, speed * dt);
    const moved = world.rc.slide(
      bot.x, bot.y,
      ((tx - bot.x) / dist) * step,
      ((ty - bot.y) / dist) * step,
      BODY_RADIUS,
    );
    // A bot wedged against geometry drops its path rather than grinding into
    // a wall forever; the next repath routes it around.
    if (Math.hypot(moved.x - bot.x, moved.y - bot.y) < step * 0.25) {
      bot.path = undefined;
      return false;
    }
    bot.x = moved.x;
    bot.y = moved.y;
    bot.angle = turnToward(bot.angle, Math.atan2(ty - bot.y, tx - bot.x), 6 * dt);
    return true;
  }
  return false;
}

/** Advance one bot by `dt`. */
export function stepBot(world: BotWorld, bot: Fighter, tuning: BotTuning, dt: number): void {
  if (!bot.alive) return;

  bot.repathIn = (bot.repathIn ?? 0) - dt;
  bot.fireIn = Math.max(0, (bot.fireIn ?? 0) - dt);

  const target = spotTarget(world, bot, tuning.sight);

  if (target) {
    // Bots do not shoot the instant a target rounds a corner: without a
    // reaction delay they are unbeatable in a way that reads as cheating.
    if (bot.target !== target.id) {
      bot.target = target.id;
      bot.reactIn = tuning.reaction;
    }
    bot.reactIn = Math.max(0, (bot.reactIn ?? 0) - dt);
    bot.state = 'engage';
    bot.path = undefined;

    const want = Math.atan2(target.y - bot.y, target.x - bot.x);
    bot.angle = turnToward(bot.angle, want, 7 * dt);

    // Close the distance a little, so a bot does not stand still and trade.
    const gap = Math.hypot(target.x - bot.x, target.y - bot.y);
    if (gap > 3.5) {
      const step = tuning.speed * 0.6 * dt;
      const moved = world.rc.slide(
        bot.x, bot.y,
        Math.cos(want) * step, Math.sin(want) * step,
        BODY_RADIUS,
      );
      bot.x = moved.x;
      bot.y = moved.y;
    }

    if (bot.reactIn <= 0 && bot.fireIn <= 0 && Math.abs(want - bot.angle) < 0.5) {
      bot.fireIn = tuning.fireInterval;
      const aim = bot.angle + (world.rng() - 0.5) * 2 * tuning.spread;
      const shot = world.rc.hitscan(bot.x, bot.y, aim, tuning.sight, 0.3, bot.id);
      world.onFire(bot, shot.x, shot.y);
      if (shot.billboard) {
        const victim = world.fighters.find((f) => f.id === shot.billboard!.id);
        // Friendly fire is possible and deliberate: a bot that never checks
        // its line will shoot a teammate in the back, exactly as it should.
        if (victim && victim.alive) world.onHit(bot, victim, tuning.damage);
      }
    }
    return;
  }

  bot.target = undefined;
  bot.state = 'advance';

  if ((bot.repathIn ?? 0) <= 0 || !bot.path || !bot.path.length) {
    bot.repathIn = tuning.repathInterval;
    const goal = world.objectiveFor(bot);
    const path = world.rc.findPath({ x: bot.x, y: bot.y }, goal, true);
    // findPath returns the cell it starts in; dropping it stops a bot from
    // walking backwards to the centre of the cell it is already standing in.
    bot.path = path.length > 1 ? path.slice(1) : path;
  }

  if (!followPath(world, bot, tuning.speed, dt)) {
    bot.state = 'hold';
    // Sweep slowly so a holding bot still notices someone entering the room.
    bot.angle += dt * 0.6;
  }
}
