/**
 * TEN CARD — gin rummy against one opponent.
 *
 * The interesting module here is `melds.ts`: what a gin rummy hand is worth is
 * a search, not a lookup, because the same card can complete a set or a run
 * and only the best arrangement counts. This file shows you the answer — every
 * melded card is outlined, every loose card is not — so the search is visible
 * rather than a number you have to trust.
 *
 * `rummy.ts` is the table and `bot.ts` the opponent; neither imports the
 * engine, which is why a whole match to a hundred runs in a unit test.
 */
import { CARD_H, CARD_W, CardTable, type Card } from '@cathode/cards';
import { BitmapFont, Cathode, Scene, SoundChannel } from '@cathode/sdk';
import { bestDiscard, takeTurn, upcardGain } from './bot';
import { bestArrangement, sortForDisplay } from './melds';
import {
  HAND_SIZE, KNOCK_LIMIT, TARGET_SCORE, type Game, type Result,
  canKnock, createGame, deal, discard, drawFromDiscard, drawFromStock, knock,
  newDeal, upcard,
} from './rummy';

const SCREEN_W = 520;
const SCREEN_H = 400;
const SCALE = 2;

const HUD_Y = 8;
const THEIR_Y = 24;
const THEIR_PITCH = 30;
const MIDDLE_Y = 142;
const YOUR_Y = 244;
const YOUR_PITCH = 30;
const MARGIN = 10;

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await Cathode.custom(
    canvas,
    {
      width: SCREEN_W, height: SCREEN_H, fps: 60, audio_channels: 4,
      sprite_limit: 0, scanlines: false, pixel_perfect: true,
      profile: 'Custom', title: 'Ten Card',
    } as never,
    SCALE,
  );

  const scene = new Scene(engine);
  const font = BitmapFont.builtin(engine);
  engine.setBgColor(18, 62, 40);

  const table = await CardTable.create(engine, scene, {
    cardsUrl: new URL('../playing_cards.png', import.meta.url).href,
    width: SCREEN_W, height: SCREEN_H,
  });

  const sfxCard = new SoundChannel(engine, 0);
  const sfxPick = new SoundChannel(engine, 1);
  const sfxBad = new SoundChannel(engine, 2);
  const sfxWin = new SoundChannel(engine, 3);
  const blip = (ch: SoundChannel, freq: number, wave: 'pulse25' | 'pulse50' | 'triangle' | 'noise', vol: number, ms: number) => {
    ch.play(freq, wave, vol);
    setTimeout(() => ch.stop(), ms);
  };

  // --- State ----------------------------------------------------------------
  const game: Game = createGame(Date.now() & 0xffff);
  deal(game);

  let cursor = 0;
  /**
   * Counts down before the opponent moves. It is armed when the turn passes
   * to them rather than after they act — armed afterwards it is always zero
   * at the start of their turn, so they move on the first frame and "they are
   * thinking" is never on screen long enough to read.
   */
  let botTimer = 0;
  let lastTurn = game.turn;
  let message = '';

  const el = {
    status: document.getElementById('status')!,
    score: document.getElementById('score')!,
  };
  const say = (text: string) => { message = text; };

  /**
   * Your hand in a readable order, with the melds first.
   *
   * The cursor indexes this list rather than the underlying hand, so the card
   * you are pointing at is the card you see, and re-sorting after a draw never
   * moves the selection out from under you.
   */
  let display: Card[] = [];
  let melded = new Set<Card>();

  function relayout(): void {
    const arrangement = bestArrangement(game.hands.you);
    melded = new Set(arrangement.melds.flatMap((m) => m.cards));
    display = [
      ...arrangement.melds.flatMap((m) => sortForDisplay(m.cards)),
      ...sortForDisplay(arrangement.deadwood),
    ];
    cursor = Math.max(0, Math.min(cursor, display.length - 1));
  }
  relayout();

  const yourDeadwood = (): number => bestArrangement(game.hands.you).value;
  const latestResult = (): Result | null => game.result;

  function draw(fromDiscard: boolean): void {
    if (game.phase !== 'draw' || game.turn !== 'you') return;
    const got = fromDiscard ? drawFromDiscard(game) : drawFromStock(game);
    if (!got) {
      blip(sfxBad, 120, 'noise', 0.2, 60);
      return;
    }
    relayout();
    // Point at the card just drawn, which is the one you are deciding about.
    cursor = Math.max(0, display.indexOf(got));
    blip(sfxCard, fromDiscard ? 560 : 440, 'pulse25', 0.2, 50);
    say('');
  }

  function throwCard(alsoKnock: boolean): void {
    if (game.phase !== 'discard' || game.turn !== 'you') return;
    const card = display[cursor];
    if (!card) return;

    if (alsoKnock) {
      if (!canKnock(game, card)) {
        say(`KNOCK NEEDS ${KNOCK_LIMIT} OR LESS`);
        blip(sfxBad, 120, 'noise', 0.2, 70);
        return;
      }
      const result = knock(game, card);
      if (result) {
        say(`${result.ending.toUpperCase()} — ${result.winner === 'you' ? 'YOU' : 'THEY'} SCORE ${result.points}`);
        blip(result.winner === 'you' ? sfxWin : sfxBad,
          result.winner === 'you' ? 880 : 160, 'triangle', 0.34, 320);
      }
      relayout();
      return;
    }

    discard(game, card);
    relayout();
    blip(sfxCard, 380, 'pulse50', 0.18, 45);
    if (game.result) {
      say(`STOCK RAN OUT — NO SCORE`);
    }
  }

  // --- Drawing --------------------------------------------------------------
  const centreText = (text: string, cx: number, y: number): void => {
    font.draw(text, Math.max(2, Math.round(cx - text.length * 4)), y, 1);
  };

  const spread = (n: number, pitch: number): number =>
    Math.round((SCREEN_W - (CARD_W + Math.max(0, n - 1) * pitch)) / 2);

  function drawTable(): void {
    table.begin();

    // Their hand, face down until the hand is over.
    const theirs = game.hands.them;
    const theirX = spread(theirs.length, THEIR_PITCH);
    theirs.forEach((card, i) => {
      const x = theirX + i * THEIR_PITCH;
      if (card.faceUp) table.face(card, x, THEIR_Y);
      else table.back(x, THEIR_Y);
    });

    // Stock and discard, side by side in the middle.
    const stockX = SCREEN_W / 2 - CARD_W - 6;
    const discardX = SCREEN_W / 2 + 6;
    if (game.stock.length) table.back(stockX, MIDDLE_Y);
    else table.marker('empty', stockX, MIDDLE_Y);
    const up = upcard(game);
    if (up) table.face(up, discardX, MIDDLE_Y);
    else table.marker('empty', discardX, MIDDLE_Y);

    // Your hand, melds first. A melded card is outlined and a loose one is
    // not, which turns the search in `melds.ts` into something you can see.
    const yourX = spread(display.length, YOUR_PITCH);
    display.forEach((card, i) => {
      const x = yourX + i * YOUR_PITCH;
      table.face(card, x, YOUR_Y);
      if (melded.has(card)) table.marker('target', x, YOUR_Y);
    });
    if (game.turn === 'you' && game.phase === 'discard' && display[cursor]) {
      table.marker('cursor', yourX + cursor * YOUR_PITCH, YOUR_Y);
    }

    // Which pile you may take from, while you are choosing.
    if (game.turn === 'you' && game.phase === 'draw') {
      if (game.stock.length) table.marker('cursor', stockX, MIDDLE_Y);
      if (up) table.marker('cursor', discardX, MIDDLE_Y);
    }

    table.end();
  }

  function drawHud(): void {
    font.draw(`YOU ${game.scores.you}`, MARGIN, HUD_Y, 1);
    font.draw(`THEM ${game.scores.them}`, MARGIN + 110, HUD_Y, 1);
    font.draw(`TO ${TARGET_SCORE}`, MARGIN + 240, HUD_Y, 1);
    font.draw(`STOCK ${game.stock.length}`, MARGIN + 340, HUD_Y, 1);

    centreText(game.result ? 'THEIR HAND' : `THEM — ${HAND_SIZE} CARDS`,
      SCREEN_W / 2, THEIR_Y + CARD_H + 6);

    // Your deadwood, which is the number the whole game turns on.
    const deadwood = yourDeadwood();
    const knockable = deadwood <= KNOCK_LIMIT;
    centreText(
      `DEADWOOD ${deadwood}${knockable ? '  — YOU CAN KNOCK' : ''}`,
      SCREEN_W / 2, YOUR_Y + CARD_H + 8,
    );

    if (message) centreText(message, SCREEN_W / 2, SCREEN_H - 36);
    centreText(controls(), SCREEN_W / 2, SCREEN_H - 18);
  }

  function controls(): string {
    if (game.phase === 'over') return 'ENTER FOR THE NEXT HAND';
    if (game.phase === 'match-over') {
      return `${game.scores.you > game.scores.them ? 'YOU WIN THE MATCH' : 'THEY WIN THE MATCH'} — ENTER TO PLAY AGAIN`;
    }
    if (game.turn === 'them') return 'THEY ARE THINKING';
    if (game.phase === 'draw') return 'Z DRAW   X TAKE THE UPCARD';
    const card = display[cursor];
    const can = card && canKnock(game, card);
    return `LEFT RIGHT PICK   Z DISCARD${can ? '   UP KNOCK' : ''}`;
  }

  // --- Boot -----------------------------------------------------------------
  el.status.textContent = `Gin rummy to ${TARGET_SCORE} — melded cards are outlined, loose ones are not. (${table.deckSource})`;

  (window as unknown as Record<string, unknown>).__rummy = {
    state: () => ({
      phase: game.phase,
      turn: game.turn,
      yours: game.hands.you.length,
      theirs: game.hands.them.length,
      stock: game.stock.length,
      discard: game.discard.length,
      deadwood: yourDeadwood(),
      melded: melded.size,
      scores: { ...game.scores },
      result: game.result ? { ...game.result, laidOff: game.result.laidOff.length } : null,
      deals: game.deals,
      cursor,
      deckSource: table.deckSource,
      message,
    }),
    /** Total cards in play, which must always be 52. */
    cardCount: () => new Set([...game.hands.you, ...game.hands.them, ...game.stock,
      ...game.discard].map((c) => `${c.suit}:${c.rank}`)).size,
    nextDeal: () => { newDeal(game); relayout(); },
    /** Play both seats with the bot policy until the hand ends. */
    autoPlay: (limit = 400) => {
      let guard = 0;
      while (!game.result && guard++ < limit) {
        if (game.turn === 'them') { takeTurn(game); continue; }
        const up = upcard(game);
        if (game.phase === 'draw') {
          if (up && upcardGain(game.hands.you, up) > 0) drawFromDiscard(game);
          else if (!drawFromStock(game)) break;
        }
        if (game.phase !== 'discard') continue;
        const throwing = bestDiscard(game.hands.you);
        if (canKnock(game, throwing)) knock(game, throwing);
        else discard(game, throwing);
      }
      relayout();
      return game.result?.ending ?? 'unfinished';
    },
  };

  engine.loop((dt) => {
    scene.update(dt);
    const input = engine.input;

    if (game.turn !== lastTurn) {
      lastTurn = game.turn;
      botTimer = 0.8;
    }

    // The opponent plays on a timer so their turn reads as a turn.
    if (game.turn === 'them' && !game.result) {
      botTimer -= dt;
      if (botTimer <= 0) {
        botTimer = 0.8;
        takeTurn(game);
        relayout();
        blip(sfxPick, 340, 'pulse50', 0.14, 40);
        // `takeTurn` can end the hand, but the compiler assumes an ordinary
        // call leaves `game.result` as the null this branch narrowed it to —
        // so the outcome is read back through a function that has no such
        // narrowing to lose.
        const outcome = latestResult();
        if (outcome) {
          say(`${outcome.ending.toUpperCase()} — ${outcome.winner === 'you' ? 'YOU' : 'THEY'} SCORE ${outcome.points}`);
        }
      }
    }

    if (game.phase === 'over' || game.phase === 'match-over') {
      if (input.justPressed(0, 'start')) {
        newDeal(game);
        relayout();
        cursor = 0;
        say('');
        blip(sfxCard, 460, 'pulse25', 0.2, 60);
      }
    } else if (game.turn === 'you') {
      if (game.phase === 'draw') {
        if (input.justPressed(0, 'a')) draw(false);
        if (input.justPressed(0, 'b')) draw(true);
      } else {
        if (input.justPressed(0, 'left')) cursor = (cursor + display.length - 1) % display.length;
        if (input.justPressed(0, 'right')) cursor = (cursor + 1) % display.length;
        if (input.justPressed(0, 'a')) throwCard(false);
        if (input.justPressed(0, 'up')) throwCard(true);
      }
    }

    el.score.textContent = `${game.scores.you} – ${game.scores.them}`;
    drawTable();
    drawHud();
  });
}

init().catch((err) => {
  const el = document.getElementById('status');
  if (el) el.textContent = `FAILED TO START: ${err}`;
});
