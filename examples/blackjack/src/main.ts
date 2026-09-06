/**
 * TWENTY-ONE — blackjack against the house.
 *
 * The rules live in `blackjack.ts` with no reference to the engine, so the
 * dealer policy and the payout table are unit-tested rather than played by
 * hand. This file is the felt: it lays hands out, moves chips, and drives the
 * dealer from a timer so the hand appears a card at a time.
 *
 * The deck, the chips and the sprite pooling all come from `@cathode/cards`,
 * which is the same layer the solitaire and the poker examples sit on.
 */
import {
  Bankroll, CARD_H, CARD_W, CardTable, type Card,
} from '@cathode/cards';
import { BitmapFont, Cathode, Scene, SoundChannel } from '@cathode/sdk';
import {
  HOUSE_RULES, type Table,
  canDouble, canSplit, createTable, dealerStep, double, handValue, hit,
  isBlackjack, isBust, nextRound, offersInsurance, resolveInsurance,
  roundPayout, roundStake, split, stand, startRound, total,
} from './blackjack';

const SCREEN_W = 464;
// Shorter than the solitaire next door: two hands and a stake need 360 rows,
// and padding it to a console's aspect would only add empty felt. Picking the
// screen to fit the game is what the custom profile is for.
const SCREEN_H = 360;
const SCALE = 2;

const HUD_Y = 8;
const DEALER_Y = 24;
const LABEL_GAP = 6;
// Below the hand, not above it: "BUST" and "YOU WIN 50" are the payoff of
// the round and belong where the player is already looking.
const MESSAGE_Y = 300;
/** The band between the two hands, where the chips at stake sit. */
const STAKE_Y = 158;
const PLAYER_Y = 184;
const MARGIN = 12;

const CHIP_VALUES = [5, 10, 25, 50, 100, 250, 500];
const STARTING_STACK = 500;

/**
 * Card pitch for a hand of `n` cards inside `width` pixels: as generous as
 * `loose` allows, tightening only when the hand outgrows its space. A hand of
 * two should look dealt, not crammed.
 */
function pitch(n: number, width: number, loose: number): number {
  if (n < 2) return loose;
  return Math.max(14, Math.min(loose, (width - CARD_W) / (n - 1)));
}

async function init(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = await Cathode.custom(
    canvas,
    {
      width: SCREEN_W, height: SCREEN_H, fps: 60, audio_channels: 4,
      sprite_limit: 0, scanlines: false, pixel_perfect: true,
      profile: 'Custom', title: 'Twenty-One',
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
      const raw = engine.raw.save_get(0, 'chips');
      return raw === null || raw === undefined ? null : Number(raw);
    },
    save: (n) => engine.raw.save_set(0, 'chips', String(n)),
  });

  let game: Table = createTable(Date.now() & 0xffff, HOUSE_RULES);
  let chipIndex = 1;                        // index into CHIP_VALUES
  let dealerTimer = 0;
  let message = 'PLACE YOUR BET';
  let settled = false;
  let handsPlayed = Number(engine.raw.save_get(0, 'hands') ?? 0) || 0;

  const el = {
    status: document.getElementById('status')!,
    chips: document.getElementById('chips')!,
  };

  const say = (text: string) => { message = text; };

  /** The bet the player is about to place, clamped to what they can cover. */
  const stagedBet = (): number =>
    Math.max(HOUSE_RULES.minBet, Math.min(CHIP_VALUES[chipIndex], bank.chips));

  function deal(): void {
    const bet = stagedBet();
    if (bank.chips < HOUSE_RULES.minBet) {
      say('OUT OF CHIPS — ENTER TO REBUY');
      blip(sfxBad, 110, 'noise', 0.2, 80);
      return;
    }
    bank.wager(bet);
    startRound(game, bet);
    settled = false;
    handsPlayed++;
    engine.raw.save_set(0, 'hands', String(handsPlayed));
    blip(sfxCard, 440, 'pulse25', 0.22, 60);
    say(game.phase === 'insurance' ? 'INSURANCE? Z YES  X NO' : '');
    if (game.phase === 'payout') finish();
  }

  /**
   * Resolve the round into the bankroll. The wager was committed at the deal,
   * so settling is one call: whatever the rules say comes back.
   */
  function finish(): void {
    if (settled) return;
    settled = true;

    // Splits and doubles commit more chips after the initial wager, so top up
    // what is at stake before settling it.
    const extra = roundStake(game) - bank.atStake;
    if (extra > 0) bank.wager(extra);

    const back = roundPayout(game);
    const staked = roundStake(game);
    bank.settle(back);

    if (back > staked) {
      say(game.results.some((r) => r.outcome === 'blackjack') ? 'BLACKJACK!' : `YOU WIN ${back - staked}`);
      blip(sfxWin, 880, 'triangle', 0.35, 320);
    } else if (back === staked) {
      say('PUSH');
      blip(sfxChip, 520, 'pulse50', 0.2, 90);
    } else {
      say(game.results.every((r) => r.outcome === 'bust') ? 'BUST' : `HOUSE TAKES ${staked - back}`);
      blip(sfxBad, 130, 'noise', 0.22, 140);
    }
  }

  // --- Drawing --------------------------------------------------------------
  function drawHand(cards: Card[], x: number, y: number, width: number, loose: number, reveal = false): void {
    const p = pitch(cards.length, width, loose);
    cards.forEach((card, i) => {
      const cx = x + i * p;
      if (reveal || card.faceUp) table.face(card, cx, y);
      else table.back(cx, y);
    });
  }

  /** Centre a hand of `n` cards in the full screen width. */
  const centred = (n: number, p: number): number =>
    Math.round((SCREEN_W - (CARD_W + (n - 1) * p)) / 2);

  function draw(): void {
    table.begin();

    // --- Dealer ---
    if (game.dealer.length) {
      const p = pitch(game.dealer.length, SCREEN_W - MARGIN * 2, CARD_W + 6);
      drawHand(game.dealer, centred(game.dealer.length, p), DEALER_Y, SCREEN_W - MARGIN * 2, CARD_W + 6);
    } else {
      table.marker('empty', centred(1, 0), DEALER_Y);
    }

    // --- Player ---
    if (game.hands.length) {
      // Every hand gets an equal slice of the table; a single hand gets it all.
      const slot = (SCREEN_W - MARGIN * 2) / game.hands.length;
      game.hands.forEach((h, i) => {
        const inner = slot - 8;
        const p = pitch(h.cards.length, inner, game.hands.length > 1 ? 20 : CARD_W + 6);
        const w = CARD_W + (h.cards.length - 1) * p;
        const x = MARGIN + i * slot + (slot - w) / 2;
        drawHand(h.cards, x, PLAYER_Y, inner, p);

        // Only a split table needs to say whose turn it is.
        if (game.phase === 'player' && game.hands.length > 1 && i === game.active) {
          table.marker('cursor', x, PLAYER_Y);
        }
      });
    } else {
      table.marker('empty', centred(1, 0), PLAYER_Y);
    }

    // The stake sits in the band between the two hands, where a real table
    // puts it: the chips you are about to bet, or the chips already out.
    const stake = game.hands.length ? roundStake(game) : stagedBet();
    table.chips(stake, SCREEN_W / 2 - 8, STAKE_Y);

    table.end();
  }

  function drawHud(): void {
    font.draw(`CHIPS ${bank.chips}`, MARGIN, HUD_Y, 1);
    font.draw(`BET ${game.hands.length ? roundStake(game) : stagedBet()}`, MARGIN + 140, HUD_Y, 1);
    font.draw(`SHOE ${game.shoe.remaining}`, MARGIN + 270, HUD_Y, 1);
    font.draw(`HANDS ${handsPlayed}`, MARGIN + 370, HUD_Y, 1);

    // Hand totals, which is the one number a blackjack player actually reads.
    // Each sits centred under the hand it belongs to; pinned to the margin
    // they read as HUD text rather than as a label on that hand.
    if (game.dealer.length) {
      const shown = game.dealer.filter((c) => c.faceUp);
      const v = handValue(shown);
      const label = game.phase === 'payout' || game.phase === 'dealer'
        ? `${total(game.dealer)}` : `${v.total}${v.soft ? ' SOFT' : ''}`;
      centreText(`DEALER ${label}`, SCREEN_W / 2, DEALER_Y + CARD_H + LABEL_GAP);
    }

    game.hands.forEach((h, i) => {
      const slot = (SCREEN_W - MARGIN * 2) / game.hands.length;
      const v = handValue(h.cards);
      const tag = isBust(h.cards) ? 'BUST'
        : isBlackjack(h) ? 'BLACKJACK'
          : `${v.total}${v.soft && v.total !== 21 ? ' SOFT' : ''}`;
      const result = game.results[i];
      const text = result && game.phase === 'payout' ? `${tag} — ${result.outcome.toUpperCase()}` : tag;
      centreText(text, MARGIN + (i + 0.5) * slot, PLAYER_Y + CARD_H + LABEL_GAP);
    });

    if (message) centreText(message, SCREEN_W / 2, MESSAGE_Y);
    centreText(controls(), SCREEN_W / 2, SCREEN_H - 16);
  }

  /** The built-in font is 8 pixels wide per glyph, so centring is arithmetic. */
  function centreText(text: string, cx: number, y: number): void {
    font.draw(text, Math.max(4, Math.round(cx - text.length * 4)), y, 1);
  }

  function controls(): string {
    switch (game.phase) {
      case 'betting': return 'LEFT RIGHT BET   Z DEAL';
      case 'insurance': return 'Z INSURE   X NO';
      case 'player': {
        const parts = ['Z HIT', 'X STAND'];
        if (canDouble(game)) parts.push('UP DOUBLE');
        if (canSplit(game)) parts.push('DOWN SPLIT');
        return parts.join('   ');
      }
      case 'dealer': return 'DEALER DRAWS';
      default: return 'ENTER NEXT HAND';
    }
  }

  // --- Boot -----------------------------------------------------------------
  el.status.textContent = `Blackjack — dealer stands on soft 17, blackjack pays 3:2. (${table.deckSource})`;
  el.chips.textContent = String(bank.chips);

  (window as unknown as Record<string, unknown>).__blackjack = {
    state: () => ({
      phase: game.phase,
      chips: bank.chips,
      atStake: bank.atStake,
      bet: game.hands.length ? roundStake(game) : stagedBet(),
      dealer: game.dealer.map((c) => (c.faceUp ? total([c]) : 0)),
      dealerTotal: total(game.dealer),
      hands: game.hands.map((h) => ({ total: total(h.cards), cards: h.cards.length, bet: h.bet })),
      results: game.results.map((r) => r.outcome),
      active: game.active,
      shoe: game.shoe.remaining,
      deckSource: table.deckSource,
      message,
    }),
    /** Force an exact position, so a test can reach a rare branch directly. */
    stage: (dealer: [number, number][], player: [number, number][], bet = 10) => {
      const mk = ([suit, rank]: [number, number]): Card => ({ suit, rank, faceUp: true });
      bank.reset();
      bank.wager(bet);
      game.phase = 'player';
      game.dealer = dealer.map(mk);
      game.dealer[1].faceUp = false;
      game.hands = [{ cards: player.map(mk), bet, doubled: false, stood: false, fromSplit: false }];
      game.active = 0;
      game.results = [];
      game.insurance = 0;
      game.splits = 0;
      settled = false;
      message = '';
    },
    hit: () => hit(game),
    stand: () => { stand(game); },
    rebuy: () => { bank.reset(); },
  };

  engine.loop((dt) => {
    scene.update(dt);
    const input = engine.input;

    // The dealer plays on a timer, so the hand builds up rather than appearing.
    if (game.phase === 'dealer') {
      dealerTimer -= dt;
      if (dealerTimer <= 0) {
        dealerTimer = 0.45;
        if (dealerStep(game)) blip(sfxCard, 400, 'pulse25', 0.18, 45);
      }
    }
    if (game.phase === 'payout') finish();

    if (game.phase === 'betting') {
      if (input.justPressed(0, 'left') && chipIndex > 0) {
        chipIndex--;
        blip(sfxChip, 380, 'pulse50', 0.14, 30);
      }
      if (input.justPressed(0, 'right') && chipIndex < CHIP_VALUES.length - 1) {
        chipIndex++;
        blip(sfxChip, 460, 'pulse50', 0.14, 30);
      }
      if (input.justPressed(0, 'a')) deal();
    } else if (game.phase === 'insurance') {
      // A dealer blackjack ends the round inside `resolveInsurance`. The
      // payout is picked up by the check at the top of the next frame rather
      // than here, which costs one frame and keeps the phase handling linear.
      if (input.justPressed(0, 'a')) { resolveInsurance(game, true); say(''); }
      if (input.justPressed(0, 'b')) { resolveInsurance(game, false); say(''); }
    } else if (game.phase === 'player') {
      if (input.justPressed(0, 'a')) {
        if (hit(game)) blip(sfxCard, 420, 'pulse25', 0.2, 45);
        else blip(sfxBad, 120, 'noise', 0.18, 60);
      }
      if (input.justPressed(0, 'b')) { stand(game); blip(sfxChip, 300, 'pulse50', 0.16, 60); }
      if (input.justPressed(0, 'up') && canDouble(game)) {
        // Doubling commits a second bet, so it needs covering first.
        if (bank.chips >= game.hands[game.active].bet) {
          bank.wager(game.hands[game.active].bet);
          double(game);
          blip(sfxChip, 620, 'pulse50', 0.24, 80);
        } else {
          say('NOT ENOUGH CHIPS TO DOUBLE');
          blip(sfxBad, 120, 'noise', 0.18, 60);
        }
      }
      if (input.justPressed(0, 'down') && canSplit(game)) {
        if (bank.chips >= game.hands[game.active].bet) {
          bank.wager(game.hands[game.active].bet);
          split(game);
          blip(sfxCard, 560, 'pulse25', 0.22, 70);
        } else {
          say('NOT ENOUGH CHIPS TO SPLIT');
          blip(sfxBad, 120, 'noise', 0.18, 60);
        }
      }
    } else if (game.phase === 'payout' && input.justPressed(0, 'start')) {
      if (bank.chips < HOUSE_RULES.minBet) {
        bank.reset();
        say('REBOUGHT');
      } else {
        say('PLACE YOUR BET');
      }
      nextRound(game);
    }

    el.chips.textContent = String(bank.chips);
    draw();
    drawHud();
  });
}

init().catch((err) => {
  const el = document.getElementById('status');
  if (el) el.textContent = `FAILED TO START: ${err}`;
});
