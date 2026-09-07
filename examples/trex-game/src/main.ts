import { Cathode, Scene, Sprite, SoundChannel } from '@cathode/sdk';

async function loadScaledAsset(engine: Cathode, url: string, targetW: number, targetH: number, frames: number = 1): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = targetW * frames;
      const h = targetH;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      // Alpha keying: Remove white/near-white backgrounds for transparency
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i] > 240 && imgData.data[i + 1] > 240 && imgData.data[i + 2] > 240) {
          imgData.data[i + 3] = 0;
        }
      }

      const handle = engine.raw.upload_sheet(w, h, targetW, targetH, new Uint8Array(imgData.data.buffer));
      resolve(handle);
    };
    img.onerror = (e) => {
      console.error(`Failed to load asset: ${url}`, e);
      reject(e);
    };
    img.src = url;
  });
}

async function init() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;

  // Initialize Engine
  const engine = await Cathode.gameboy(canvas, 3);
  const scene = new Scene(engine);

  // Sound channels
  const jumpSfx = new SoundChannel(engine, 0);
  const crashSfx = new SoundChannel(engine, 1);

  // Load Assets
  // Resolved against this module rather than against the server root. A bare
  // '/trex_anim.png' only works while this folder is the Vite root, so the
  // game 404'd its own art the moment it was reached through the site.
  const asset = (name: string) => new URL(`../public/${name}`, import.meta.url).href;

  const trexSheet = await loadScaledAsset(engine, asset('trex_anim.png'), 24, 24, 2); // 2 frames
  const cactusSheet = await loadScaledAsset(engine, asset('cactus.png'), 24, 32);
  const bgSheet = await loadScaledAsset(engine, asset('bg.png'), 160, 144);
  const groundSheet = await loadScaledAsset(engine, asset('ground.png'), 160, 32);

  // Parallax Background Setup (layer 0)
  const bg1 = new Sprite(scene, { x: 0, y: 0, sheet: bgSheet, frame: 0, layer: 0 });
  const bg2 = new Sprite(scene, { x: 160, y: 0, sheet: bgSheet, frame: 0, layer: 0 });

  // Floor baseline (adjusted for new asset heights)
  const FLOOR_Y = 115;

  // Ground Setup (layer 2)
  const g1 = new Sprite(scene, { x: 0, y: FLOOR_Y - 4, sheet: groundSheet, frame: 0, layer: 2 });
  const g2 = new Sprite(scene, { x: 160, y: FLOOR_Y - 4, sheet: groundSheet, frame: 0, layer: 2 });

  // --- T-REX SETUP --- (layer 10)
  const trex = new Sprite(scene, { x: 20, y: FLOOR_Y - 24, sheet: trexSheet, frame: 0, layer: 10 });
  let velocityY = 0;
  const gravity = 800;
  const jumpStrength = -230;
  let isJumping = false;
  let isRunningAnim = false;
  let gameOver = false;

  // Start initial run animation
  trex.play({ frames: [0, 1], fps: 8, loop: true });
  isRunningAnim = true;

  trex.onUpdate = (dt) => {
    if (gameOver) return;

    // Apply gravity
    velocityY += gravity * dt;
    trex.y += velocityY * dt;

    // Floor collision
    if (trex.y >= FLOOR_Y - 24) {
      trex.y = FLOOR_Y - 24;
      velocityY = 0;
      isJumping = false;

      // Resume run animation if landed
      if (!isRunningAnim) {
        trex.play({ frames: [0, 1], fps: 8, loop: true });
        isRunningAnim = true;
      }
    } else {
      // Freeze frame when airborne
      if (isRunningAnim) {
        trex.stopAnim();
        trex.frame = 1;
        isRunningAnim = false;
      }
    }

    // Jump Input: 'Z' key -> player 0 'a' button
    if (engine.input.justPressed(0, 'a') && !isJumping) {
      velocityY = jumpStrength;
      isJumping = true;
      jumpSfx.play(400, 'triangle', 0.5);
      setTimeout(() => jumpSfx.stop(), 120);
    }
  };

  // --- CACTUS SETUP --- (layer 5)
  const cactus = new Sprite(scene, { x: 160, y: FLOOR_Y - 32, sheet: cactusSheet, frame: 0, layer: 5 });
  let cactusSpeed = 100;
  let score = 0;

  // Score UI Element
  const scoreDisplay = document.createElement('p');
  scoreDisplay.style.color = '#fff';
  scoreDisplay.style.marginTop = '10px';
  const container = document.getElementById('game-container');
  if (container) container.appendChild(scoreDisplay);

  cactus.onUpdate = (dt) => {
    if (gameOver) return;

    // Background Parallax Scroll
    bg1.x -= 20 * dt;
    bg2.x -= 20 * dt;
    if (bg1.x <= -160) bg1.x = bg2.x + 160;
    if (bg2.x <= -160) bg2.x = bg1.x + 160;

    // Ground Parallax Scroll
    g1.x -= cactusSpeed * dt;
    g2.x -= cactusSpeed * dt;
    if (g1.x <= -160) g1.x = g2.x + 160;
    if (g2.x <= -160) g2.x = g1.x + 160;

    // Move cactus left
    cactus.x -= cactusSpeed * dt;

    // Respawn Off-screen
    if (cactus.x < -24) {
      cactus.x = 160 + Math.random() * 150;
      cactusSpeed += 5; // Speed up progressively!
    }

    // Collision Detection with T-Rex
    if (trex.overlaps(cactus, 18, 20)) {
      crashSfx.play(150, 'noise', 0.8);
      setTimeout(() => crashSfx.stop(), 200);
      engine.shake(4, 0.3); // Screen shake on impact
      scoreDisplay.innerText = `GAME OVER! Final Score: ${Math.floor(score)} — Press ENTER to restart`;
      gameOver = true;
      trex.stopAnim();
    }
  };

  // --- GAME LOOP ---
  engine.loop((dt) => {
    // Restart handler
    if (gameOver && engine.input.justPressed(0, 'start')) {
      gameOver = false;
      score = 0;
      cactusSpeed = 100;
      cactus.x = 160;
      trex.y = FLOOR_Y - 24;
      velocityY = 0;
      isJumping = false;
      trex.play({ frames: [0, 1], fps: 8, loop: true });
      isRunningAnim = true;
    }

    if (!gameOver) {
      score += dt * 10;
      scoreDisplay.innerText = `Score: ${Math.floor(score)}`;
    }
    scene.update(dt);
  });
}

init();
