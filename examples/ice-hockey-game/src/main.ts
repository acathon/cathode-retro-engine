/**
 * RETRO ICE HOCKEY — drawn by the engine.
 *
 * This game used to draw itself into a second canvas with a hand-rolled 2D
 * context, slicing frames out of a ripped commercial sprite sheet. Both are
 * gone: the rink is an engine tilemap, everyone on it is an engine sprite,
 * the HUD is the engine's bitmap font, and every pixel is generated in
 * `rink.ts`.
 *
 * Three periods, you against the CPU. Arrows skate, Z shoots when you have
 * the puck and checks when you do not, X passes or switches player.
 */
import { BitmapFont, Cathode, Scene, SoundChannel, Sprite, TileMap } from '@cathode/sdk';
import {
  ACTOR, A_GOALIE, A_PUCK, A_SKATE0, TILE,
  R_BLUE, R_BOARD, R_CREASE, R_GOAL, R_ICE, R_RED,
  actorSheet, rinkSheet, teamBase,
} from './rink';

type Team = 'home' | 'away';
type Phase = 'menu' | 'faceoff' | 'playing' | 'goal' | 'gameover';

const SCREEN_W = 256;
const SCREEN_H = 240;

// The rink sits below the scoreboard, in whole tiles.
const RINK_TOP = 56;
const RINK_TOP_ROW = RINK_TOP / TILE;
// Tall enough to reach the controls line at the bottom of the screen: a
// shorter rink left a third of the display as dead black space.
const RINK_ROWS = 21;
// The map spans the whole screen and leaves the scoreboard rows empty, rather
// than being drawn shorter and shifted with the camera. Offsetting the camera
// puts the tilemap and the sprites in two different coordinate spaces, and
// everyone on the ice ends up below it.
const MAP_ROWS = RINK_TOP_ROW + RINK_ROWS;
const RINK_COLS = SCREEN_W / TILE;

const PLAY_LEFT = 20;
const PLAY_RIGHT = 236;
const PLAY_TOP = RINK_TOP + TILE + 4;
const PLAY_BOTTOM = RINK_TOP + RINK_ROWS * TILE - TILE - 4;
const CENTER_X = SCREEN_W / 2;
const CENTER_Y = (PLAY_TOP + PLAY_BOTTOM) / 2;

// The mouth is deliberately narrow: a goal as tall as the crease is almost
// impossible to defend, and drawn as stacked tiles it reads as a ladder.
const GOAL_TOP = CENTER_Y - 12;
const GOAL_BOTTOM = CENTER_Y + 12;
const CREASE_TOP = CENTER_Y - 26;
const CREASE_BOTTOM = CENTER_Y + 26;
const GOAL_LEFT_X = PLAY_LEFT + 4;
const GOAL_RIGHT_X = PLAY_RIGHT - 4;

const SKATER_ACCEL = 420;
const SKATER_TOP = 78;
const GOALIE_TOP = 52;
const FRICTION = 3.4;
const PUCK_FRICTION = 0.7;
const SHOT_SPEED = 190;
const PASS_SPEED = 140;
const PICKUP_RANGE = 9;
const CHECK_RANGE = 13;
const PERIOD_SECONDS = 90;
const PERIODS = 3;
const FACEOFF_SECONDS = 1.2;
const GOAL_SECONDS = 2.0;

interface Skater {
  team: Team;
  goalie: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  facing: number;
  anim: number;
  cooldown: number;
  sprite: Sprite;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await Cathode.nes(canvas, 3);
  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);

  engine.setBgColor(10, 18, 32);
  engine.setScanlines(true);

  const rink = rinkSheet();
  const rinkHandle = engine.raw.upload_sheet(rink.w, rink.h, TILE, TILE, rink.pixels);
  const actors = actorSheet();
  const actorHandle = engine.raw.upload_sheet(actors.w, actors.h, ACTOR, ACTOR, actors.pixels);

  // --- Rink -----------------------------------------------------------------
  // The rink is a tilemap rather than a background image: it is built from the
  // same six 8x8 tiles the sheet defines, so changing the ice changes one tile
  // rather than a whole picture. It is painted when a match starts and cleared
  // for the menu, because white menu text over white ice cannot be read.
  function paintRink(): void {
    TileMap.clearAll(engine);
    const map = new TileMap(scene, {
      name: 'Rink',
      cols: RINK_COLS,
      rows: MAP_ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
    });
    const layer = map.addLayer('Ice', rinkHandle, false);

    const blueLeft = Math.round((CENTER_X - 52) / TILE);
    const blueRight = Math.round((CENTER_X + 52) / TILE);
    const centreCol = Math.round(CENTER_X / TILE);
    const creaseRows = [Math.floor(CREASE_TOP / TILE), Math.floor(CREASE_BOTTOM / TILE)];
    const goalRows = [Math.floor(GOAL_TOP / TILE), Math.floor(GOAL_BOTTOM / TILE)];

    for (let row = RINK_TOP_ROW; row < MAP_ROWS; row++) {
      for (let col = 0; col < RINK_COLS; col++) {
        let tile = R_ICE;
        if (row === RINK_TOP_ROW || row === MAP_ROWS - 1) tile = R_BOARD;
        else if (col === blueLeft || col === blueRight) tile = R_BLUE;
        else if (col === centreCol) tile = R_RED;

        // The creases, then the goal mouths punched into them.
        const inCrease = row >= creaseRows[0] && row <= creaseRows[1];
        const inGoal = row >= goalRows[0] && row <= goalRows[1];
        if (inCrease && (col <= 2 || col >= RINK_COLS - 3)) tile = R_CREASE;
        if (inGoal && (col === 1 || col === RINK_COLS - 2)) tile = R_GOAL;

        map.setTile(layer, col, row, tile);
      }
    }
    map.commit();
  }

  function clearRink(): void {
    TileMap.clearAll(engine);
  }

  const sfxHit = new SoundChannel(engine, 1);
  const sfxGoal = new SoundChannel(engine, 2);
  const sfxWhistle = new SoundChannel(engine, 3);

  // --- Actors ---------------------------------------------------------------
  function makeSkater(team: Team, goalie: boolean, hx: number, hy: number): Skater {
    const base = teamBase(team);
    const sprite = new Sprite(scene, {
      sheet: actorHandle,
      frame: base + (goalie ? A_GOALIE : A_SKATE0),
      x: hx,
      y: hy,
      layer: goalie ? 8 : 10,
    });
    return {
      team, goalie, x: hx, y: hy, vx: 0, vy: 0,
      homeX: hx, homeY: hy, facing: team === 'home' ? 1 : -1,
      anim: 0, cooldown: 0, sprite,
    };
  }

  const skaters: Skater[] = [
    makeSkater('home', true, GOAL_LEFT_X + 10, CENTER_Y),
    makeSkater('home', false, CENTER_X - 46, CENTER_Y - 26),
    makeSkater('home', false, CENTER_X - 36, CENTER_Y),
    makeSkater('home', false, CENTER_X - 46, CENTER_Y + 26),
    makeSkater('away', true, GOAL_RIGHT_X - 10, CENTER_Y),
    makeSkater('away', false, CENTER_X + 46, CENTER_Y - 26),
    makeSkater('away', false, CENTER_X + 36, CENTER_Y),
    makeSkater('away', false, CENTER_X + 46, CENTER_Y + 26),
  ];

  const puckSprite = new Sprite(scene, {
    sheet: actorHandle, frame: A_PUCK, x: CENTER_X, y: CENTER_Y, layer: 12,
  });
  const puck = { x: CENTER_X, y: CENTER_Y, vx: 0, vy: 0, owner: null as Skater | null };

  // --- Match state ----------------------------------------------------------
  let phase: Phase = 'menu';
  let phaseTimer = 0;
  let clock = PERIOD_SECONDS;
  let period = 1;
  let home = 0;
  let away = 0;
  let banner = '';
  let blink = 0;
  let controlled = skaters[2];

  const teammates = (team: Team) => skaters.filter((s) => s.team === team && !s.goalie);

  function resetPositions(): void {
    for (const s of skaters) {
      s.x = s.homeX;
      s.y = s.homeY;
      s.vx = 0;
      s.vy = 0;
      s.cooldown = 0;
    }
    puck.x = CENTER_X;
    puck.y = CENTER_Y;
    puck.vx = 0;
    puck.vy = 0;
    puck.owner = null;
  }

  function faceoff(text: string): void {
    resetPositions();
    phase = 'faceoff';
    phaseTimer = FACEOFF_SECONDS;
    banner = text;
    sfxWhistle.play(880, 'pulse25', 0.25);
    setTimeout(() => sfxWhistle.stop(), 160);
  }

  function newMatch(): void {
    paintRink();
    home = 0;
    away = 0;
    period = 1;
    clock = PERIOD_SECONDS;
    controlled = skaters[2];
    faceoff('PERIOD 1');
  }

  function scoreGoal(team: Team): void {
    if (team === 'home') home++; else away++;
    phase = 'goal';
    phaseTimer = GOAL_SECONDS;
    banner = team === 'home' ? 'HOME SCORES' : 'AWAY SCORES';
    engine.shake(4, 0.35);
    sfxGoal.play(660, 'triangle', 0.5);
    setTimeout(() => sfxGoal.stop(), 420);
  }

  // --- Movement -------------------------------------------------------------
  function steer(s: Skater, dx: number, dy: number, dt: number): void {
    const mag = Math.hypot(dx, dy);
    if (mag > 0.001) {
      s.vx += (dx / mag) * SKATER_ACCEL * dt;
      s.vy += (dy / mag) * SKATER_ACCEL * dt;
      if (Math.abs(dx) > 0.1) s.facing = Math.sign(dx);
      s.anim += dt * 9;
    }
  }

  function integrate(s: Skater, dt: number): void {
    // Ice: speed bleeds off slowly, which is what makes a rink feel like one.
    const drag = Math.exp(-FRICTION * dt);
    s.vx *= drag;
    s.vy *= drag;

    const top = s.goalie ? GOALIE_TOP : SKATER_TOP;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > top) {
      s.vx = (s.vx / speed) * top;
      s.vy = (s.vy / speed) * top;
    }

    s.x = clamp(s.x + s.vx * dt, PLAY_LEFT, PLAY_RIGHT);
    s.y = clamp(s.y + s.vy * dt, PLAY_TOP, PLAY_BOTTOM);
    s.cooldown = Math.max(0, s.cooldown - dt);
  }

  function shoot(s: Skater): void {
    if (puck.owner !== s) return;
    const targetX = s.team === 'home' ? GOAL_RIGHT_X : GOAL_LEFT_X;
    const dx = targetX - s.x;
    const dy = CENTER_Y + (Math.random() - 0.5) * 26 - s.y;
    const mag = Math.hypot(dx, dy) || 1;
    puck.owner = null;
    puck.vx = (dx / mag) * SHOT_SPEED;
    puck.vy = (dy / mag) * SHOT_SPEED;
    s.cooldown = 0.3;
    sfxHit.play(240, 'noise', 0.3);
    setTimeout(() => sfxHit.stop(), 60);
  }

  function pass(s: Skater): void {
    if (puck.owner !== s) return;
    const mates = teammates(s.team).filter((m) => m !== s);
    if (!mates.length) return;
    // Pass forward when you can: the nearest teammate is often behind you.
    const forward = s.team === 'home' ? 1 : -1;
    const target = mates
      .slice()
      .sort((a, b) => (b.x - a.x) * forward)[0];
    const dx = target.x - s.x;
    const dy = target.y - s.y;
    const mag = Math.hypot(dx, dy) || 1;
    puck.owner = null;
    puck.vx = (dx / mag) * PASS_SPEED;
    puck.vy = (dy / mag) * PASS_SPEED;
    s.cooldown = 0.25;
    sfxHit.play(360, 'pulse25', 0.2);
    setTimeout(() => sfxHit.stop(), 50);
  }

  function check(s: Skater): void {
    for (const other of skaters) {
      if (other.team === s.team || other.goalie) continue;
      if (Math.hypot(other.x - s.x, other.y - s.y) > CHECK_RANGE) continue;
      // A check knocks the target off the puck and off balance.
      other.vx += Math.sign(other.x - s.x || 1) * 90;
      other.vy += Math.sign(other.y - s.y || 1) * 60;
      other.cooldown = 0.5;
      if (puck.owner === other) {
        puck.owner = null;
        puck.vx = other.vx * 0.6;
        puck.vy = other.vy * 0.6;
      }
      engine.shake(2, 0.12);
      sfxHit.play(140, 'noise', 0.35);
      setTimeout(() => sfxHit.stop(), 80);
      return;
    }
  }

  // --- CPU ------------------------------------------------------------------
  function driveBot(s: Skater, dt: number): void {
    if (s.goalie) {
      // Hold the crease and track the puck's height.
      const restX = s.team === 'home' ? GOAL_LEFT_X + 10 : GOAL_RIGHT_X - 10;
      steer(s, (restX - s.x) * 0.08, (clamp(puck.y, GOAL_TOP, GOAL_BOTTOM) - s.y) * 0.12, dt);
      if (puck.owner === s) {
        // Goalies clear rather than carry.
        puck.owner = null;
        puck.vx = (s.team === 'home' ? 1 : -1) * SHOT_SPEED * 0.8;
        puck.vy = (Math.random() - 0.5) * 90;
      }
      return;
    }

    if (puck.owner === s) {
      const targetX = s.team === 'home' ? GOAL_RIGHT_X : GOAL_LEFT_X;
      steer(s, targetX - s.x, CENTER_Y - s.y, dt);
      if (Math.abs(targetX - s.x) < 64 && s.cooldown <= 0) shoot(s);
      return;
    }

    const carrier = puck.owner;
    if (carrier && carrier.team !== s.team) {
      // Nearest defender pressures the carrier; the rest hold shape.
      const nearest = teammates(s.team)
        .sort((a, b) => Math.hypot(carrier.x - a.x, carrier.y - a.y)
          - Math.hypot(carrier.x - b.x, carrier.y - b.y))[0];
      if (nearest === s) {
        steer(s, carrier.x - s.x, carrier.y - s.y, dt);
        if (Math.hypot(carrier.x - s.x, carrier.y - s.y) < CHECK_RANGE && s.cooldown <= 0) {
          check(s);
          s.cooldown = 0.7;
        }
        return;
      }
      steer(s, s.homeX - s.x, s.homeY - s.y, dt);
      return;
    }

    if (!carrier) {
      // Only the closest player chases. Everyone chasing turns the match into
      // a scrum around the puck and leaves the rink empty everywhere else.
      const closest = teammates(s.team)
        .sort((a, b) => Math.hypot(puck.x - a.x, puck.y - a.y)
          - Math.hypot(puck.x - b.x, puck.y - b.y))[0];
      if (closest === s) steer(s, puck.x - s.x, puck.y - s.y, dt);
      else steer(s, s.homeX - s.x, s.homeY - s.y, dt);
      return;
    }
    // A teammate has it: get open ahead of them.
    const forward = s.team === 'home' ? 30 : -30;
    steer(s, carrier.x + forward - s.x, s.homeY - s.y, dt);
  }

  // --- Puck -----------------------------------------------------------------
  function updatePuck(dt: number): void {
    if (puck.owner) {
      const o = puck.owner;
      puck.x = o.x + o.facing * 7;
      puck.y = o.y + 4;
      puck.vx = 0;
      puck.vy = 0;
      return;
    }

    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;
    const drag = Math.exp(-PUCK_FRICTION * dt);
    puck.vx *= drag;
    puck.vy *= drag;

    if (puck.y < PLAY_TOP) { puck.y = PLAY_TOP; puck.vy = Math.abs(puck.vy) * 0.7; }
    if (puck.y > PLAY_BOTTOM) { puck.y = PLAY_BOTTOM; puck.vy = -Math.abs(puck.vy) * 0.7; }

    // Goals: past the line and between the posts.
    if (puck.x <= GOAL_LEFT_X && puck.y > GOAL_TOP && puck.y < GOAL_BOTTOM) {
      scoreGoal('away');
      return;
    }
    if (puck.x >= GOAL_RIGHT_X && puck.y > GOAL_TOP && puck.y < GOAL_BOTTOM) {
      scoreGoal('home');
      return;
    }
    if (puck.x < PLAY_LEFT) { puck.x = PLAY_LEFT; puck.vx = Math.abs(puck.vx) * 0.7; }
    if (puck.x > PLAY_RIGHT) { puck.x = PLAY_RIGHT; puck.vx = -Math.abs(puck.vx) * 0.7; }

    // Pick-ups, once the puck is slow enough to gather.
    if (Math.hypot(puck.vx, puck.vy) < 150) {
      for (const s of skaters) {
        if (s.cooldown > 0) continue;
        if (Math.hypot(s.x - puck.x, s.y - puck.y) < PICKUP_RANGE) {
          puck.owner = s;
          return;
        }
      }
    }
  }

  // --- Presentation ---------------------------------------------------------
  function syncSprites(): void {
    for (const s of skaters) {
      const base = teamBase(s.team);
      const frame = s.goalie
        ? base + A_GOALIE
        : base + A_SKATE0 + (Math.floor(s.anim) % 4);
      s.sprite.frame = frame;
      s.sprite.flipX = s.facing < 0;
      s.sprite.x = Math.round(s.x - ACTOR / 2);
      s.sprite.y = Math.round(s.y - ACTOR / 2);
    }
    puckSprite.x = Math.round(puck.x - ACTOR / 2);
    puckSprite.y = Math.round(puck.y - ACTOR / 2);
  }

  function drawHud(): void {
    font.draw('HOME', 14, 8, 1);
    font.draw(String(home).padStart(2, '0'), 22, 22, 1);
    font.draw('AWAY', 210, 8, 1);
    font.draw(String(away).padStart(2, '0'), 220, 22, 1);

    font.draw(`PERIOD ${period}`, 100, 8, 1);
    const seconds = Math.max(0, Math.ceil(clock));
    font.draw(
      `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      112, 22, 1,
    );

    if (banner) font.draw(banner, CENTER_X - banner.length * 4, 40, 1);

    font.draw('Z SHOOT/CHECK   X PASS/SWITCH', 20, SCREEN_H - 14, 1);
  }

  function drawMenu(): void {
    font.draw('RETRO ICE HOCKEY', 60, 60, 1);
    font.draw('YOU VS CPU', 88, 84, 1);
    if (blink % 1 < 0.6) font.draw('PRESS ENTER', 84, 120, 1);
    font.draw('ARROWS SKATE', 80, 150, 1);
    font.draw('Z SHOOT OR CHECK', 64, 162, 1);
    font.draw('X PASS OR SWITCH', 64, 174, 1);
  }

  function showPlayers(visible: boolean): void {
    for (const s of skaters) s.sprite.active = visible;
    puckSprite.active = visible;
  }

  // --- Loop -----------------------------------------------------------------
  showPlayers(false);

  (window as unknown as Record<string, unknown>).__hockey = {
    state: () => ({
      phase, period, clock, home, away,
      puck: { x: puck.x, y: puck.y, owned: puck.owner !== null },
      controlled: skaters.indexOf(controlled),
      skaters: skaters.map((s) => ({ team: s.team, goalie: s.goalie, x: s.x, y: s.y })),
    }),
    start: () => newMatch(),
    givePuck: () => { puck.owner = controlled; },
    placePuck: (x: number, y: number, vx = 0, vy = 0) => {
      puck.owner = null;
      puck.x = x; puck.y = y; puck.vx = vx; puck.vy = vy;
    },
  };

  engine.loop((dt) => {
    blink += dt;
    scene.update(dt);
    const input = engine.input;

    if (phase === 'menu') {
      showPlayers(false);
      clearRink();
      if (input.justPressed(0, 'start') || input.justPressed(0, 'a')) newMatch();
      drawMenu();
      return;
    }

    showPlayers(true);

    if (phase === 'gameover') {
      // Cleared for the same reason the menu is: white text over white ice.
      clearRink();
      showPlayers(false);
      drawHud();
      font.draw(home > away ? 'HOME WINS' : away > home ? 'AWAY WINS' : 'A DRAW', 96, 100, 1);
      if (blink % 1 < 0.6) font.draw('PRESS ENTER', 84, 120, 1);
      if (input.justPressed(0, 'start')) newMatch();
      return;
    }

    if (phase === 'faceoff' || phase === 'goal') {
      phaseTimer -= dt;
      if (phaseTimer <= 0) {
        if (phase === 'goal') faceoff('CENTRE ICE');
        else { phase = 'playing'; banner = ''; }
      }
      syncSprites();
      drawHud();
      return;
    }

    // --- Playing ------------------------------------------------------------
    clock -= dt;
    if (clock <= 0) {
      if (period >= PERIODS) {
        phase = 'gameover';
        banner = '';
      } else {
        period++;
        clock = PERIOD_SECONDS;
        faceoff(`PERIOD ${period}`);
      }
      return;
    }

    let dx = 0;
    let dy = 0;
    if (input.held(0, 'left')) dx -= 1;
    if (input.held(0, 'right')) dx += 1;
    if (input.held(0, 'up')) dy -= 1;
    if (input.held(0, 'down')) dy += 1;
    steer(controlled, dx, dy, dt);

    if (input.justPressed(0, 'a')) {
      if (puck.owner === controlled) shoot(controlled);
      else check(controlled);
    }
    if (input.justPressed(0, 'b')) {
      if (puck.owner === controlled) {
        pass(controlled);
      } else {
        // Switch to whoever is nearest the puck, which is what the player
        // means by "switch" almost every time.
        controlled = teammates('home')
          .sort((a, b) => Math.hypot(puck.x - a.x, puck.y - a.y)
            - Math.hypot(puck.x - b.x, puck.y - b.y))[0];
      }
    }

    for (const s of skaters) {
      if (s !== controlled) driveBot(s, dt);
      integrate(s, dt);
    }
    updatePuck(dt);
    syncSprites();
    drawHud();

    // A marker under the skater you are driving, so you can find yourself.
    font.draw('^', Math.round(controlled.x) - 4, Math.round(controlled.y) + 10, 1);
  });
}

init().catch((err) => {
  const el = document.getElementById('status');
  if (el) el.textContent = `FAILED TO START: ${err}`;
});
