/**
 * The rink and everyone on it, drawn in code.
 *
 * This game used to ship a ripped commercial sprite sheet and slice frames
 * out of it by pixel coordinate. Besides the licensing problem, the
 * coordinates had drifted: the "portraits" on the title screen were sampling
 * the sheet's lettering, which is why two giant letters sat across the menu.
 * Everything here is generated instead, so there is nothing to drift from.
 */

export const TILE = 8;
export const ACTOR = 16;

// --- Rink tiles (8x8) ------------------------------------------------------
export const R_ICE = 1;
export const R_BOARD = 2;
export const R_BLUE = 3;
export const R_RED = 4;
export const R_CREASE = 5;
export const R_GOAL = 6;
const RINK_TILES = 6;

const ICE = [226, 240, 250];
const ICE_DARK = [198, 218, 236];

function setPixel(px: Uint8Array, w: number, tile: number, size: number, x: number, y: number, c: number[]) {
  const i = ((y * w) + tile * size + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = c[3] ?? 255;
}

/** Six 8x8 rink tiles: ice, boards, both lines, the crease and the goal. */
export function rinkSheet(): { pixels: Uint8Array; w: number; h: number } {
  const w = TILE * RINK_TILES;
  const px = new Uint8Array(w * TILE * 4);
  const put = (t: number, x: number, y: number, c: number[]) => setPixel(px, w, t - 1, TILE, x, y, c);

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Ice, with a faint scuff so a flat white sheet still reads as a surface.
      const scuff = (x * 5 + y * 3) % 11 === 0;
      put(R_ICE, x, y, scuff ? ICE_DARK : ICE);

      // Boards: a dark wall with a white kickplate along the bottom.
      put(R_BOARD, x, y, y < 5 ? [64, 72, 92] : [214, 226, 238]);

      put(R_BLUE, x, y, x >= 2 && x <= 5 ? [58, 120, 210] : ICE);
      put(R_RED, x, y, x >= 3 && x <= 4 ? [198, 54, 62] : ICE);

      // Crease: pale blue ice with a red edge on the goal side.
      put(R_CREASE, x, y, [188, 216, 244]);

      // Goal: the mouth, dark with a red frame.
      const frame = x === 0 || x === TILE - 1 || y === 0 || y === TILE - 1;
      put(R_GOAL, x, y, frame ? [198, 54, 62] : [30, 36, 48]);
    }
  }

  return { pixels: px, w, h: TILE };
}

// --- Actors (16x16) --------------------------------------------------------
export const A_SKATE0 = 0;    // 4 skating frames per team
export const A_GOALIE = 4;    // 1 goalie frame per team
const PER_TEAM = 5;
export const A_PUCK = PER_TEAM * 2;
const ACTOR_TILES = PER_TEAM * 2 + 1;

export interface TeamColours {
  jersey: number[];
  trim: number[];
  skin: number[];
}

export const HOME: TeamColours = {
  jersey: [46, 108, 196],
  trim: [186, 224, 255],
  skin: [226, 186, 150],
};

export const AWAY: TeamColours = {
  jersey: [198, 62, 66],
  trim: [255, 210, 214],
  skin: [214, 170, 136],
};

/**
 * Eleven 16x16 frames: four skating poses and a goalie for each team, then
 * the puck. The skating cycle is a lean plus a stick swing — at this size
 * that reads as motion better than moving legs would.
 */
export function actorSheet(): { pixels: Uint8Array; w: number; h: number } {
  const w = ACTOR * ACTOR_TILES;
  const px = new Uint8Array(w * ACTOR * 4);
  const put = (t: number, x: number, y: number, c: number[]) => setPixel(px, w, t, ACTOR, x, y, c);
  const clear = (t: number, x: number, y: number) => {
    const i = ((y * w) + t * ACTOR + x) * 4;
    px[i + 3] = 0;
  };

  const drawSkater = (tile: number, team: TeamColours, lean: number, stick: number) => {
    for (let y = 0; y < ACTOR; y++) {
      for (let x = 0; x < ACTOR; x++) clear(tile, x, y);
    }

    const cx = 8 + lean;
    // Helmet, then jersey, then legs, drawn top down.
    for (let y = 1; y < 5; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) put(tile, x, y, y < 3 ? team.trim : team.skin);
    }
    for (let y = 5; y < 11; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) {
        put(tile, x, y, Math.abs(x - cx) === 3 ? team.trim : team.jersey);
      }
    }
    for (let y = 11; y < 15; y++) {
      put(tile, cx - 2, y, [40, 44, 56]);
      put(tile, cx + 2, y, [40, 44, 56]);
    }
    // Blades.
    for (let x = cx - 3; x <= cx - 1; x++) put(tile, x, 15, [210, 226, 240]);
    for (let x = cx + 1; x <= cx + 3; x++) put(tile, x, 15, [210, 226, 240]);

    // Stick: swings forward across the cycle so the shot has a wind-up.
    for (let i = 0; i < 6; i++) {
      const sx = cx + 3 + i;
      const sy = 9 + Math.round(i * stick);
      if (sx < ACTOR && sy >= 0 && sy < ACTOR) put(tile, sx, sy, [150, 108, 60]);
    }
  };

  const drawGoalie = (tile: number, team: TeamColours) => {
    for (let y = 0; y < ACTOR; y++) {
      for (let x = 0; x < ACTOR; x++) clear(tile, x, y);
    }
    for (let y = 1; y < 5; y++) {
      for (let x = 6; x <= 9; x++) put(tile, x, y, y < 3 ? team.trim : team.skin);
    }
    // A body, with a leg pad standing clear on each side. Filling the whole
    // 16x16 with jersey made the goalie a featureless coloured box.
    for (let y = 5; y < 13; y++) {
      for (let x = 6; x <= 9; x++) put(tile, x, y, team.jersey);
    }
    for (let y = 6; y < 15; y++) {
      for (let x = 2; x <= 4; x++) put(tile, x, y, team.trim);
      for (let x = 11; x <= 13; x++) put(tile, x, y, team.trim);
    }
    // Blocker and catching glove, then the stick across the crease.
    for (let y = 7; y < 10; y++) put(tile, 5, y, [40, 44, 56]);
    for (let y = 7; y < 10; y++) put(tile, 10, y, [40, 44, 56]);
    for (let x = 1; x < 15; x++) put(tile, x, 14, [150, 108, 60]);
    for (let x = 6; x <= 9; x++) put(tile, x, 15, [210, 226, 240]);
  };

  [HOME, AWAY].forEach((team, t) => {
    const base = t * PER_TEAM;
    const leans = [0, 1, 0, -1];
    const sticks = [0, 0.4, 0.8, 0.4];
    for (let f = 0; f < 4; f++) drawSkater(base + A_SKATE0 + f, team, leans[f], sticks[f]);
    drawGoalie(base + A_GOALIE, team);
  });

  // Puck: a small dark disc, centred so it lines up with a skater's stick.
  for (let y = 0; y < ACTOR; y++) {
    for (let x = 0; x < ACTOR; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d <= 2.6) put(A_PUCK, x, y, d > 1.8 ? [14, 16, 22] : [40, 44, 56]);
      else clear(A_PUCK, x, y);
    }
  }

  return { pixels: px, w, h: ACTOR };
}

/** First frame index for a team's actors in the sheet built above. */
export const teamBase = (team: 'home' | 'away') => (team === 'home' ? 0 : PER_TEAM);
