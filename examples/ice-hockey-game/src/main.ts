import { Cathode, SoundChannel } from '@cathode/sdk';

type Team = 'home' | 'away';
type Role = 'skater' | 'goalie';
type GameState = 'menu' | 'controls' | 'faceoff' | 'playing' | 'goal' | 'intermission' | 'paused' | 'gameover';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasBundle {
  raw: HTMLImageElement;
  sprites: HTMLCanvasElement;
}

interface Skater {
  id: string;
  name: string;
  team: Team;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  topSpeed: number;
  accel: number;
  facing: number;
  animTime: number;
  cooldown: number;
  stealLock: number;
  spriteAtlas: CanvasImageSource;
  homeX: number;
  homeY: number;
  laneBias: number;
  frames: Rect[];
  idleFrame: Rect;
}

interface PuckState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Skater | null;
  radius: number;
  trail: Array<{ x: number; y: number; life: number }>;
}

const SCREEN_W = 256;
const SCREEN_H = 240;
const SCALE = 3;

const RINK_SOURCE: Rect = { x: 8, y: 176, w: 512, h: 240 };
const RINK_DEST: Rect = { x: 0, y: 56, w: 256, h: 120 };

const PLAY_LEFT = 18;
const PLAY_RIGHT = 238;
const PLAY_TOP = 66;
const PLAY_BOTTOM = 166;
const CENTER_X = 128;
const CENTER_Y = 116;
const GOAL_TOP = 97;
const GOAL_BOTTOM = 135;

const HOME_SKATER_FRAMES: Rect[] = [
  { x: 8, y: 33, w: 16, h: 15 },
  { x: 33, y: 33, w: 15, h: 15 },
  { x: 56, y: 33, w: 16, h: 15 },
  { x: 80, y: 33, w: 16, h: 15 },
];

const AWAY_SKATER_FRAMES: Rect[] = [
  { x: 8, y: 9, w: 15, h: 15 },
  { x: 33, y: 9, w: 15, h: 15 },
  { x: 56, y: 9, w: 14, h: 15 },
  { x: 81, y: 9, w: 12, h: 15 },
];

const HOME_GOALIE_FRAMES: Rect[] = [
  { x: 89, y: 128, w: 14, h: 16 },
  { x: 112, y: 129, w: 15, h: 15 },
  { x: 136, y: 129, w: 16, h: 15 },
];

const AWAY_GOALIE_FRAMES: Rect[] = [
  { x: 281, y: 128, w: 14, h: 16 },
  { x: 304, y: 128, w: 15, h: 16 },
  { x: 329, y: 128, w: 14, h: 16 },
];

const PORTRAIT_HOME: Rect = { x: 44, y: 440, w: 20, h: 40 };
const PORTRAIT_AWAY: Rect = { x: 152, y: 440, w: 23, h: 40 };
const PUCK_RECT: Rect = { x: 249, y: 137, w: 6, h: 6 };

const TEAM_COLORS = {
  home: '#57b6ff',
  away: '#ff6a6a',
  gold: '#ffe27b',
  text: '#d3ebff',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

function normalize(x: number, y: number): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.0001) return { x: 0, y: 0 };
  return { x: x / magnitude, y: y / magnitude };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((ch) => ch + ch).join('')
    : clean;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function tintAlphaKeyedImage(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create atlas canvas');

  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const [bgR, bgG, bgB] = [data.data[0], data.data[1], data.data[2]];
  for (let index = 0; index < data.data.length; index += 4) {
    if (data.data[index] === bgR && data.data[index + 1] === bgG && data.data[index + 2] === bgB) {
      data.data[index + 3] = 0;
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function createTintedAtlas(base: HTMLCanvasElement, darkHex: string, midHex: string, lightHex: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create tinted atlas canvas');

  ctx.drawImage(base, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dark = hexToRgb(darkHex);
  const mid = hexToRgb(midHex);
  const light = hexToRgb(lightHex);

  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = image.data[index + 3];
    if (alpha === 0) continue;
    const brightness = (image.data[index] + image.data[index + 1] + image.data[index + 2]) / 3;
    const target = brightness < 90 ? dark : brightness < 170 ? mid : light;
    image.data[index] = target[0];
    image.data[index + 1] = target[1];
    image.data[index + 2] = target[2];
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function loadAtlas(url: string): Promise<AtlasBundle> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ raw: image, sprites: tintAlphaKeyedImage(image) });
    image.onerror = reject;
    image.src = url;
  });
}

function drawAtlasSprite(
  ctx: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  rect: Rect,
  x: number,
  y: number,
  scale = 1,
  flipX = false,
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(
    atlas,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    flipX ? -rect.w * scale : 0,
    0,
    rect.w * scale,
    rect.h * scale,
  );
  ctx.restore();
}

function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  align: CanvasTextAlign = 'left',
): void {
  ctx.save();
  ctx.font = `${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(8, 17, 31, 0.9)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function chirp(channel: SoundChannel, freq: number, waveform: 'pulse50' | 'pulse25' | 'triangle' | 'noise', vol: number, duration: number): void {
  channel.play(freq, waveform, vol);
  window.setTimeout(() => channel.stop(), duration);
}

async function init(): Promise<void> {
  const gameCanvas = document.getElementById('game');
  const overlayCanvas = document.getElementById('overlay');
  if (!(gameCanvas instanceof HTMLCanvasElement) || !(overlayCanvas instanceof HTMLCanvasElement)) {
    throw new Error('Game canvases are missing');
  }

  const engine = await Cathode.nes(gameCanvas, SCALE);
  const rawCtx = overlayCanvas.getContext('2d');
  if (!rawCtx) throw new Error('Failed to create overlay context');
  const ctx: CanvasRenderingContext2D = rawCtx;
  ctx.imageSmoothingEnabled = false;
  overlayCanvas.style.width = `${SCREEN_W * SCALE}px`;
  overlayCanvas.style.height = `${SCREEN_H * SCALE}px`;

  engine.setBgColor(6, 16, 28);
  engine.setScanlines(true);

  const atlasUrl = new URL('../NES - Ice Hockey - Miscellaneous - General Sprites.png', import.meta.url).href;
  const atlas = await loadAtlas(atlasUrl);
  const homeAtlas = createTintedAtlas(atlas.sprites, '#0d4f85', '#2b86d6', '#b7ecff');
  const awayAtlasA = createTintedAtlas(atlas.sprites, '#8a1420', '#d13d46', '#ffd1db');
  const awayAtlasB = createTintedAtlas(atlas.sprites, '#5c214f', '#954cb0', '#f3ceff');
  const homeGoalieAtlas = createTintedAtlas(atlas.sprites, '#134f3e', '#34a275', '#d5fff0');
  const awayGoalieAtlas = createTintedAtlas(atlas.sprites, '#5a3400', '#cb7f25', '#ffe6bf');

  const sfxMove = new SoundChannel(engine, 0);
  const sfxHit = new SoundChannel(engine, 1);
  const sfxGoal = new SoundChannel(engine, 2);
  const sfxWhistle = new SoundChannel(engine, 3);

  let state: GameState = 'menu';
  let resumeState: GameState = 'playing';
  let banner = 'PRESS START';
  let blink = 0;
  let bannerTimer = 0;
  let faceoffTimer = 0;
  let period = 1;
  let periodClock = 75;
  let homeScore = 0;
  let awayScore = 0;
  let homeShots = 0;
  let awayShots = 0;
  let controlledIndex = 0;
  let shakeTimer = 0;
  let shakeStrength = 0;
  let stuckTimer = 0;

  const homePlayers: Skater[] = [
    { id: 'h1', name: 'ACE', team: 'home', role: 'skater', x: 92, y: 104, vx: 0, vy: 0, radius: 7, topSpeed: 78, accel: 220, facing: 1, animTime: 0, cooldown: 0, stealLock: 0, spriteAtlas: homeAtlas, homeX: 92, homeY: 104, laneBias: -16, frames: HOME_SKATER_FRAMES, idleFrame: HOME_SKATER_FRAMES[0] },
    { id: 'h2', name: 'JET', team: 'home', role: 'skater', x: 92, y: 132, vx: 0, vy: 0, radius: 7, topSpeed: 74, accel: 210, facing: 1, animTime: 0, cooldown: 0, stealLock: 0, spriteAtlas: homeAtlas, homeX: 92, homeY: 132, laneBias: 18, frames: HOME_SKATER_FRAMES, idleFrame: HOME_SKATER_FRAMES[1] },
    { id: 'hg', name: 'WALL', team: 'home', role: 'goalie', x: 28, y: 116, vx: 0, vy: 0, radius: 8, topSpeed: 42, accel: 180, facing: 1, animTime: 0, cooldown: 0, stealLock: 0, spriteAtlas: homeGoalieAtlas, homeX: 28, homeY: 116, laneBias: 0, frames: HOME_GOALIE_FRAMES, idleFrame: HOME_GOALIE_FRAMES[1] },
  ];

  const awayPlayers: Skater[] = [
    { id: 'a1', name: 'FANG', team: 'away', role: 'skater', x: 164, y: 102, vx: 0, vy: 0, radius: 7, topSpeed: 78, accel: 220, facing: -1, animTime: 0, cooldown: 0, stealLock: 0, spriteAtlas: awayAtlasA, homeX: 164, homeY: 102, laneBias: -14, frames: AWAY_SKATER_FRAMES, idleFrame: AWAY_SKATER_FRAMES[0] },
    { id: 'a2', name: 'BOLT', team: 'away', role: 'skater', x: 164, y: 134, vx: 0, vy: 0, radius: 7, topSpeed: 74, accel: 210, facing: -1, animTime: 0, cooldown: 0, stealLock: 0, spriteAtlas: awayAtlasB, homeX: 164, homeY: 134, laneBias: 18, frames: AWAY_SKATER_FRAMES, idleFrame: AWAY_SKATER_FRAMES[1] },
    { id: 'ag', name: 'MASK', team: 'away', role: 'goalie', x: 228, y: 116, vx: 0, vy: 0, radius: 8, topSpeed: 42, accel: 180, facing: -1, animTime: 0, cooldown: 0, stealLock: 0, spriteAtlas: awayGoalieAtlas, homeX: 228, homeY: 116, laneBias: 0, frames: AWAY_GOALIE_FRAMES, idleFrame: AWAY_GOALIE_FRAMES[1] },
  ];

  const puck: PuckState = {
    x: CENTER_X,
    y: CENTER_Y,
    vx: 0,
    vy: 0,
    owner: null,
    radius: 3,
    trail: [],
  };

  function roster(): Skater[] {
    return [...homePlayers, ...awayPlayers];
  }

  function currentControlled(): Skater {
    return homePlayers[controlledIndex];
  }

  function selectNextHomeSkater(): void {
    controlledIndex = (controlledIndex + 1) % 2;
    chirp(sfxMove, 610, 'pulse25', 0.22, 60);
  }

  function resetSkater(skater: Skater): void {
    skater.x = skater.homeX;
    skater.y = skater.homeY;
    skater.vx = 0;
    skater.vy = 0;
    skater.animTime = 0;
    skater.cooldown = 0;
    skater.stealLock = 0;
  }

  function resetFaceoff(message: string): void {
    roster().forEach(resetSkater);
    homePlayers[0].x = 104;
    homePlayers[0].y = 105;
    homePlayers[1].x = 86;
    homePlayers[1].y = 136;
    awayPlayers[0].x = 152;
    awayPlayers[0].y = 105;
    awayPlayers[1].x = 170;
    awayPlayers[1].y = 136;
    puck.x = CENTER_X;
    puck.y = CENTER_Y;
    puck.vx = 0;
    puck.vy = 0;
    puck.owner = null;
    puck.trail = [];
    stuckTimer = 0;
    faceoffTimer = 1.1;
    banner = message;
    bannerTimer = 1.1;
    state = 'faceoff';
    chirp(sfxWhistle, 880, 'triangle', 0.45, 140);
  }

  function startMatch(): void {
    homeScore = 0;
    awayScore = 0;
    homeShots = 0;
    awayShots = 0;
    period = 1;
    periodClock = 75;
    controlledIndex = 0;
    shakeTimer = 0;
    resetFaceoff('OPENING FACEOFF');
  }

  function clampSkater(skater: Skater): void {
    const left = skater.role === 'goalie' ? (skater.team === 'home' ? 18 : 210) : PLAY_LEFT;
    const right = skater.role === 'goalie' ? (skater.team === 'home' ? 50 : 238) : PLAY_RIGHT;
    skater.x = clamp(skater.x, left, right);
    skater.y = clamp(skater.y, skater.role === 'goalie' ? GOAL_TOP - 4 : PLAY_TOP, skater.role === 'goalie' ? GOAL_BOTTOM + 4 : PLAY_BOTTOM);
  }

  function applySteering(skater: Skater, dirX: number, dirY: number, dt: number, throttle = 1): void {
    const dir = normalize(dirX, dirY);
    skater.vx += dir.x * skater.accel * throttle * dt;
    skater.vy += dir.y * skater.accel * throttle * dt;
    const speed = len(skater.vx, skater.vy);
    const maxSpeed = skater.topSpeed * throttle;
    if (speed > maxSpeed) {
      skater.vx = (skater.vx / speed) * maxSpeed;
      skater.vy = (skater.vy / speed) * maxSpeed;
    }
    skater.x += skater.vx * dt;
    skater.y += skater.vy * dt;
    skater.vx *= Math.exp(-4.2 * dt);
    skater.vy *= Math.exp(-4.2 * dt);
    if (Math.abs(skater.vx) > 1) skater.facing = skater.vx >= 0 ? 1 : -1;
    clampSkater(skater);
  }

  function closestSkater(team: Team, x: number, y: number, includeGoalie = false): Skater {
    const list = team === 'home' ? homePlayers : awayPlayers;
    let best = list[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const skater of list) {
      if (!includeGoalie && skater.role === 'goalie') continue;
      const distance = Math.hypot(skater.x - x, skater.y - y);
      if (distance < bestDistance) {
        best = skater;
        bestDistance = distance;
      }
    }
    return best;
  }

  function bestPassTarget(from: Skater): Skater | null {
    const teamList = from.team === 'home' ? homePlayers : awayPlayers;
    const candidates = teamList.filter((skater) => skater !== from && skater.role === 'skater');
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const progressA = from.team === 'home' ? a.x : SCREEN_W - a.x;
      const progressB = from.team === 'home' ? b.x : SCREEN_W - b.x;
      return progressB - progressA;
    });
    return candidates[0];
  }

  function releasePuck(owner: Skater, dirX: number, dirY: number, speed: number, isShot: boolean): void {
    const dir = normalize(
      Math.abs(dirX) + Math.abs(dirY) > 0.15 ? dirX : owner.team === 'home' ? 1 : -1,
      Math.abs(dirX) + Math.abs(dirY) > 0.15 ? dirY : 0,
    );
    owner.cooldown = 0.28;
    puck.owner = null;
    puck.x = owner.x + dir.x * 8;
    puck.y = owner.y + dir.y * 6;
    puck.vx = dir.x * speed + owner.vx * 0.35;
    puck.vy = dir.y * speed * 0.75 + owner.vy * 0.3;
    if (isShot) {
      if (owner.team === 'home') homeShots += 1;
      else awayShots += 1;
    }
    shakeTimer = isShot ? 0.08 : 0.04;
    shakeStrength = isShot ? 1.4 : 0.8;
    chirp(sfxHit, isShot ? 620 : 780, isShot ? 'pulse50' : 'triangle', 0.3, isShot ? 90 : 70);
  }

  function attemptPickup(skater: Skater): boolean {
    if (puck.owner || skater.cooldown > 0) return false;
    const distance = Math.hypot(skater.x - puck.x, skater.y - puck.y);
    const reach = skater.role === 'goalie' ? 10 : 9;
    if (distance <= reach) {
      puck.owner = skater;
      puck.vx = 0;
      puck.vy = 0;
      skater.stealLock = 0.16;
      chirp(sfxMove, skater.team === 'home' ? 420 : 320, 'pulse25', 0.13, 50);
      return true;
    }
    return false;
  }

  function checkTarget(attacker: Skater, target: Skater): boolean {
    const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
    if (distance > 18 || attacker.cooldown > 0) return false;
    attacker.cooldown = 0.38;
    const dir = normalize(target.x - attacker.x, target.y - attacker.y);
    target.vx += dir.x * 80;
    target.vy += dir.y * 56;
    shakeTimer = 0.12;
    shakeStrength = 2.2;
    chirp(sfxHit, 190, 'noise', 0.45, 100);
    if (puck.owner === target && target.stealLock <= 0) {
      puck.owner = null;
      puck.x = target.x + dir.x * 9;
      puck.y = target.y + dir.y * 5;
      puck.vx = dir.x * 88;
      puck.vy = dir.y * 44;
      target.stealLock = 0.25;
    }
    return true;
  }

  function resolveSkaterContacts(): void {
    const players = roster();
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = a.radius + b.radius - 1;
        if (distance > 0 && distance < minDistance) {
          const nx = dx / distance;
          const ny = dy / distance;
          const push = (minDistance - distance) * 0.5;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          a.vx -= nx * 12;
          a.vy -= ny * 12;
          b.vx += nx * 12;
          b.vy += ny * 12;
          clampSkater(a);
          clampSkater(b);
        }
      }
    }
  }

  function updateGoalie(goalie: Skater, dt: number): void {
    const targetX = goalie.team === 'home' ? 30 : 226;
    const targetY = clamp(puck.y + puck.vy * 0.05, GOAL_TOP + 8, GOAL_BOTTOM - 8);
    applySteering(goalie, targetX - goalie.x, targetY - goalie.y, dt, 0.9);
    if (puck.owner === goalie && goalie.cooldown <= 0) {
      releasePuck(goalie, goalie.team === 'home' ? 1 : -1, 0, 118, true);
    } else if (!puck.owner) {
      attemptPickup(goalie);
    }
  }

  function updateCpuSkater(skater: Skater, chaser: Skater, dt: number): void {
    if (skater.role === 'goalie') {
      updateGoalie(skater, dt);
      return;
    }

    let targetX = skater.homeX;
    let targetY = skater.homeY + skater.laneBias * 0.15;
    let throttle = 0.9;

    if (puck.owner === skater) {
      const attackX = skater.team === 'home' ? 214 : 42;
      targetX = attackX;
      targetY = clamp(CENTER_Y + skater.laneBias, PLAY_TOP + 6, PLAY_BOTTOM - 6);
      throttle = 1;

      const shootNow = skater.team === 'home' ? skater.x > 176 : skater.x < 80;
      if (shootNow && skater.cooldown <= 0) {
        releasePuck(skater, skater.team === 'home' ? 1 : -1, (CENTER_Y - skater.y) * 0.04, 156, true);
      } else if (skater.cooldown <= 0) {
        const passMate = bestPassTarget(skater);
        if (passMate) {
          const pressure = closestSkater(skater.team === 'home' ? 'away' : 'home', skater.x, skater.y, true);
          if (Math.hypot(pressure.x - skater.x, pressure.y - skater.y) < 18) {
            releasePuck(skater, passMate.x - skater.x, passMate.y - skater.y, 110, false);
          }
        }
      }
    } else if (puck.owner && puck.owner.team === skater.team) {
      targetX = skater.team === 'home' ? 150 : 106;
      targetY = clamp(CENTER_Y + skater.laneBias, PLAY_TOP + 4, PLAY_BOTTOM - 4);
      throttle = 0.85;
    } else if (puck.owner && puck.owner.team !== skater.team) {
      if (skater === chaser) {
        targetX = puck.owner.x;
        targetY = puck.owner.y;
        throttle = 1;
      } else {
        targetX = skater.team === 'home' ? 88 : 168;
        targetY = clamp(puck.owner.y + skater.laneBias * 0.3, PLAY_TOP + 6, PLAY_BOTTOM - 6);
        throttle = 0.9;
      }
    } else if (skater === chaser) {
      targetX = puck.x;
      targetY = puck.y;
      throttle = 1;
    }

    applySteering(skater, targetX - skater.x, targetY - skater.y, dt, throttle);

    if (!puck.owner) {
      attemptPickup(skater);
    } else if (puck.owner.team !== skater.team && puck.owner.role === 'skater') {
      checkTarget(skater, puck.owner);
    }
  }

  function updateHuman(dt: number): void {
    const skater = currentControlled();
    const inputX = (engine.input.held(0, 'right') ? 1 : 0) - (engine.input.held(0, 'left') ? 1 : 0);
    const inputY = (engine.input.held(0, 'down') ? 1 : 0) - (engine.input.held(0, 'up') ? 1 : 0);
    applySteering(skater, inputX, inputY, dt, 1);

    if (!puck.owner) {
      attemptPickup(skater);
    }

    if (engine.input.justPressed(0, 'b')) {
      if (puck.owner === skater) {
        const target = bestPassTarget(skater);
        if (target) {
          releasePuck(skater, target.x - skater.x, target.y - skater.y, 112, false);
        }
      } else {
        selectNextHomeSkater();
      }
    }

    if (engine.input.justPressed(0, 'a') && skater.cooldown <= 0) {
      if (puck.owner === skater) {
        releasePuck(skater, inputX, inputY, 162, true);
      } else {
        let checked = false;
        for (const foe of awayPlayers) {
          if (foe.role === 'skater' && checkTarget(skater, foe)) {
            checked = true;
            break;
          }
        }
        if (!checked) {
          attemptPickup(skater);
        }
      }
    }
  }

  function updatePuck(dt: number): void {
    if (puck.owner) {
      stuckTimer = 0;
      puck.x = puck.owner.x + puck.owner.facing * 8;
      puck.y = puck.owner.y + 2;
      puck.vx = puck.owner.vx;
      puck.vy = puck.owner.vy;
    } else {
      puck.x += puck.vx * dt;
      puck.y += puck.vy * dt;
      puck.vx *= Math.exp(-2.8 * dt);
      puck.vy *= Math.exp(-2.8 * dt);

      if (puck.y < PLAY_TOP) {
        puck.y = PLAY_TOP;
        puck.vy = Math.abs(puck.vy) * 0.74;
      }
      if (puck.y > PLAY_BOTTOM) {
        puck.y = PLAY_BOTTOM;
        puck.vy = -Math.abs(puck.vy) * 0.74;
      }

      const insideGoalLane = puck.y >= GOAL_TOP && puck.y <= GOAL_BOTTOM;
      if (puck.x < PLAY_LEFT) {
        if (insideGoalLane) {
          awayScore += 1;
          state = 'goal';
          banner = 'AWAY GOAL!';
          bannerTimer = 1.8;
          faceoffTimer = 1.8;
          shakeTimer = 0.5;
          shakeStrength = 4;
          void sfxGoal.melody([['A3', 100], ['C4', 100], ['E4', 120], ['A4', 240]]);
          return;
        }
        puck.x = PLAY_LEFT;
        puck.vx = Math.abs(puck.vx) * 0.82;
      }
      if (puck.x > PLAY_RIGHT) {
        if (insideGoalLane) {
          homeScore += 1;
          state = 'goal';
          banner = 'HOME GOAL!';
          bannerTimer = 1.8;
          faceoffTimer = 1.8;
          shakeTimer = 0.5;
          shakeStrength = 4;
          void sfxGoal.melody([['C4', 100], ['E4', 100], ['G4', 120], ['C5', 240]]);
          return;
        }
        puck.x = PLAY_RIGHT;
        puck.vx = -Math.abs(puck.vx) * 0.82;
      }

      const nearDangerArea =
        puck.x < PLAY_LEFT + 10 ||
        puck.x > PLAY_RIGHT - 10 ||
        (puck.y > GOAL_TOP - 6 && puck.y < GOAL_BOTTOM + 6 && (puck.x < PLAY_LEFT + 20 || puck.x > PLAY_RIGHT - 20));
      const puckSpeed = Math.hypot(puck.vx, puck.vy);
      if (nearDangerArea && puckSpeed < 8) {
        stuckTimer += dt;
      } else {
        stuckTimer = 0;
      }
      if (stuckTimer > 0.85) {
        const toCenter = normalize(CENTER_X - puck.x, CENTER_Y - puck.y);
        puck.vx = toCenter.x * 92;
        puck.vy = toCenter.y * 68;
        puck.x += toCenter.x * 4;
        puck.y += toCenter.y * 4;
        stuckTimer = 0;
      }

      const nearest = roster()
        .filter((skater) => skater.cooldown <= 0)
        .sort((a, b) => Math.hypot(a.x - puck.x, a.y - puck.y) - Math.hypot(b.x - puck.x, b.y - puck.y))[0];
      if (nearest) {
        attemptPickup(nearest);
      }
    }

    puck.trail.unshift({ x: puck.x, y: puck.y, life: 0.22 });
    puck.trail = puck.trail
      .map((item) => ({ x: item.x, y: item.y, life: item.life - dt }))
      .filter((item) => item.life > 0)
      .slice(0, 8);
  }

  function updateSkaterTimers(dt: number): void {
    for (const skater of roster()) {
      skater.cooldown = Math.max(0, skater.cooldown - dt);
      skater.stealLock = Math.max(0, skater.stealLock - dt);
      if (len(skater.vx, skater.vy) > 8) {
        skater.animTime += dt * (skater.role === 'goalie' ? 4 : 8);
      } else {
        skater.animTime = 0;
      }
    }
  }

  function endPeriod(): void {
    if (period >= 3) {
      state = 'gameover';
      banner = homeScore === awayScore ? 'DRAW GAME!' : homeScore > awayScore ? 'HOME WINS!' : 'AWAY WINS!';
      bannerTimer = 999;
      chirp(sfxWhistle, 660, 'triangle', 0.4, 200);
      return;
    }
    period += 1;
    periodClock = 75;
    state = 'intermission';
    faceoffTimer = 2;
    banner = `END OF PERIOD ${period - 1}`;
    bannerTimer = 2;
    chirp(sfxWhistle, 720, 'triangle', 0.4, 160);
  }

  function updatePlaying(dt: number): void {
    if (engine.input.justPressed(0, 'start')) {
      resumeState = 'playing';
      state = 'paused';
      banner = 'PAUSED';
      return;
    }

    updateHuman(dt);

    const focusX = puck.owner ? puck.owner.x : puck.x;
    const focusY = puck.owner ? puck.owner.y : puck.y;
    const homeChaser = closestSkater('home', focusX, focusY);
    const awayChaser = closestSkater('away', focusX, focusY);

    for (const skater of homePlayers) {
      if (skater === currentControlled()) continue;
      updateCpuSkater(skater, homeChaser, dt);
    }

    for (const skater of awayPlayers) {
      updateCpuSkater(skater, awayChaser, dt);
    }

    resolveSkaterContacts();
    updatePuck(dt);
    updateSkaterTimers(dt);

    periodClock = Math.max(0, periodClock - dt);
    if (periodClock <= 0) {
      endPeriod();
    }
  }

  function update(dt: number): void {
    blink += dt;
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
    if (bannerTimer > 0 && bannerTimer < 900) bannerTimer = Math.max(0, bannerTimer - dt);

    switch (state) {
      case 'menu':
        if (engine.input.justPressed(0, 'start') || engine.input.justPressed(0, 'a')) {
          startMatch();
        } else if (engine.input.justPressed(0, 'b')) {
          state = 'controls';
          banner = 'HOW TO PLAY';
        }
        break;
      case 'controls':
        if (engine.input.justPressed(0, 'a') || engine.input.justPressed(0, 'b') || engine.input.justPressed(0, 'start')) {
          state = 'menu';
          banner = 'PRESS START';
        }
        break;
      case 'faceoff':
        faceoffTimer = Math.max(0, faceoffTimer - dt);
        if (faceoffTimer <= 0) {
          state = 'playing';
          banner = '';
        }
        break;
      case 'goal':
        faceoffTimer = Math.max(0, faceoffTimer - dt);
        if (faceoffTimer <= 0) {
          resetFaceoff('CENTER ICE FACEOFF');
        }
        break;
      case 'intermission':
        faceoffTimer = Math.max(0, faceoffTimer - dt);
        if (faceoffTimer <= 0) {
          resetFaceoff(`PERIOD ${period} FACEOFF`);
        }
        break;
      case 'paused':
        if (engine.input.justPressed(0, 'start')) {
          state = resumeState;
          banner = '';
        }
        break;
      case 'gameover':
        if (engine.input.justPressed(0, 'start') || engine.input.justPressed(0, 'a')) {
          startMatch();
        }
        break;
      case 'playing':
        updatePlaying(dt);
        break;
    }
  }

  function drawHud(): void {
    ctx.fillStyle = '#0b1d36';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#173457';
    ctx.fillRect(0, 0, SCREEN_W, 48);
    ctx.fillRect(0, 180, SCREEN_W, 60);

    drawPixelText(ctx, 'HOME', 18, 8, TEAM_COLORS.home, 12);
    drawPixelText(ctx, String(homeScore).padStart(2, '0'), 18, 24, '#ffffff', 18);
    drawPixelText(ctx, 'PERIOD', 128, 8, TEAM_COLORS.gold, 10, 'center');
    drawPixelText(ctx, `${period}`, 128, 23, '#ffffff', 16, 'center');
    drawPixelText(ctx, `${periodClock.toFixed(1).padStart(4, '0')}`, 128, 24, '#ffffff', 12, 'right');
    drawPixelText(ctx, 'AWAY', 238, 8, TEAM_COLORS.away, 12, 'right');
    drawPixelText(ctx, String(awayScore).padStart(2, '0'), 238, 24, '#ffffff', 18, 'right');
    drawPixelText(ctx, `YOU ${currentControlled().name}`, 16, 188, TEAM_COLORS.gold, 10);
    drawPixelText(ctx, `SHOTS ${homeShots}`, 16, 204, TEAM_COLORS.text, 9);
    drawPixelText(ctx, `CPU SHOTS ${awayShots}`, 16, 216, TEAM_COLORS.text, 9);
    drawPixelText(ctx, 'Z SHOOT / CHECK', 144, 188, TEAM_COLORS.text, 9);
    drawPixelText(ctx, 'X PASS / SWITCH', 144, 204, TEAM_COLORS.text, 9);
    drawPixelText(ctx, 'ENTER PAUSE', 144, 216, TEAM_COLORS.text, 9);
  }

  function drawRink(): void {
    ctx.fillStyle = '#0a1730';
    ctx.fillRect(0, 48, SCREEN_W, 132);
    ctx.fillStyle = '#1b2946';
    ctx.fillRect(0, 52, SCREEN_W, 10);
    for (let column = 0; column < SCREEN_W; column += 8) {
      const crowdColor = column % 16 === 0 ? '#ffdc78' : column % 24 === 0 ? '#ff8f6e' : '#8ed0ff';
      ctx.fillStyle = crowdColor;
      ctx.fillRect(column, 54 + ((column / 8) % 3), 4, 4);
    }

    ctx.drawImage(
      atlas.raw,
      RINK_SOURCE.x,
      RINK_SOURCE.y,
      RINK_SOURCE.w,
      RINK_SOURCE.h,
      RINK_DEST.x,
      RINK_DEST.y,
      RINK_DEST.w,
      RINK_DEST.h,
    );

    ctx.save();
    ctx.strokeStyle = 'rgba(138, 199, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CENTER_X, PLAY_TOP);
    ctx.lineTo(CENTER_X, PLAY_BOTTOM);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.strokeRect(PLAY_LEFT - 4, GOAL_TOP, 9, GOAL_BOTTOM - GOAL_TOP);
    ctx.strokeRect(PLAY_RIGHT - 5, GOAL_TOP, 9, GOAL_BOTTOM - GOAL_TOP);
    ctx.restore();

    const drawGoalNet = (x: number) => {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, GOAL_TOP + 1, 8, GOAL_BOTTOM - GOAL_TOP - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.strokeRect(x, GOAL_TOP, 8, GOAL_BOTTOM - GOAL_TOP);
      ctx.strokeStyle = 'rgba(173, 216, 255, 0.45)';
      for (let netX = 1; netX < 8; netX += 3) {
        ctx.beginPath();
        ctx.moveTo(x + netX, GOAL_TOP);
        ctx.lineTo(x + netX, GOAL_BOTTOM);
        ctx.stroke();
      }
      for (let netY = GOAL_TOP + 3; netY < GOAL_BOTTOM; netY += 6) {
        ctx.beginPath();
        ctx.moveTo(x, netY);
        ctx.lineTo(x + 8, netY);
        ctx.stroke();
      }
      ctx.restore();
    };

    drawGoalNet(PLAY_LEFT - 3);
    drawGoalNet(PLAY_RIGHT - 4);
  }

  function frameFor(skater: Skater): Rect {
    if (len(skater.vx, skater.vy) < 8) return skater.idleFrame;
    return skater.frames[Math.floor(skater.animTime) % skater.frames.length];
  }

  function drawSelection(skater: Skater): void {
    ctx.save();
    ctx.strokeStyle = TEAM_COLORS.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(skater.x, skater.y + 9, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayers(): void {
    const players = roster().sort((a, b) => a.y - b.y);
    for (const skater of players) {
      const frame = frameFor(skater);
      if (state === 'playing' && skater === currentControlled()) {
        drawSelection(skater);
      }
      const scale = skater.role === 'goalie' ? 1.08 : 1;
      drawAtlasSprite(
        ctx,
        skater.spriteAtlas,
        frame,
        skater.x - Math.floor((frame.w * scale) / 2),
        skater.y - Math.floor((frame.h * scale) / 2),
        scale,
        skater.facing < 0,
      );
      if (skater.role === 'goalie') {
        drawPixelText(ctx, 'G', skater.x, skater.y - 14, skater.team === 'home' ? '#d7fff4' : '#fff2cf', 8, 'center');
      }
    }
  }

  function drawPuck(): void {
    for (const sample of puck.trail) {
      ctx.save();
      ctx.globalAlpha = sample.life / 0.22;
      ctx.fillStyle = 'rgba(196, 225, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(sample.x, sample.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawAtlasSprite(ctx, atlas.sprites, PUCK_RECT, puck.x - 3, puck.y - 3);
  }

  function drawBanner(): void {
    if (!banner && state !== 'paused') return;
    const text = state === 'paused' ? 'PAUSED' : banner;
    if (!text) return;
    ctx.fillStyle = 'rgba(8, 17, 31, 0.84)';
    ctx.fillRect(38, 18, 180, 20);
    drawPixelText(ctx, text, 128, 22, '#fff7c4', 12, 'center');
  }

  function drawMenu(): void {
    ctx.fillStyle = '#07111f';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.globalAlpha = 0.72;
    ctx.drawImage(atlas.raw, RINK_SOURCE.x, RINK_SOURCE.y, RINK_SOURCE.w, RINK_SOURCE.h, 0, 54, 256, 120);
    ctx.globalAlpha = 1;
    drawAtlasSprite(ctx, homeAtlas, PORTRAIT_HOME, 18, 124, 2);
    drawAtlasSprite(ctx, awayAtlasA, PORTRAIT_AWAY, 194, 124, 2, true);
    drawPixelText(ctx, 'RETRO', 128, 34, TEAM_COLORS.gold, 22, 'center');
    drawPixelText(ctx, 'ICE HOCKEY', 128, 58, '#ffffff', 24, 'center');
    drawPixelText(ctx, 'YOU VS CPU', 128, 88, '#8fd4ff', 12, 'center');
    drawPixelText(ctx, 'SEPARATE BOT COLORS + FIXED GOAL CREASES', 128, 186, TEAM_COLORS.text, 9, 'center');
    drawPixelText(ctx, 'Z START MATCH', 128, 202, blink % 1 < 0.5 ? '#fff7c4' : '#8caac7', 11, 'center');
    drawPixelText(ctx, 'X VIEW CONTROLS', 128, 216, '#bcd9ff', 10, 'center');
  }

  function drawControls(): void {
    ctx.fillStyle = '#081523';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawPixelText(ctx, 'HOW TO PLAY', 128, 24, TEAM_COLORS.gold, 18, 'center');
    drawPixelText(ctx, 'ARROWS SKATE', 128, 70, '#ffffff', 12, 'center');
    drawPixelText(ctx, 'Z SHOOT WITH PUCK', 128, 94, TEAM_COLORS.home, 12, 'center');
    drawPixelText(ctx, 'Z CHECK WITHOUT PUCK', 128, 110, TEAM_COLORS.home, 12, 'center');
    drawPixelText(ctx, 'X PASS OR SWITCH PLAYER', 128, 134, TEAM_COLORS.away, 12, 'center');
    drawPixelText(ctx, 'ENTER PAUSE', 128, 150, TEAM_COLORS.text, 12, 'center');
    drawPixelText(ctx, 'GOALIES STAY IN THE CREASE AND CLEAR THE PUCK', 128, 184, TEAM_COLORS.text, 9, 'center');
    drawPixelText(ctx, 'LOOSE PUCKS AUTO-NUDGE IF THEY STALL AT THE GOAL', 128, 196, TEAM_COLORS.text, 9, 'center');
    drawPixelText(ctx, 'PRESS Z, X, OR ENTER TO RETURN', 128, 214, blink % 1 < 0.5 ? '#fff7c4' : '#8caac7', 10, 'center');
  }

  function render(): void {
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    if (state === 'menu') {
      drawMenu();
      return;
    }
    if (state === 'controls') {
      drawControls();
      return;
    }

    const shakeX = shakeTimer > 0 ? Math.round((Math.random() - 0.5) * shakeStrength) : 0;
    const shakeY = shakeTimer > 0 ? Math.round((Math.random() - 0.5) * shakeStrength) : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawHud();
    drawRink();
    drawPlayers();
    drawPuck();
    drawBanner();
    ctx.restore();
  }

  engine.loop((rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    update(dt);
    render();
    engine.input.snapshot();
  });
}

void init();
