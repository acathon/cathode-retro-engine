import { RetroEngine, Scene, Raycaster, BitmapFont, SaveManager, SoundChannel, MusicPlayer, } from '@retro-engine/sdk';
// ─── Procedural Textures (64×64 for more detail) ────────────────────
const TEX = 64;
function genTechWall(size) {
    const p = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const panel = Math.floor(x / 32) + Math.floor(y / 32) * 2;
            const lx = x % 32, ly = y % 32;
            const edge = lx === 0 || ly === 0;
            const rivet = (lx === 4 || lx === 28) && (ly === 4 || ly === 28);
            if (edge) {
                p[i] = 30;
                p[i + 1] = 35;
                p[i + 2] = 30;
            }
            else if (rivet) {
                p[i] = 120;
                p[i + 1] = 130;
                p[i + 2] = 120;
            }
            else {
                const n = ((x * 7 + y * 13 + panel * 17) % 20) - 10;
                p[i] = 60 + n;
                p[i + 1] = 65 + n;
                p[i + 2] = 70 + n;
            }
            p[i + 3] = 255;
        }
    return p;
}
function genBrickWall(size) {
    const p = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const bh = 8, bw = 16;
            const row = Math.floor(y / bh);
            const bx = (x + (row % 2) * (bw / 2)) % bw;
            const by = y % bh;
            const mortar = bx < 1 || by < 1;
            if (mortar) {
                p[i] = 40;
                p[i + 1] = 35;
                p[i + 2] = 30;
            }
            else {
                const n = ((x * 11 + y * 7) % 25) - 12;
                p[i] = 100 + n;
                p[i + 1] = 30 + (n >> 1);
                p[i + 2] = 25 + (n >> 1);
            }
            p[i + 3] = 255;
        }
    return p;
}
function genHellStone(size) {
    const p = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const n = ((x * 23 + y * 37) % 30) - 15;
            const glow = Math.sin(y / size * Math.PI) * 40;
            p[i] = Math.min(255, 130 + n + glow);
            p[i + 1] = 20 + (n >> 1);
            p[i + 2] = 10;
            p[i + 3] = 255;
        }
    return p;
}
function genMetalDoor(size) {
    const p = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const cx = Math.abs(x - size / 2);
            const frame = x < 2 || x >= size - 2 || y < 2 || y >= size - 2;
            const stripe = Math.floor(x / 8) % 2 === 0;
            if (frame) {
                p[i] = 150;
                p[i + 1] = 140;
                p[i + 2] = 40;
            }
            else if (cx < 4 && Math.abs(y - size / 2) < 4) {
                p[i] = 200;
                p[i + 1] = 60;
                p[i + 2] = 60;
            }
            else {
                const base = stripe ? 90 : 80;
                const n = ((x * 3 + y * 7) % 12) - 6;
                p[i] = base + n;
                p[i + 1] = base + n - 5;
                p[i + 2] = base + n - 10;
            }
            p[i + 3] = 255;
        }
    return p;
}
function genDemonSprite(size) {
    const p = new Uint8Array(size * size * 4);
    const cx = size / 2, cy = size / 2;
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const dx = x - cx, dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < size * 0.38) {
                const n = ((x * 13 + y * 7) % 20) - 10;
                // Horns at top
                const isHorn = y < cy - size * 0.2 && (Math.abs(x - cx + 10) < 3 || Math.abs(x - cx - 10) < 3) && dist < size * 0.45;
                if (isHorn) {
                    p[i] = 100;
                    p[i + 1] = 20;
                    p[i + 2] = 20;
                }
                else {
                    p[i] = 160 + n;
                    p[i + 1] = 40 + n;
                    p[i + 2] = 30;
                }
                // Glowing eyes
                const ey = cy - size * 0.08;
                const ex1 = cx - size * 0.12, ex2 = cx + size * 0.12;
                if ((Math.abs(x - ex1) < 3 && Math.abs(y - ey) < 2) ||
                    (Math.abs(x - ex2) < 3 && Math.abs(y - ey) < 2)) {
                    p[i] = 255;
                    p[i + 1] = 200;
                    p[i + 2] = 0;
                }
                // Fanged mouth
                if (y > cy + size * 0.04 && y < cy + size * 0.18 && Math.abs(dx) < size * 0.18) {
                    p[i] = 60;
                    p[i + 1] = 0;
                    p[i + 2] = 0;
                    // Fangs
                    if ((Math.abs(x - cx + 6) < 2 || Math.abs(x - cx - 6) < 2) && y < cy + size * 0.10) {
                        p[i] = 220;
                        p[i + 1] = 220;
                        p[i + 2] = 200;
                    }
                }
                p[i + 3] = 255;
            }
            else {
                p[i + 3] = 0;
            }
        }
    return p;
}
// ─── Map (24×24 — corridors, rooms, arenas) ─────────────────────────
// 0=empty 1=tech 2=blood-brick 3=hellstone 4=door
const MC = 24, MR = 24;
// prettier-ignore
const MAP = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 2, 2, 0, 0, 0, 0, 3, 3, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1,
    1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1,
    1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1,
    1, 0, 0, 2, 0, 0, 0, 0, 0, 3, 3, 0, 0, 3, 3, 0, 0, 0, 0, 0, 2, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1,
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 3, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];
function mkEnemy(id, pts, spd) {
    return {
        id, x: pts[0][0], y: pts[0][1],
        path: pts.map(([x, y]) => ({ x, y })),
        pathIdx: 0, speed: spd, hp: 3, alive: true,
    };
}
const enemies = [
    mkEnemy(100, [[5.5, 5.5], [5.5, 8.5], [8.5, 8.5], [8.5, 5.5]], 1.8),
    mkEnemy(101, [[11.5, 3.5], [11.5, 8.5]], 1.2),
    mkEnemy(102, [[3.5, 13.5], [7.5, 13.5]], 1.4),
    mkEnemy(103, [[18.5, 3.5], [18.5, 8.5], [21.5, 8.5], [21.5, 3.5]], 1.6),
    mkEnemy(104, [[14.5, 11.5], [18.5, 11.5]], 1.0),
    mkEnemy(105, [[5.5, 18.5], [10.5, 18.5], [10.5, 21.5], [5.5, 21.5]], 1.5),
    mkEnemy(106, [[18.5, 18.5], [21.5, 18.5]], 1.3),
];
const pickups = [
    { id: 200, x: 7.5, y: 1.5, type: 'ammo', taken: false },
    { id: 201, x: 3.5, y: 7.5, type: 'health', taken: false },
    { id: 202, x: 14.5, y: 7.5, type: 'ammo', taken: false },
    { id: 203, x: 1.5, y: 14.5, type: 'health', taken: false },
    { id: 204, x: 21.5, y: 14.5, type: 'ammo', taken: false },
    { id: 205, x: 11.5, y: 18.5, type: 'health', taken: false },
    { id: 206, x: 18.5, y: 21.5, type: 'ammo', taken: false },
];
// ─── Main ───────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
async function bootstrap() {
    const engine = await RetroEngine.nes(canvas, 2);
    const scene = new Scene(engine);
    const raycaster = new Raycaster(engine, { cols: MC, rows: MR, cells: MAP });
    // Upload textures (1-indexed for raycaster)
    raycaster.setTextureFromPixels(1, genTechWall(TEX), TEX);
    raycaster.setTextureFromPixels(2, genBrickWall(TEX), TEX);
    raycaster.setTextureFromPixels(3, genHellStone(TEX), TEX);
    raycaster.setTextureFromPixels(4, genMetalDoor(TEX), TEX);
    raycaster.setTextureFromPixels(5, genDemonSprite(TEX), TEX);
    // Dark DOOM atmosphere
    raycaster.setFloorColor(25, 20, 18);
    raycaster.setCeilingColor(8, 5, 5);
    raycaster.setFog(14, 0, 0, 0);
    raycaster.setPos(1.5, 1.5, 0.8);
    // Place billboards
    for (const e of enemies)
        raycaster.addBillboard(e.id, e.x, e.y, 5, 0.7);
    for (const p of pickups)
        raycaster.addBillboard(p.id, p.x, p.y, 4, 0.3);
    const font = BitmapFont.builtin(engine);
    // Sound channels
    const sfxBoom = new SoundChannel(engine, 0);
    const sfxCrack = new SoundChannel(engine, 1);
    const sfxHurt = new SoundChannel(engine, 2);
    const sfxPickup = new SoundChannel(engine, 3);
    // ─── Music: DOOM E1M1-inspired dark driving riff ──────────────────
    const music = new MusicPlayer(engine);
    music.play(
    // Bass (ch0 → pulse50): driving E minor
    'E2:8 E2:8 E3:16 E3:16 E2:8 D2:8 E2:8 REST:16 A1:16 E2:8 ' +
        'E2:8 E2:8 G2:8 E2:8 B1:8 A1:8 E2:4 ' +
        'E2:8 E2:8 E3:16 E3:16 E2:8 D2:8 C2:8 D2:4 E2:8 REST:8' +
        ' | ' +
        // Lead (ch1 → triangle): aggressive minor melody
        'REST:4 E4:8 E4:16 E4:16 G4:8 E4:8 D4:8 C4:4 ' +
        'REST:8 E4:8 E4:16 E4:16 A4:8 G4:8 E4:8 D4:4 ' +
        'C4:8 D4:8 E4:4 G4:8 A4:8 G4:4 E4:8 REST:8', 150);
    const saves = new SaveManager(engine);
    saves.autoload('doom-save');
    // ─── State ────────────────────────────────────────────────────────
    let hp = 100, ammo = 24, kills = 0;
    let score = saves.get('hi') ?? 0;
    let flashTimer = 0, hurtCd = 0;
    let wantShoot = false, shootAnim = 0;
    let dead = false;
    const keys = {};
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key.toLowerCase() === 'z' || e.key === ' ')
            wantShoot = true;
        if (e.key === 'Enter' && dead)
            restartGame();
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
    function restartGame() {
        hp = 100;
        ammo = 24;
        kills = 0;
        dead = false;
        shootAnim = 0;
        flashTimer = 0;
        hurtCd = 0;
        raycaster.setPos(1.5, 1.5, 0.8);
        for (const e of enemies) {
            e.alive = true;
            e.hp = 3;
            e.x = e.path[0].x;
            e.y = e.path[0].y;
            e.pathIdx = 0;
            engine.raw.raycaster_add_billboard(e.id, e.x, e.y, 5, 0.7);
        }
        for (const p of pickups) {
            p.taken = false;
            engine.raw.raycaster_add_billboard(p.id, p.x, p.y, 4, 0.3);
        }
        music.play('E2:8 E2:8 E3:16 E3:16 E2:8 D2:8 E2:8 REST:16 A1:16 E2:8 ' +
            'E2:8 E2:8 G2:8 E2:8 B1:8 A1:8 E2:4 ' +
            'E2:8 E2:8 E3:16 E3:16 E2:8 D2:8 C2:8 D2:4 E2:8 REST:8' +
            ' | ' +
            'REST:4 E4:8 E4:16 E4:16 G4:8 E4:8 D4:8 C4:4 ' +
            'REST:8 E4:8 E4:16 E4:16 A4:8 G4:8 E4:8 D4:4 ' +
            'C4:8 D4:8 E4:4 G4:8 A4:8 G4:4 E4:8 REST:8', 150);
    }
    // ─── Shotgun SFX ──────────────────────────────────────────────────
    function playShotgun() {
        sfxBoom.play(55, 'noise', 0.55);
        setTimeout(() => sfxBoom.stop(), 130);
        sfxCrack.play(900, 'noise', 0.2);
        setTimeout(() => sfxCrack.stop(), 35);
        // Pump action after delay
        setTimeout(() => {
            sfxCrack.play(180, 'noise', 0.12);
            setTimeout(() => sfxCrack.stop(), 50);
        }, 280);
    }
    // ─── Draw weapon ──────────────────────────────────────────────────
    function drawWeapon() {
        const W = engine.width, H = engine.height;
        const cx = Math.floor(W / 2);
        const bob = dead ? 0 : Math.sin(Date.now() / 200) * 1.5;
        const oy = Math.round(bob);
        const kickBack = shootAnim > 0.2 ? 6 : shootAnim > 0.1 ? 3 : 0;
        // Barrel
        engine.raw.debug_draw_rect(cx - 3, H - 52 + oy + kickBack, 6, 32, 110, 110, 115);
        engine.raw.debug_draw_rect(cx - 2, H - 52 + oy + kickBack, 2, 32, 135, 135, 140);
        // Muzzle tip
        engine.raw.debug_draw_rect(cx - 4, H - 54 + oy + kickBack, 8, 3, 85, 85, 90);
        // Grip
        engine.raw.debug_draw_rect(cx - 6, H - 22 + oy, 12, 22, 70, 45, 25);
        engine.raw.debug_draw_rect(cx - 5, H - 20 + oy, 10, 18, 85, 55, 30);
        // Pump
        engine.raw.debug_draw_rect(cx - 5, H - 36 + oy + (kickBack > 3 ? 4 : 0), 10, 5, 80, 80, 85);
        // Muzzle flash
        if (shootAnim > 0.22) {
            engine.raw.debug_draw_rect(cx - 10, H - 68 + oy, 20, 16, 255, 220, 80);
            engine.raw.debug_draw_rect(cx - 6, H - 62 + oy, 12, 10, 255, 255, 180);
            engine.raw.debug_draw_rect(cx - 2, H - 72 + oy, 4, 8, 255, 250, 200);
        }
    }
    // ─── Game Loop ────────────────────────────────────────────────────
    engine.loop((dt) => {
        scene.update(dt);
        if (dead) {
            // Red tint
            engine.raw.draw_overlay_rect(120, 0, 0, 80);
            font.draw('YOU DIED', 88, 100, 1);
            font.draw('Press ENTER', 76, 116, 1);
            font.draw(`KILLS: ${kills}/${enemies.length}`, 80, 136, 1);
            drawWeapon();
            return;
        }
        // ── Movement ──
        let fwd = 0, str = 0, trn = 0;
        if (keys['w'] || engine.input.held(0, 'up'))
            fwd = 1;
        if (keys['s'] || engine.input.held(0, 'down'))
            fwd = -1;
        if (keys['a'])
            str = -1;
        if (keys['d'])
            str = 1;
        if (keys['q'] || engine.input.held(0, 'left'))
            trn = -1;
        if (keys['e'] || engine.input.held(0, 'right'))
            trn = 1;
        engine.raw.raycaster_move(fwd, str, trn);
        // ── Shoot ──
        if (shootAnim > 0)
            shootAnim -= dt;
        if (wantShoot && ammo > 0 && shootAnim <= 0) {
            wantShoot = false;
            ammo--;
            shootAnim = 0.4;
            playShotgun();
            engine.shake(3, 0.12);
            // Hitscan
            const pos = raycaster.pos;
            const dX = Math.cos(pos.angle), dY = Math.sin(pos.angle);
            for (const e of enemies) {
                if (!e.alive)
                    continue;
                const ex = e.x - pos.x, ey = e.y - pos.y;
                const dist = Math.sqrt(ex * ex + ey * ey);
                if (dist > 12)
                    continue;
                const dot = (ex * dX + ey * dY) / dist;
                const cross = Math.abs(ex * dY - ey * dX) / dist;
                if (dot > 0.7 && cross < 0.25) {
                    e.hp--;
                    if (e.hp <= 0) {
                        e.alive = false;
                        kills++;
                        score += 100;
                        engine.raw.raycaster_remove_billboard(e.id);
                        engine.shake(5, 0.2);
                    }
                }
            }
        }
        else {
            wantShoot = false;
        }
        // ── Enemy AI ──
        const pPos = raycaster.pos;
        for (const e of enemies) {
            if (!e.alive)
                continue;
            const tgt = e.path[e.pathIdx];
            const dx = tgt.x - e.x, dy = tgt.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.15)
                e.pathIdx = (e.pathIdx + 1) % e.path.length;
            // Chase if player nearby
            const pdx = pPos.x - e.x, pdy = pPos.y - e.y;
            const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pDist < 7) {
                e.x += (pdx / pDist) * e.speed * 1.3 * dt;
                e.y += (pdy / pDist) * e.speed * 1.3 * dt;
            }
            else {
                e.x += (dx / Math.max(dist, 0.01)) * e.speed * dt;
                e.y += (dy / Math.max(dist, 0.01)) * e.speed * dt;
            }
            engine.raw.raycaster_remove_billboard(e.id);
            engine.raw.raycaster_add_billboard(e.id, e.x, e.y, 5, 0.7);
            // Melee damage
            if (pDist < 0.8 && hurtCd <= 0) {
                hp -= 10;
                flashTimer = 0.25;
                hurtCd = 0.7;
                sfxHurt.play(50, 'noise', 0.45);
                setTimeout(() => sfxHurt.stop(), 140);
                engine.shake(5, 0.18);
            }
        }
        // ── Pickups ──
        for (const p of pickups) {
            if (p.taken)
                continue;
            const dx = pPos.x - p.x, dy = pPos.y - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < 0.6) {
                p.taken = true;
                engine.raw.raycaster_remove_billboard(p.id);
                if (p.type === 'ammo')
                    ammo = Math.min(99, ammo + 12);
                else
                    hp = Math.min(100, hp + 25);
                sfxPickup.play(600, 'pulse25', 0.25);
                setTimeout(() => { sfxPickup.play(900, 'pulse25', 0.2); setTimeout(() => sfxPickup.stop(), 50); }, 70);
            }
        }
        // ── Timers ──
        if (hurtCd > 0)
            hurtCd -= dt;
        if (flashTimer > 0) {
            flashTimer -= dt;
            engine.raw.draw_overlay_rect(200, 0, 0, Math.round(flashTimer * 500));
        }
        // ── Death ──
        if (hp <= 0) {
            hp = 0;
            dead = true;
            music.stop();
            sfxHurt.play(35, 'noise', 0.5);
            setTimeout(() => sfxHurt.stop(), 500);
            if (score > (saves.get('hi') ?? 0)) {
                saves.set('hi', score);
                saves.autosave('doom-save');
            }
        }
        // ── HUD ──
        const W = engine.width;
        // Dark status bar
        engine.raw.debug_draw_rect(0, 0, W, 24, 15, 10, 10);
        engine.raw.debug_draw_rect(0, 24, W, 1, 80, 30, 30);
        // HP + bar
        font.draw(`HP:${hp}`, 4, 3, 1);
        engine.raw.debug_draw_rect(4, 14, 44, 5, 30, 8, 8);
        const barW = Math.floor((hp / 100) * 44);
        const br = hp > 50 ? 0 : hp > 25 ? 200 : 220;
        const bg = hp > 50 ? 180 : hp > 25 ? 160 : 0;
        engine.raw.debug_draw_rect(4, 14, barW, 5, br, bg, 0);
        font.draw(`AMMO:${ammo}`, 60, 3, 1);
        font.draw(`KILLS:${kills}/${enemies.length}`, 130, 3, 1);
        font.draw(`HI:${score}`, W - 64, 3, 1);
        // Crosshair
        const chx = Math.floor(W / 2), chy = Math.floor(engine.height / 2);
        engine.raw.debug_draw_rect(chx - 4, chy, 3, 1, 0, 255, 0);
        engine.raw.debug_draw_rect(chx + 2, chy, 3, 1, 0, 255, 0);
        engine.raw.debug_draw_rect(chx, chy - 4, 1, 3, 0, 255, 0);
        engine.raw.debug_draw_rect(chx, chy + 2, 1, 3, 0, 255, 0);
        // Weapon
        drawWeapon();
        // Win
        if (kills >= enemies.length) {
            font.draw('AREA CLEARED!', 72, 110, 1);
            font.draw('Find the exit!', 68, 126, 1);
        }
    });
}
bootstrap().catch(e => {
    document.body.style.color = '#f00';
    document.body.innerText = 'DOOM ERROR: ' + String(e);
    console.error(e);
});
