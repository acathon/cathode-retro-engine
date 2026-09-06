/**
 * PIXEL PATIENCE — Klondike solitaire, played with a d-pad.
 *
 * The rules live in `klondike.ts` with no reference to the engine, so they
 * are unit-tested on their own; this file is the table: it lays the piles
 * out, keeps a cursor moving between them, and draws the result.
 *
 * Two things about it are worth reading as engine examples. It runs at
 * 464x416 on the **custom** hardware profile rather than a console preset,
 * because a card is 58x80 and seven columns of them do not fit on an NES.
 * And it puts every one of the 52 cards on screen as its own sprite — which
 * only became possible once hardware sprite caps stopped being enforced at
 * run time.
 */
import { CARD_H, CARD_W, CardTable } from '@cathode/cards';
import { BitmapFont, Cathode, Scene, SoundChannel } from '@cathode/sdk';
import {
  FOUNDATION_0, PILE_COUNT, STOCK, TABLEAU_0, WASTE,
  applyMove, autoFinishStep, canAutoFinish, deal, drawFromStock, grab,
  isLegal, runLength, suggestDestination, top,
  type Game,
} from './klondike';

// --- Layout ----------------------------------------------------------------
const SCREEN_W = 464;
const SCREEN_H = 416;
const SCALE = 2;

const MARGIN = 17;
const COL_PITCH = CARD_W + 4;          // 7 columns fit exactly across the felt
const TOP_Y = 26;
const TABLEAU_Y = TOP_Y + CARD_H + 12;

/** Face-down cards overlap tightly; face-up ones show their rank corner. */
const DOWN_OFFSET = 6;
const UP_OFFSET = 16;

const HUD_Y = 8;

/** Screen position of pile `i`, and of card `n` within it. */
function pileX(pile: number): number {
  if (pile === STOCK) return MARGIN;
  if (pile === WASTE) return MARGIN + COL_PITCH;
  // Foundations sit at the right-hand four column slots, leaving a gap after
  // the waste so the two halves of the top row read as separate things.
  if (pile < TABLEAU_0) return MARGIN + COL_PITCH * (3 + (pile - FOUNDATION_0));
  return MARGIN + COL_PITCH * (pile - TABLEAU_0);
}

const pileY = (pile: number): number => (pile < TABLEAU_0 ? TOP_Y : TABLEAU_Y);

/** Vertical offset of card `n` inside a tableau pile. */
function cardOffset(game: Game, pile: number, n: number): number {
  if (pile < TABLEAU_0) return 0;
  let y = 0;
  const cards = game.piles[pile].cards;
  for (let i = 0; i < n; i++) y += cards[i].faceUp ? UP_OFFSET : DOWN_OFFSET;
  return y;
}

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await Cathode.custom(
    canvas,
    {
      width: SCREEN_W,
      height: SCREEN_H,
      fps: 60,
      audio_channels: 4,
      // 0 is unlimited. A full tableau is 52 cards plus overlays, which is
      // well past every console preset's budget — the point of the custom
      // profile is that the table decides its own size, not the hardware.
      sprite_limit: 0,
      scanlines: false,
      pixel_perfect: true,
      profile: 'Custom',
      title: 'Pixel Patience',
    } as never,
    SCALE,
  );

  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);
  engine.setBgColor(18, 62, 40);

  // --- Table ----------------------------------------------------------------
  // The shared layer owns the sheets, the felt and the sprite pools. It reads
  // `playing_cards.png` when one is there and draws its own deck when it is
  // not, so this file never learns which of the two it is showing.
  const table = await CardTable.create(engine, scene, {
    cardsUrl: new URL('../playing_cards.png', import.meta.url).href,
    width: SCREEN_W,
    height: SCREEN_H,
  });

  const sfxDeal = new SoundChannel(engine, 0);
  const sfxMove = new SoundChannel(engine, 1);
  const sfxBad = new SoundChannel(engine, 2);
  const sfxWin = new SoundChannel(engine, 3);

  const blip = (ch: SoundChannel, freq: number, wave: 'pulse25' | 'pulse50' | 'triangle' | 'noise', vol: number, ms: number) => {
    ch.play(freq, wave, vol);
    setTimeout(() => ch.stop(), ms);
  };

  // --- State ----------------------------------------------------------------
  let game: Game = deal(Date.now() & 0xffff);
  let cursor = TABLEAU_0;
  let depth = 1;
  /** Which pile the player has picked cards up from, or -1. */
  let heldFrom = -1;
  let heldCount = 0;
  let message = '';
  let messageTimer = 0;
  let elapsed = 0;
  let autoFinishing = false;
  let autoTimer = 0;
  let wins = Number(engine.raw.save_get(0, 'wins') ?? 0) || 0;

  const el = {
    status: document.getElementById('status')!,
    wins: document.getElementById('wins')!,
  };
  el.wins.textContent = String(wins);

  function say(text: string, seconds = 1.6): void {
    message = text;
    messageTimer = seconds;
  }

  function newGame(): void {
    game = deal((Date.now() ^ (Math.random() * 0xffff)) & 0xffff);
    cursor = TABLEAU_0;
    depth = 1;
    heldFrom = -1;
    heldCount = 0;
    elapsed = 0;
    autoFinishing = false;
    say('NEW DEAL');
    blip(sfxDeal, 320, 'pulse25', 0.3, 90);
  }

  /** Clamp the grab depth to what the pile under the cursor can actually give. */
  function clampDepth(): void {
    const pile = game.piles[cursor];
    const max = pile.kind === 'tableau' ? Math.max(1, runLength(pile)) : 1;
    depth = Math.max(1, Math.min(depth, max));
  }

  function pickUp(): void {
    const cards = grab(game.piles[cursor], depth);
    if (!cards.length) {
      blip(sfxBad, 110, 'noise', 0.2, 60);
      return;
    }
    heldFrom = cursor;
    heldCount = cards.length;
    blip(sfxMove, 520, 'pulse25', 0.18, 40);
  }

  function drop(): void {
    if (heldFrom === cursor) {                 // put them back down
      heldFrom = -1;
      heldCount = 0;
      return;
    }
    if (applyMove(game, { from: heldFrom, to: cursor, count: heldCount })) {
      heldFrom = -1;
      heldCount = 0;
      depth = 1;
      blip(sfxMove, 660, 'pulse50', 0.22, 55);
      checkWin();
    } else {
      say("THAT CARD WON'T GO THERE");
      blip(sfxBad, 110, 'noise', 0.22, 70);
    }
  }

  /** The one-key move: send what is under the cursor wherever it should go. */
  function smartMove(): void {
    const from = heldFrom >= 0 ? heldFrom : cursor;
    const count = heldFrom >= 0 ? heldCount : depth;
    const dest = suggestDestination(game, from, count);
    if (dest < 0) {
      say('NO MOVE FOR THAT CARD');
      blip(sfxBad, 110, 'noise', 0.2, 60);
      return;
    }
    applyMove(game, { from, to: dest, count });
    heldFrom = -1;
    heldCount = 0;
    depth = 1;
    blip(sfxMove, dest < TABLEAU_0 ? 780 : 660, 'pulse50', 0.22, 55);
    checkWin();
  }

  function checkWin(): void {
    if (game.won) {
      wins++;
      engine.raw.save_set(0, 'wins', String(wins));
      el.wins.textContent = String(wins);
      say('YOU GOT IT OUT!', 6);
      blip(sfxWin, 880, 'triangle', 0.4, 500);
      return;
    }
    if (canAutoFinish(game) && !autoFinishing) {
      autoFinishing = true;
      say('FINISHING…', 3);
    }
  }

  // --- Drawing --------------------------------------------------------------
  // One draw list per frame. The table hands out sprites in call order and
  // layers them the same way, so a card drawn later sits on top of one drawn
  // earlier — which is exactly how the piles overlap.
  let cardsDrawn = 0;

  function draw(): void {
    table.begin();
    cardsDrawn = 0;

    // Empty-pile outlines, so the table reads even with nothing on it.
    for (let i = 0; i < PILE_COUNT; i++) {
      if (game.piles[i].cards.length === 0 && i !== WASTE) {
        table.marker('empty', pileX(i), pileY(i));
      }
    }

    for (let i = 0; i < PILE_COUNT; i++) {
      const pile = game.piles[i];
      const x = pileX(i);
      const y = pileY(i);

      pile.cards.forEach((card, n) => {
        // The stock, waste and foundations are decks, not columns: drawing all
        // 24 stacked cards would cost 24 sprites to show one.
        if (pile.kind !== 'tableau' && n < pile.cards.length - 1) return;
        table.card(card, x, y + cardOffset(game, i, n));
        cardsDrawn++;
      });
    }

    drawCursor();
    table.end();
  }

  function drawCursor(): void {
    clampDepth();
    const pile = game.piles[cursor];
    const n = Math.max(0, pile.cards.length - depth);

    table.marker(
      'cursor',
      pileX(cursor),
      pileY(cursor) + (pile.cards.length ? cardOffset(game, cursor, n) : 0),
    );

    // Highlight every card being carried, wherever it currently sits.
    if (heldFrom >= 0) {
      const source = game.piles[heldFrom];
      for (let i = 0; i < heldCount; i++) {
        const index = source.cards.length - heldCount + i;
        table.marker('held', pileX(heldFrom), pileY(heldFrom) + cardOffset(game, heldFrom, index));
      }
    }

    // Where those cards would land, if they can.
    const wouldLand = heldFrom >= 0
      && heldFrom !== cursor
      && isLegal(game, { from: heldFrom, to: cursor, count: heldCount });
    if (wouldLand) {
      table.marker(
        'target',
        pileX(cursor),
        pileY(cursor) + (pile.kind === 'tableau' ? cardOffset(game, cursor, pile.cards.length) : 0),
      );
    }
  }

  function drawHud(): void {
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    font.draw(`TIME ${mins}:${String(secs).padStart(2, '0')}`, MARGIN, HUD_Y, 1);
    font.draw(`MOVES ${game.moves}`, MARGIN + 110, HUD_Y, 1);
    font.draw(`WINS ${wins}`, MARGIN + 220, HUD_Y, 1);

    const stock = game.piles[STOCK].cards.length;
    font.draw(`STOCK ${String(stock).padStart(2, ' ')}`, MARGIN + 320, HUD_Y, 1);

    if (messageTimer > 0) {
      // Along the bottom edge, not in the gap above the tableau: a long line
      // there overlapped the first row of cards and ran off the right side.
      const x = Math.max(4, Math.round(SCREEN_W / 2 - message.length * 4));
      font.draw(message, x, SCREEN_H - 14, 1);
    }
  }

  // --- Boot -----------------------------------------------------------------
  say('Z PICK UP   X SEND   ENTER NEW DEAL', 5);
  el.status.textContent = `Klondike — clear all four foundations, Ace to King. (${table.deckSource})`;

  // Exposed for the repo's headless verification scripts.
  (window as unknown as Record<string, unknown>).__patience = {
    state: () => ({
      cursor, depth, heldFrom, heldCount, moves: game.moves, won: game.won,
      stock: game.piles[STOCK].cards.length,
      waste: game.piles[WASTE].cards.length,
      foundations: game.piles.filter((p) => p.kind === 'foundation').map((p) => p.cards.length),
      tableau: game.piles.filter((p) => p.kind === 'tableau').map((p) => p.cards.length),
      faceUp: game.piles.reduce((n, p) => n + p.cards.filter((c) => c.faceUp).length, 0),
      visibleCards: cardsDrawn,
      deckSource: table.deckSource,
    }),
    newGame,
    /** Force a near-won board so the finish can be verified without playing. */
    stageAlmostWon: () => {
      game = deal(1);
      for (const pile of game.piles) pile.cards = [];
      for (let suit = 0; suit < 4; suit++) {
        for (let rank = 0; rank < 12; rank++) {
          game.piles[FOUNDATION_0 + suit].cards.push({ suit, rank, faceUp: true });
        }
        game.piles[TABLEAU_0 + suit].cards.push({ suit, rank: 12, faceUp: true });
      }
      game.won = false;
      autoFinishing = false;
      cursor = TABLEAU_0;
      depth = 1;
    },
    autoFinish: () => { autoFinishing = true; },
  };

  engine.loop((dt) => {
    scene.update(dt);
    const input = engine.input;

    if (messageTimer > 0) messageTimer = Math.max(0, messageTimer - dt);
    if (!game.won) elapsed += dt;

    if (input.justPressed(0, 'start')) newGame();

    // The auto-finish plays the foregone conclusion out, one card at a time so
    // it reads as the game finishing rather than as the board blinking away.
    if (autoFinishing && !game.won) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        autoTimer = 0.08;
        if (autoFinishStep(game) < 0) autoFinishing = false;
        else {
          blip(sfxMove, 700, 'pulse50', 0.16, 30);
          checkWin();
        }
      }
    }

    if (!game.won && !autoFinishing) {
      if (input.justPressed(0, 'left')) { cursor = (cursor + PILE_COUNT - 1) % PILE_COUNT; depth = 1; }
      if (input.justPressed(0, 'right')) { cursor = (cursor + 1) % PILE_COUNT; depth = 1; }
      // Up and down reach deeper into a column, taking more of the run with you.
      if (input.justPressed(0, 'up')) depth += 1;
      if (input.justPressed(0, 'down')) depth -= 1;

      if (input.justPressed(0, 'a')) {
        if (cursor === STOCK) {
          if (drawFromStock(game)) blip(sfxDeal, 420, 'pulse25', 0.2, 45);
          else blip(sfxBad, 110, 'noise', 0.2, 60);
        } else if (heldFrom >= 0) {
          drop();
        } else {
          pickUp();
        }
      }

      if (input.justPressed(0, 'b')) smartMove();
    }

    draw();
    drawHud();

    if (game.won) {
      font.draw('ALL FOUR SUITS HOME', SCREEN_W / 2 - 76, SCREEN_H - 60, 1);
      font.draw('ENTER FOR A NEW DEAL', SCREEN_W / 2 - 80, SCREEN_H - 44, 1);
    }
  });
}

init().catch((err) => {
  const el = document.getElementById('status');
  if (el) el.textContent = `FAILED TO START: ${err}`;
});
