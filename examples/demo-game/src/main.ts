import { Cathode, Scene, Sprite, TileMap, SoundChannel } from '@cathode/sdk';

const canvas = document.getElementById('game') as HTMLCanvasElement;

async function initGame() {
    const engine = await Cathode.gameboy(canvas);
    const scene = new Scene(engine);

    // 1. Generate a 40x8 sprite sheet in memory (5 tiles of 8x8)
    // [0=empty, 1=ground(green), 2=hero frame1(magenta cross), 3=hero frame2, 4=bullet(yellow bar)]
    const SHEET_W = 40;
    const SHEET_H = 8;
    const pixels = new Uint8Array(SHEET_W * SHEET_H * 4);

    for (let i = 0; i < SHEET_W * SHEET_H; i++) {
        const x = i % SHEET_W;
        const y = Math.floor(i / SHEET_W);
        const tile = Math.floor(x / 8);
        const tx = x % 8;
        const ty = y % 8;

        let r = 0, g = 0, b = 0, a = 0;

        if (tile === 1) { // Ground
            if (ty < 7 && tx > 0) { r = 0; g = 180; b = 0; a = 255; }
        } else if (tile === 2) { // Hero frame 1 (Cross)
            if ((tx === 3 || tx === 4) && ty > 0 && ty < 7) { r = 255; g = 0; b = 255; a = 255; }
            if ((ty === 3 || ty === 4) && tx > 0 && tx < 7) { r = 255; g = 0; b = 255; a = 255; }
        } else if (tile === 3) { // Hero frame 2 (smaller cross)
            if ((tx === 3 || tx === 4) && ty > 1 && ty < 6) { r = 255; g = 0; b = 255; a = 255; }
            if ((ty === 3 || ty === 4) && tx > 1 && tx < 6) { r = 255; g = 0; b = 255; a = 255; }
        } else if (tile === 4) { // Bullet
            if (ty === 3 || ty === 4) { r = 255; g = 255; b = 0; a = 255; }
        }

        pixels[i * 4] = r;
        pixels[i * 4 + 1] = g;
        pixels[i * 4 + 2] = b;
        pixels[i * 4 + 3] = a;
    }

    // Upload sprite sheet to WASM
    const sheetHandle = engine.raw.upload_sheet(SHEET_W, SHEET_H, 8, 8, pixels);

    // 2. Build TileMap (40x18)
    const map = new TileMap(scene, { name: "Level1", cols: 40, rows: 18, tileWidth: 8, tileHeight: 8 });
    const layerId = map.addLayer("Main", sheetHandle, false);

    // Ground at row 16 (tile_id=2 → 1-based, renderer maps to sheet tile index 1 = ground)
    for (let c = 0; c < 40; c++) {
        map.setTile(layerId, c, 16, 2);
        map.setTile(layerId, c, 17, 2);
    }
    // Platforms
    [[10, 12], [14, 10], [20, 12], [24, 8], [32, 12]].forEach(([cx, cy]) => {
        for (let i = 0; i < 4; i++) map.setTile(layerId, cx + i, cy, 2);
    });
    map.commit();

    // 3. Audio Channels
    const jumpSfx = new SoundChannel(engine, 0);
    const shootSfx = new SoundChannel(engine, 1);

    // 4. Entities
    const hero = new Sprite(scene, { sheet: sheetHandle, frame: 2, x: 20, y: 100, layer: 5 });
    hero.play({ frames: [2, 3], fps: 6, loop: true });

    const bullets: Sprite[] = [];

    let shootTimer = 0;
    const JUMP_V = -260;
    const GRAV = 600;
    const SPEED = 80;

    // Platform definitions: [startCol, row, width]
    const PLATFORMS = [[10, 12, 4], [14, 10, 4], [20, 12, 4], [24, 8, 4], [32, 12, 4]];
    const GROUND_ROW = 16;
    const MAP_COLS = 40;
    const TILE_SIZE = 8;

    function isGrounded(hx: number, hy: number) {
        const footY = hy + TILE_SIZE;
        const leftCol = Math.floor((hx + 2) / TILE_SIZE);
        const rightCol = Math.floor((hx + TILE_SIZE - 2) / TILE_SIZE);
        const tRow = Math.floor(footY / TILE_SIZE);

        // Ground row check
        if (tRow >= GROUND_ROW && leftCol >= 0 && rightCol < MAP_COLS) return true;

        // Platform check: hero's feet must be at platform row and within tolerance
        for (const [px, py, pw] of PLATFORMS) {
            if (tRow === py && footY <= py * TILE_SIZE + 4) {
                if (rightCol >= px && leftCol < px + pw) {
                    return true;
                }
            }
        }
        return false;
    }

    scene.follow(hero, 0, 0);

    engine.loop((dt) => {
        shootTimer = Math.max(0, shootTimer - dt);

        // Horizontal
        if (engine.input.held(0, 'left')) {
            hero.velocityX = -SPEED;
            hero.flipX = true;
        } else if (engine.input.held(0, 'right')) {
            hero.velocityX = SPEED;
            hero.flipX = false;
        } else {
            hero.velocityX = 0;
        }

        // Gravity & Jump
        const grounded = isGrounded(hero.x, hero.y);
        if (grounded) {
            // Snap to nearest tile boundary
            const footRow = Math.floor((hero.y + TILE_SIZE) / TILE_SIZE);
            hero.y = footRow * TILE_SIZE - TILE_SIZE;

            if (hero.velocityY > 0) hero.velocityY = 0;

            if (engine.input.justPressed(0, 'a')) {
                hero.velocityY = JUMP_V;
                jumpSfx.play('G4', 'triangle', 0.8);
                setTimeout(() => jumpSfx.stop(), 100);
            }
        } else {
            // Apply gravity (ascending and descending)
            hero.velocityY += GRAV * dt;
        }

        // Clamp map bounds
        if (hero.x < 0) hero.x = 0;
        if (hero.x > 40 * 8 - 8) hero.x = 40 * 8 - 8;

        // Shoot (frame 4 = bullet tile in our 5-tile sheet)
        if (engine.input.justPressed(0, 'b') && shootTimer <= 0) {
            shootTimer = 0.25;
            shootSfx.play('C5', 'pulse25', 0.5);
            setTimeout(() => shootSfx.stop(), 80);

            const bx = hero.x + (hero.flipX ? -8 : 8);
            const by = hero.y + 2; // center bullet vertically relative to hero
            const b = new Sprite(scene, { sheet: sheetHandle, frame: 4, x: bx, y: by, layer: 4 });
            b.velocityX = hero.flipX ? -200 : 200;
            b.flipX = hero.flipX;
            bullets.push(b);
        }

        // Bullet cleanup — destroy when off viewport
        const halfW = engine.width / 2;
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (b.x < hero.x - halfW - 32 || b.x > hero.x + halfW + 32) {
                b.destroy();
                bullets.splice(i, 1);
            }
        }

        scene.update(dt);
    });
}

initGame();
