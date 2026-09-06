/**
 * RIVER STREET — no-limit Texas hold'em against three bots.
 *
 * Three modules, none of which know about the engine: `evaluator.ts` ranks
 * hands, `holdem.ts` runs the table, `ai.ts` decides what the opponents do.
 * This file seats four players around a felt, drives the bots from a timer so
 * you can watch them think, and asks you what you want to do.
 *
 * The seating is the interesting layout problem. Four hands and a five-card
 * board do not fit on any console's screen, so the profile is 560x400 — which
 * is only possible because the hardware presets are a starting position here
 * rather than a limit.
 */
import { Bankroll, CARD_H, CARD_W, CardTable } from '@cathode/cards';
import { BitmapFont, Cathode, Scene, SoundChannel } from '@cathode/sdk';
import { PERSONALITIES, play } from './ai';
import { describe, evaluate } from './evaluator';
import {
  type Action, type Game,
  act, contenders, createGame, legalActions, livePlayers, potTotal, startHand,
} from './holdem';

const SCREEN_W = 560;
const SCREEN_H = 400;
const SCALE = 2;

const HUD_Y = 8;
const BOARD_Y = 152;
const MARGIN = 10;

/**
 * Two hole cards, overlapped: a bot's seat is 72 wide rather than 120, which
 * is what lets four seats and a five-card board share one screen. Your own
 * cards are spread further, because a 14-pixel sliver is enough to identify
 * an opponent's card back and not enough to read your own hand.
 */
const HOLE_PITCH = 14;
const OWN_PITCH = 32;
const HOLE_W = CARD_W + HOLE_PITCH;
const OWN_W = CARD_W + OWN_PITCH;
const BOARD_PITCH = CARD_W + 4;

const STARTING_STACK = 400;
const BLINDS = { small: 5, big: 10 };
const NAMES = ['YOU', ...PERSONALITIES.map((p) => p.name)];

/** Where each seat's cards sit. Seat 0 is the player, at the bottom. */
const SEAT_POS: { x: number; y: number; label: number }[] = [
  { x: (SCREEN_W - OWN_W) / 2, y: 266, label: 352 },               // YOU, bottom
  { x: MARGIN, y: 132, label: 220 },                               // left
  { x: (SCREEN_W - HOLE_W) / 2, y: 22, label: 110 },               // top
  { x: SCREEN_W - HOLE_W - MARGIN, y: 132, label: 220 },           // right
];

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await Cathode.custom(
    canvas,
    {
      width: SCREEN_W, height: SCREEN_H, fps: 60, audio_channels: 4,
      sprite_limit: 0, scanlines: false, pixel_perfect: true,
      profile: 'Custom', title: 'River Street',
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
  const sfxChip = new SoundChannel(engine, 1);
  const sfxBad = new SoundChannel(engine, 2);
  const sfxWin = new SoundChannel(engine, 3);
  const blip = (ch: SoundChannel, freq: number, wave: 'pulse25' | 'pulse50' | 'triangle' | 'noise', vol: number, ms: number) => {
    ch.play(freq, wave, vol);
    setTimeout(() => ch.stop(), ms);
  };

  // --- State ----------------------------------------------------------------
  const bank = new Bankroll(STARTING_STACK, {
    load: () => {
      const raw = engine.raw.save_get(0, 'stack');
      return raw === null || raw === undefined ? null : Number(raw);
    },
    save: (n) => engine.raw.save_set(0, 'stack', String(n)),
  });

  const game: Game = createGame(NAMES, STARTING_STACK, BLINDS, Date.now() & 0xffff);
  game.seats[0].chips = bank.chips > 0 ? bank.chips : STARTING_STACK;

  const rand = () => Math.random();
  /** What each seat last did, for the label under their cards. */
  let lastAction: string[] = NAMES.map(() => '');
  let botTimer = 0;
  let raising = false;
  let raiseAmount = 0;
  let message = 'ENTER TO DEAL';
  let handsPlayed = 0;
  /** Set once the finished hand has been announced, so it announces once. */
  let settled = false;

  const el = {
    status: document.getElementById('status')!,
    stack: document.getElementById('stack')!,
  };

  const say = (text: string) => { message = text; };

  function deal(): void {
    if (livePlayers(game).length < 2) {
      // Everyone is broke but you, or you are broke: reset the table.
      game.seats.forEach((s) => { s.chips = STARTING_STACK; });
      say('TABLE REBOUGHT');
    }
    lastAction = NAMES.map(() => '');
    raising = false;
    settled = false;
    if (startHand(game)) {
      handsPlayed++;
      blip(sfxCard, 460, 'pulse25', 0.2, 60);
      say('');
    }
  }

  /** Record what a seat did, reading the table's own log rather than guessing. */
  function noteAction(seat: number): void {
    const line = game.log[game.log.length - 1] ?? '';
    if (line.startsWith(NAMES[seat])) lastAction[seat] = line.slice(NAMES[seat].length + 1);
  }

  function humanAct(action: Action, amount = 0): void {
    if (game.toAct !== 0) return;
    if (!act(game, action, amount)) {
      blip(sfxBad, 120, 'noise', 0.2, 60);
      return;
    }
    noteAction(0);
    raising = false;
    blip(sfxChip, action === 'fold' ? 240 : 560, 'pulse50', 0.2, 50);
    finishIfDone();
  }

  /**
   * Announce a finished hand, once.
   *
   * `act` and `play` both end hands, and both are ordinary calls that the
   * compiler assumes leave `game.street` alone — so the check goes through
   * this function, which reads it fresh, rather than inline where a stale
   * narrowing would quietly delete the branch.
   */
  function finishIfDone(): boolean {
    if (game.street !== 'complete' || settled) return false;
    settled = true;
    settle();
    return true;
  }

  function settle(): void {
    bank.credit(0);                                   // force a save of the stack
    engine.raw.save_set(0, 'stack', String(game.seats[0].chips));
    const mine = game.awards.filter((a) => a.seat === 0);
    if (mine.length) {
      const won = mine.reduce((n, a) => n + a.amount, 0);
      say(`YOU WIN ${won}`);
      blip(sfxWin, 820, 'triangle', 0.34, 300);
    } else {
      const best = game.awards[0];
      say(best ? `${NAMES[best.seat]} WINS ${best.amount}` : 'HAND OVER');
      blip(sfxChip, 300, 'pulse50', 0.18, 90);
    }
  }

  // --- Drawing --------------------------------------------------------------
  function centreText(text: string, cx: number, y: number): void {
    font.draw(text, Math.max(2, Math.round(cx - text.length * 4)), y, 1);
  }

  function draw(): void {
    table.begin();

    // The board, centred, with an outline for cards still to come.
    const boardX = (SCREEN_W - (CARD_W + 4 * BOARD_PITCH)) / 2;
    for (let i = 0; i < 5; i++) {
      const x = boardX + i * BOARD_PITCH;
      if (i < game.board.length) table.face(game.board[i], x, BOARD_Y);
      else table.marker('empty', x, BOARD_Y);
    }

    game.seats.forEach((seat, i) => {
      const pos = SEAT_POS[i];
      if (!seat.hole.length) {
        table.marker('empty', pos.x, pos.y);
        return;
      }
      const pitch = i === 0 ? OWN_PITCH : HOLE_PITCH;
      seat.hole.forEach((card, n) => {
        const x = pos.x + n * pitch;
        if (card.faceUp) table.face(card, x, pos.y);
        else table.back(x, pos.y);
      });
      // The seat to act is outlined, so a table of four says whose turn it is.
      if (game.toAct === i) table.marker('cursor', pos.x, pos.y);
      // Folded seats are marked rather than hidden: you should be able to see
      // who is still in the hand at a glance.
      if (seat.folded) table.marker('target', pos.x, pos.y);
    });

    // The pot as chips, in the gap between the left seat and the board. Above
    // the board there are only twenty rows between the top seat's labels and
    // the first community card, which a stack of chips does not fit into.
    const pot = potTotal(game);
    if (pot > 0) table.chips(pot, 92, BOARD_Y + 34, 6);

    table.end();
  }

  function drawHud(): void {
    font.draw(`POT ${potTotal(game)}`, MARGIN, HUD_Y, 1);
    font.draw(`BLINDS ${BLINDS.small}/${BLINDS.big}`, MARGIN + 150, HUD_Y, 1);
    font.draw(`HAND ${handsPlayed}`, MARGIN + 320, HUD_Y, 1);
    font.draw(`STACK ${game.seats[0].chips}`, MARGIN + 430, HUD_Y, 1);

    game.seats.forEach((seat, i) => {
      const pos = SEAT_POS[i];
      const cx = pos.x + (i === 0 ? OWN_W : HOLE_W) / 2;
      const dealer = i === game.button ? ' (D)' : '';
      centreText(`${seat.name}${dealer}  ${seat.chips}`, cx, pos.label);
      const note = seat.folded ? 'FOLDED'
        : seat.allIn ? 'ALL IN'
          : seat.bet > 0 ? `BET ${seat.bet}`
            : lastAction[i];
      if (note) centreText(note, cx, pos.label + 12);
    });

    // One line under the board carries whichever of the two matters now: what
    // you are holding while the hand is live, and who won once it is over.
    // They never compete for attention, so they never compete for the row —
    // and the row below the bottom seat, where the result used to go, was
    // already occupied by that seat's own labels.
    const holding = game.seats[0].hole.length && game.board.length >= 3
      ? describe(evaluate([...game.seats[0].hole, ...game.board]))
      : '';
    const line = betweenHands() && message ? message : holding;
    if (line) centreText(line, SCREEN_W / 2, BOARD_Y + CARD_H + 12);

    centreText(controls(), SCREEN_W / 2, SCREEN_H - 18);
  }

  /**
   * Read through a call rather than inline, so the bots mutating `street`
   * mid-frame cannot be narrowed away by the compiler.
   */
  const betweenHands = (): boolean => game.street === 'idle' || game.street === 'complete';

  function controls(): string {
    if (betweenHands()) return 'ENTER DEALS THE NEXT HAND';
    if (game.toAct !== 0) return `${NAMES[game.toAct] ?? ''} IS THINKING`;
    const legal = legalActions(game);
    if (raising) return `LEFT RIGHT ${raiseAmount}   Z CONFIRM   X CANCEL`;
    const parts = ['X FOLD', legal.check ? 'Z CHECK' : `Z CALL ${legal.call}`];
    if (legal.minRaise > 0) parts.push('UP RAISE');
    return parts.join('   ');
  }

  // --- Boot -----------------------------------------------------------------
  el.status.textContent = `No-limit hold'em — ADA plays tight, BEN calls too much, CAI raises anything. (${table.deckSource})`;
  el.stack.textContent = String(game.seats[0].chips);

  (window as unknown as Record<string, unknown>).__holdem = {
    state: () => ({
      street: game.street,
      toAct: game.toAct,
      pot: potTotal(game),
      board: game.board.length,
      stacks: game.seats.map((s) => s.chips),
      bets: game.seats.map((s) => s.bet),
      folded: game.seats.map((s) => s.folded),
      contenders: contenders(game).length,
      awards: game.awards.map((a) => ({ seat: a.seat, amount: a.amount })),
      hands: handsPlayed,
      deckSource: table.deckSource,
      message,
      legal: game.toAct === 0 ? legalActions(game) : null,
    }),
    deal,
    /** Play the hand out with the bot policy, including this seat. */
    autoPlay: (limit = 200) => {
      let guard = 0;
      while (game.street !== 'complete' && game.toAct >= 0 && guard++ < limit) {
        const seat = game.toAct;
        play(game, seat, PERSONALITIES[(seat + 2) % PERSONALITIES.length], rand,
          (a, amt) => act(game, a, amt));
        noteAction(seat);
      }
      finishIfDone();
      return game.street;
    },
  };

  engine.loop((dt) => {
    scene.update(dt);
    const input = engine.input;

    // Bots act on a timer so their decisions read as decisions.
    if (game.toAct > 0 && !betweenHands()) {
      botTimer -= dt;
      if (botTimer <= 0) {
        botTimer = 0.7;
        const seat = game.toAct;
        play(game, seat, PERSONALITIES[seat - 1], rand, (a, amt) => act(game, a, amt));
        noteAction(seat);
        blip(sfxChip, 380, 'pulse50', 0.14, 35);
      }
    }
    finishIfDone();

    if (betweenHands()) {
      if (input.justPressed(0, 'start')) deal();
    } else if (game.toAct === 0) {
      const legal = legalActions(game);
      if (raising) {
        const step = Math.max(BLINDS.big, Math.round(potTotal(game) / 4));
        if (input.justPressed(0, 'left')) {
          raiseAmount = Math.max(legal.minRaise, raiseAmount - step);
        }
        if (input.justPressed(0, 'right')) {
          raiseAmount = Math.min(legal.maxRaise, raiseAmount + step);
        }
        if (input.justPressed(0, 'a')) humanAct('raise', raiseAmount);
        if (input.justPressed(0, 'b')) raising = false;
      } else {
        if (input.justPressed(0, 'b')) humanAct('fold');
        if (input.justPressed(0, 'a')) humanAct(legal.check ? 'check' : 'call');
        if (input.justPressed(0, 'up') && legal.minRaise > 0) {
          raising = true;
          raiseAmount = legal.minRaise;
        }
      }
    }

    el.stack.textContent = String(game.seats[0].chips);
    draw();
    drawHud();
  });
}

init().catch((err) => {
  const el = document.getElementById('status');
  if (el) el.textContent = `FAILED TO START: ${err}`;
});
