/**
 * DUST PROTOCOL — a round-based first-person shooter on the raycaster.
 *
 * Every shot in this game, whether the player's or a bot's, is one call to
 * `raycaster.hitscan`: the same DDA the renderer walks for a screen column.
 * That is the point of putting hitscan in the engine rather than in the game
 * — a shot cannot disagree with what is on screen, and a bot cannot hit
 * through a wall the player can see is solid.
 *
 * Bots navigate with `raycaster.findPath` (A* over the same cells the
 * renderer draws) and decide whether they can see you with
 * `raycaster.lineOfSight`. Their behaviour lives in `bots.ts`.
 *
 * Multiplayer is real but local: `net.ts` carries players between tabs of the
 * same browser over BroadcastChannel. Open the page twice and the second tab
 * joins the match as a live opponent, taking a bot's slot. Reaching another
 * machine needs a socket the engine deliberately does not open — see the
 * comments in `net.ts`.
 */
import { Cathode, Raycaster, SoundChannel } from '@cathode/sdk';
import {
  MAP, COLS, ROWS, TEX, charAt, buildCells, spotsFor,
  W_CONCRETE, W_CRATE, W_SANDSTONE, W_DOOR,
  TEX_ENEMY, TEX_ALLY, TEX_BOMB, TEX_SPARK,
  concreteTexture, crateTexture, sandstoneTexture, doorTexture,
  enemyTexture, allyTexture, bombTexture, sparkTexture,
} from './map';
import { DIFFICULTY, stepBot, type BotTuning, type BotWorld, type Fighter, type Team } from './bots';
import { NetSession, type PeerState } from './net';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimap = document.getElementById('minimap') as HTMLCanvasElement;

// --- Rules -----------------------------------------------------------------
const ROUND_SECONDS = 105;
const ROUNDS_TO_WIN = 4;
const MAG_SIZE = 30;
const RESERVE = 90;
const RELOAD_TIME = 2.1;
const FIRE_INTERVAL = 0.11;
const PLAYER_DAMAGE = 26;
const PLAYER_RANGE = 24;
const HIT_RADIUS = 0.3;
const MOVE_SPEED = 2.4;
const TURN_SPEED = 2.4;
const BODY_RADIUS = 0.24;
const RECOIL_PER_SHOT = 0.02;   // radians of climb
const RECOIL_DECAY = 6;
const SPREAD_MOVING = 0.05;
const FREEZE_TIME = 2.0;        // seconds before a round goes live
const OVER_TIME = 3.0;          // seconds to read the round result

const PLAYER_ID = 1;
const BOT_ID_BASE = 100;
const BOMB_ID = 900;
const SPARK_ID = 901;

type Phase = 'freeze' | 'live' | 'over' | 'match';

async function initGame() {
  const engine = await Cathode.nes(canvas, 3);
  const sfx = new SoundChannel(engine, 0);
  const tone = new SoundChannel(engine, 1);

  const el = {
    scoreA: document.getElementById('score-a')!,
    scoreD: document.getElementById('score-d')!,
    round: document.getElementById('round')!,
    timer: document.getElementById('timer')!,
    hp: document.getElementById('hp')!,
    mag: document.getElementById('mag')!,
    reserve: document.getElementById('reserve')!,
    banner: document.getElementById('banner')!,
    killfeed: document.getElementById('killfeed')!,
    netstate: document.getElementById('netstate')!,
    difficulty: document.getElementById('difficulty') as HTMLSelectElement,
    squad: document.getElementById('squad') as HTMLSelectElement,
    restart: document.getElementById('restart') as HTMLButtonElement,
  };
  const mctx = minimap.getContext('2d')!;

  // --- Arena ---------------------------------------------------------------
  const rc = new Raycaster(engine, { cols: COLS, rows: ROWS, cells: buildCells() });
  rc.setTextureFromPixels(W_CONCRETE, concreteTexture(), TEX);
  rc.setTextureFromPixels(W_CRATE, crateTexture(), TEX);
  rc.setTextureFromPixels(W_SANDSTONE, sandstoneTexture(), TEX);
  rc.setTextureFromPixels(W_DOOR, doorTexture(), TEX);
  rc.setTextureFromPixels(TEX_ENEMY + 1, enemyTexture(), TEX);
  rc.setTextureFromPixels(TEX_ALLY + 1, allyTexture(), TEX);
  rc.setTextureFromPixels(TEX_BOMB + 1, bombTexture(), TEX);
  rc.setTextureFromPixels(TEX_SPARK + 1, sparkTexture(), TEX);
  rc.setFloorColor(62, 54, 42);
  rc.setCeilingColor(24, 22, 26);
  rc.setFog(20, 40, 34, 28);

  const attackSpawns = spotsFor('T');
  const defendSpawns = spotsFor('C');
  const siteA = spotsFor('A');
  const siteB = spotsFor('B');

  // --- Match state ---------------------------------------------------------
  let tuning: BotTuning = DIFFICULTY.regular;
  let squadSize = 3;
  let fighters: Fighter[] = [];
  let player!: Fighter;
  let phase: Phase = 'freeze';
  let phaseIn = FREEZE_TIME;
  let clock = ROUND_SECONDS;
  let score = { attack: 0, defend: 0 };
  let roundNo = 1;
  let mag = MAG_SIZE;
  let reserve = RESERVE;
  let reloadIn = 0;
  let fireIn = 0;
  let recoil = 0;
  let sparkIn = 0;
  let seed = 0x2f6e2b1;
  let botsFrozen = false;

  /** Deterministic RNG so a match can be replayed from a seed. */
  const rng = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0xffffffff;
  };

  // --- Networking ----------------------------------------------------------
  const net = new NetSession(`OP-${Math.floor(Math.random() * 900 + 100)}`);
  net.connect();
  const remoteFighters = new Map<number, Fighter>();
  const REMOTE_ID_BASE = 500;
  let nextRemoteSlot = 0;
  const remoteSlots = new Map<number, number>();

  net.onHit = () => damage(player, PLAYER_DAMAGE, 'a rival operator');

  function remoteFighterFor(peer: PeerState): Fighter {
    let f = remoteFighters.get(peer.id);
    if (!f) {
      let slot = remoteSlots.get(peer.id);
      if (slot === undefined) {
        slot = REMOTE_ID_BASE + nextRemoteSlot++;
        remoteSlots.set(peer.id, slot);
      }
      f = {
        id: slot, team: peer.team, x: peer.x, y: peer.y,
        angle: peer.angle, health: peer.health, alive: peer.alive,
      };
      remoteFighters.set(peer.id, f);
      fighters.push(f);
      rc.addBillboard(f.id, f.x, f.y, f.team === player.team ? TEX_ALLY : TEX_ENEMY, 0.85);
      rc.setBillboardElevation(f.id, 0.42);
    }
    return f;
  }

  // --- Killfeed ------------------------------------------------------------
  const feed: { text: string; life: number }[] = [];
  function announce(text: string) {
    feed.push({ text, life: 4.5 });
    if (feed.length > 5) feed.shift();
    el.killfeed.innerHTML = feed.map((f) => `<div>${f.text}</div>`).join('');
  }

  const nameOf = (f: Fighter) =>
    f.id === PLAYER_ID ? 'YOU'
      : f.id >= REMOTE_ID_BASE ? `PLAYER ${f.id - REMOTE_ID_BASE + 2}`
        : `${f.team === 'attack' ? 'A' : 'D'}-BOT ${f.id - BOT_ID_BASE + 1}`;

  // --- Round setup ---------------------------------------------------------
  function billboardFor(f: Fighter): number {
    return f.team === (player?.team ?? 'attack') ? TEX_ALLY : TEX_ENEMY;
  }

  function spawnRound() {
    for (const f of fighters) rc.removeBillboard(f.id);
    rc.removeBillboard(BOMB_ID);
    rc.removeBillboard(SPARK_ID);
    remoteFighters.clear();
    fighters = [];

    // The player always attacks, so the objective reads the same every round.
    player = {
      id: PLAYER_ID, team: 'attack',
      x: attackSpawns[0].x, y: attackSpawns[0].y, angle: 0.5,
      health: 100, alive: true,
    };
    fighters.push(player);

    // A live opponent takes a bot's slot rather than being added on top, so
    // the round stays the size the player chose.
    const humanEnemies = net.livePeers.filter((p) => p.team === 'defend').length;
    const humanAllies = net.livePeers.filter((p) => p.team === 'attack').length;

    let botId = BOT_ID_BASE;
    const place = (team: Team, spawns: { x: number; y: number }[], count: number) => {
      for (let i = 0; i < count; i++) {
        const spawn = spawns[i % spawns.length];
        fighters.push({
          id: botId++, team,
          // Fan out around the spawn cell so bodies do not start inside
          // each other and immediately shove apart.
          x: spawn.x + (rng() - 0.5) * 0.6,
          y: spawn.y + (rng() - 0.5) * 0.6,
          angle: team === 'attack' ? 0.5 : Math.PI * 1.2,
          health: 100, alive: true, state: 'advance',
        });
      }
    };
    place('attack', attackSpawns, Math.max(0, squadSize - 1 - humanAllies));
    place('defend', defendSpawns, Math.max(0, squadSize - humanEnemies));

    for (const f of fighters) {
      if (f.id === PLAYER_ID) continue;
      rc.addBillboard(f.id, f.x, f.y, billboardFor(f), 0.85);
      rc.setBillboardElevation(f.id, 0.42);
    }

    rc.setPos(player.x, player.y, player.angle);
    rc.setEyeHeight(0.5);
    mag = MAG_SIZE;
    reserve = RESERVE;
    reloadIn = 0;
    recoil = 0;
    clock = ROUND_SECONDS;
    phase = 'freeze';
    phaseIn = FREEZE_TIME;
    el.banner.textContent = `ROUND ${roundNo}`;
    refreshHud();
  }

  function newMatch() {
    tuning = DIFFICULTY[el.difficulty.value] ?? DIFFICULTY.regular;
    squadSize = Number(el.squad.value) || 3;
    score = { attack: 0, defend: 0 };
    roundNo = 1;
    feed.length = 0;
    el.killfeed.innerHTML = '';
    spawnRound();
  }

  el.restart.addEventListener('click', newMatch);

  // --- Damage --------------------------------------------------------------
  function damage(victim: Fighter, amount: number, by: string) {
    if (!victim.alive || phase !== 'live') return;
    victim.health -= amount;
    if (victim.id === PLAYER_ID) {
      engine.raw.shake(3, 0.15);
      sfx.play(140, 'noise', 0.4);
    }
    if (victim.health > 0) {
      refreshHud();
      return;
    }

    victim.alive = false;
    victim.health = 0;
    rc.removeBillboard(victim.id);
    announce(`${by} &rarr; ${nameOf(victim)}`);
    tone.play(victim.id === PLAYER_ID ? 90 : 420, 'triangle', 0.4);
    refreshHud();
  }

  const world: BotWorld = {
    rc,
    get fighters() { return fighters; },
    objectiveFor(bot) {
      // Attackers push a site; defenders hold the one they are nearest.
      const site = bot.id % 2 === 0 ? siteA : siteB;
      const goal = site[Math.floor(rng() * site.length) % site.length];
      return { x: Math.floor(goal.x), y: Math.floor(goal.y) };
    },
    onHit(shooter, victim, amount) {
      damage(victim, amount, nameOf(shooter));
    },
    onFire(shooter, hitX, hitY) {
      // Only draw a spark for shots the player could plausibly notice.
      if (rc.lineOfSight(player.x, player.y, shooter.x, shooter.y)) {
        showSpark(hitX, hitY);
        sfx.play(200 + rng() * 80, 'noise', 0.18);
      }
    },
    rng,
  };

  function showSpark(x: number, y: number) {
    rc.removeBillboard(SPARK_ID);
    rc.addBillboard(SPARK_ID, x, y, TEX_SPARK, 0.3);
    rc.setBillboardElevation(SPARK_ID, 0.45);
    sparkIn = 0.09;
  }

  // --- Player shooting -----------------------------------------------------
  function fire(moving: boolean) {
    if (mag <= 0 || reloadIn > 0 || !player.alive || phase !== 'live') return;
    mag--;
    fireIn = FIRE_INTERVAL;

    // Recoil climbs while you hold the trigger and decays when you stop, and
    // moving widens the cone: standing still and tapping is the accurate way
    // to shoot, exactly as the genre expects.
    const cone = recoil + (moving ? SPREAD_MOVING : 0);
    const aim = player.angle + (rng() - 0.5) * 2 * cone;
    recoil = Math.min(0.12, recoil + RECOIL_PER_SHOT);

    const shot = rc.hitscan(player.x, player.y, aim, PLAYER_RANGE, HIT_RADIUS, PLAYER_ID);
    showSpark(shot.x, shot.y);
    sfx.play(260, 'noise', 0.3);

    let hitPeer: number | null = null;
    if (shot.billboard) {
      const victim = fighters.find((f) => f.id === shot.billboard!.id);
      if (victim && victim.alive && victim.team !== player.team) {
        damage(victim, PLAYER_DAMAGE, 'YOU');
        for (const [peerId, slot] of remoteSlots) {
          if (slot === victim.id) hitPeer = peerId;
        }
      }
    }
    net.reportShot(shot.x, shot.y, hitPeer);
    refreshHud();
  }

  function reload() {
    if (reloadIn > 0 || mag === MAG_SIZE || reserve <= 0) return;
    reloadIn = RELOAD_TIME;
    sfx.play(150, 'pulse50', 0.25);
  }

  // --- HUD -----------------------------------------------------------------
  function refreshHud() {
    el.scoreA.textContent = String(score.attack);
    el.scoreD.textContent = String(score.defend);
    el.hp.textContent = String(Math.max(0, Math.round(player?.health ?? 0)));
    el.hp.className = (player?.health ?? 100) <= 35 ? 'hurt' : '';
    el.mag.textContent = String(mag);
    el.reserve.textContent = String(reserve);
    el.timer.textContent =
      `${Math.floor(Math.max(0, clock) / 60)}:${String(Math.floor(Math.max(0, clock) % 60)).padStart(2, '0')}`;
    el.round.firstChild!.textContent = `ROUND ${roundNo} · `;
  }

  function livingOf(team: Team): number {
    return fighters.filter((f) => f.team === team && f.alive).length;
  }

  function endRound(winner: Team, why: string) {
    phase = 'over';
    phaseIn = OVER_TIME;
    score[winner]++;
    el.banner.textContent = `${winner === 'attack' ? 'ATTACK' : 'DEFEND'} WINS — ${why}`;
    tone.play(winner === player.team ? 700 : 220, 'triangle', 0.5);
    refreshHud();
  }

  // --- Minimap -------------------------------------------------------------
  function drawMinimap() {
    const s = Math.min(minimap.width / COLS, minimap.height / ROWS);
    mctx.clearRect(0, 0, minimap.width, minimap.height);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const ch = charAt(col, row);
        if (ch === '#') mctx.fillStyle = '#4a4438';
        else if (ch === '=') mctx.fillStyle = '#8a6030';
        else if (ch === 's') mctx.fillStyle = '#7a6844';
        else if (ch === '+') mctx.fillStyle = '#3a362e';
        else if (ch === 'A' || ch === 'B') mctx.fillStyle = '#5c4a20';
        else mctx.fillStyle = '#1a1712';
        mctx.fillRect(col * s, row * s, Math.ceil(s), Math.ceil(s));
      }
    }

    for (const f of fighters) {
      if (!f.alive || f.id === PLAYER_ID) continue;
      // Enemies show only while the player can actually see them; a minimap
      // that reveals every position removes the entire game.
      const visible = f.team === player.team || rc.lineOfSight(player.x, player.y, f.x, f.y);
      if (!visible) continue;
      mctx.fillStyle = f.team === player.team ? '#4a7cd4' : '#d44a34';
      mctx.fillRect(f.x * s - 1.5, f.y * s - 1.5, 3, 3);
    }

    mctx.fillStyle = '#ffd97a';
    mctx.beginPath();
    mctx.arc(player.x * s, player.y * s, 2.2, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#ffd97a';
    mctx.beginPath();
    mctx.moveTo(player.x * s, player.y * s);
    mctx.lineTo((player.x + Math.cos(player.angle) * 2) * s, (player.y + Math.sin(player.angle) * 2) * s);
    mctx.stroke();
  }

  // --- Boot ----------------------------------------------------------------
  newMatch();

  // Exposed for the headless checks in the repo's verification scripts.
  (window as unknown as Record<string, unknown>).__dust = {
    state: () => ({
      phase, clock, roundNo, score: { ...score }, mag, reserve,
      hp: player.health, alive: player.alive,
      x: player.x, y: player.y, angle: player.angle,
      alliesAlive: livingOf('attack'), enemiesAlive: livingOf('defend'),
      bots: fighters.filter((f) => f.id !== PLAYER_ID).length,
      peers: net.livePeers.length, netId: net.id, solo: net.solo,
    }),
    teleport: (x: number, y: number, angle = 0) => {
      player.x = x; player.y = y; player.angle = angle;
      rc.setPos(x, y, angle);
    },
    /** Stand one enemy exactly where the test wants it and retire the rest. */
    stage: (x: number, y: number) => {
      const dummy = fighters.find((f) => f.team === 'defend');
      if (!dummy) return -1;
      // Retire every other bot, allies included: a teammate wandering into
      // the firing lane absorbs the shot, which is right in a match and
      // useless in a test of whether the shot itself works.
      for (const f of fighters) {
        if (f === dummy || f.id === PLAYER_ID || !f.alive) continue;
        f.alive = false;
        rc.removeBillboard(f.id);
      }
      dummy.x = x;
      dummy.y = y;
      dummy.health = 100;
      if (dummy.alive) {
        rc.updateBillboard(dummy.id, x, y);
      } else {
        // A dummy revived after dying has no billboard left, and a fighter
        // with no billboard is a fighter no bullet can reach.
        dummy.alive = true;
        rc.addBillboard(dummy.id, x, y, billboardFor(dummy), 0.85);
        rc.setBillboardElevation(dummy.id, 0.42);
      }
      return dummy.id;
    },
    /** Hold the bots still so a shot test measures the shot, not the AI. */
    freezeBots: (on: boolean) => { botsFrozen = on; },
    goLive: () => { phase = 'live'; phaseIn = 0; el.banner.textContent = ''; },
    /** Start a fresh, already-live round so a check begins from known state. */
    reset: () => {
      botsFrozen = false;
      spawnRound();
      phase = 'live';
      phaseIn = 0;
      el.banner.textContent = '';
    },
    refill: () => { mag = MAG_SIZE; reserve = RESERVE; reloadIn = 0; },
    fire: () => { fireIn = 0; fire(false); },
    hpOf: (id: number) => fighters.find((f) => f.id === id)?.health ?? -1,
    botPositions: () => fighters
      .filter((f) => f.id !== PLAYER_ID && f.id < REMOTE_ID_BASE)
      .map((f) => ({ id: f.id, x: f.x, y: f.y, state: f.state })),
    remoteCount: () => remoteFighters.size,
  };

  engine.loop((dt) => {
    // --- Phases ------------------------------------------------------------
    if (phase === 'freeze') {
      phaseIn -= dt;
      if (phaseIn <= 0) {
        phase = 'live';
        el.banner.textContent = '';
      }
    } else if (phase === 'over') {
      phaseIn -= dt;
      if (phaseIn <= 0) {
        if (score.attack >= ROUNDS_TO_WIN || score.defend >= ROUNDS_TO_WIN) {
          phase = 'match';
          el.banner.textContent =
            score.attack > score.defend ? 'ATTACK TAKES THE MATCH' : 'DEFEND TAKES THE MATCH';
        } else {
          roundNo++;
          spawnRound();
        }
      }
    } else if (phase === 'match') {
      if (engine.input.justPressed(0, 'start')) newMatch();
    }

    // --- Peers -------------------------------------------------------------
    // A remote player is another tab's authoritative body; we mirror it into
    // a fighter so bots, hitscan and the minimap treat it like anyone else.
    for (const peer of net.livePeers) {
      const f = remoteFighterFor(peer);
      f.x = peer.x; f.y = peer.y; f.angle = peer.angle;
      f.health = peer.health;
      if (f.alive !== peer.alive) {
        f.alive = peer.alive;
        if (!peer.alive) rc.removeBillboard(f.id);
        else {
          rc.addBillboard(f.id, f.x, f.y, billboardFor(f), 0.85);
          rc.setBillboardElevation(f.id, 0.42);
        }
      }
      if (f.alive) rc.updateBillboard(f.id, f.x, f.y);
    }
    el.netstate.textContent = net.solo
      ? 'SOLO — open this page in a second tab to play together'
      : `NETPLAY — ${net.livePeers.length} other operator${net.livePeers.length === 1 ? '' : 's'} (${net.role})`;

    // --- Player ------------------------------------------------------------
    if (player.alive && (phase === 'live' || phase === 'freeze')) {
      let forward = 0;
      let strafe = 0;
      let turn = 0;
      if (engine.input.held(0, 'up')) forward += 1;
      if (engine.input.held(0, 'down')) forward -= 1;
      if (engine.input.held(0, 'left')) turn -= 1;
      if (engine.input.held(0, 'right')) turn += 1;
      if (engine.input.held(0, 'l')) strafe -= 1;
      if (engine.input.held(0, 'r')) strafe += 1;

      player.angle += turn * TURN_SPEED * dt;
      const step = MOVE_SPEED * dt;
      const dx = Math.cos(player.angle) * forward * step
        + Math.cos(player.angle + Math.PI / 2) * strafe * step;
      const dy = Math.sin(player.angle) * forward * step
        + Math.sin(player.angle + Math.PI / 2) * strafe * step;
      const moved = rc.slide(player.x, player.y, dx, dy, BODY_RADIUS);
      player.x = moved.x;
      player.y = moved.y;
      rc.setPos(player.x, player.y, player.angle);

      fireIn = Math.max(0, fireIn - dt);
      recoil = Math.max(0, recoil - RECOIL_DECAY * recoil * dt);

      if (reloadIn > 0) {
        reloadIn -= dt;
        if (reloadIn <= 0) {
          const want = Math.min(MAG_SIZE - mag, reserve);
          mag += want;
          reserve -= want;
          refreshHud();
        }
      }

      if (engine.input.justPressed(0, 'b')) reload();
      if (engine.input.held(0, 'a') && fireIn <= 0) fire(forward !== 0 || strafe !== 0);
      if (mag === 0 && reloadIn <= 0) reload();
    }

    // --- Bots --------------------------------------------------------------
    if (phase === 'live') {
      clock -= dt;
      if (!botsFrozen) {
        for (const f of fighters) {
          if (f.id === PLAYER_ID || f.id >= REMOTE_ID_BASE) continue;
          stepBot(world, f, tuning, dt);
          if (f.alive) rc.updateBillboard(f.id, f.x, f.y);
        }
      }

      // --- Round end ---------------------------------------------------------
      if (!player.alive && livingOf('attack') === 0) endRound('defend', 'ATTACK ELIMINATED');
      else if (livingOf('defend') === 0) endRound('attack', 'DEFEND ELIMINATED');
      else if (clock <= 0) endRound('defend', 'TIME');
    }

    // --- Presentation ------------------------------------------------------
    if (sparkIn > 0) {
      sparkIn -= dt;
      if (sparkIn <= 0) rc.removeBillboard(SPARK_ID);
    }
    // The horizon lifts with recoil, so a long burst visibly climbs.
    rc.setPitch(-recoil * 300);

    for (let i = feed.length - 1; i >= 0; i--) {
      feed[i].life -= dt;
      if (feed[i].life <= 0) {
        feed.splice(i, 1);
        el.killfeed.innerHTML = feed.map((f) => `<div>${f.text}</div>`).join('');
      }
    }

    net.update(dt, {
      id: net.id, name: net.name, team: player.team,
      x: player.x, y: player.y, angle: player.angle,
      health: player.health, alive: player.alive,
    });

    if (phase === 'live') refreshHud();
    drawMinimap();
  });

  window.addEventListener('beforeunload', () => net.disconnect());
}

initGame().catch((err) => {
  document.getElementById('banner')!.textContent = `FAILED TO START: ${err}`;
});
