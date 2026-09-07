/**
 * The opponent.
 *
 * Gin rummy has a small, tractable decision at every step — take the upcard or
 * not, then which card to throw — so this bot plays the greedy line: whichever
 * choice leaves the least deadwood, with a tie broken toward keeping cards
 * that could still become melds.
 *
 * That is genuinely decent and, more usefully for an example, entirely
 * explainable: every decision below is one call to the same `deadwoodOf` the
 * player's own hand is scored with.
 */
import { type Card } from '@cathode/cards';
import { deadwoodOf, deadwoodValue } from './melds';
import {
  KNOCK_LIMIT, type Game,
  arrange, canKnock, discard, drawFromDiscard, drawFromStock, knock, upcard,
} from './rummy';

/** How many points taking the upcard would save. Negative means it hurts. */
export function upcardGain(hand: Card[], card: Card): number {
  const before = deadwoodOf(hand);
  const withCard = [...hand, card];
  // Adding a card then throwing the worst one is the real comparison: a hand
  // is only ever eleven cards for the moment between drawing and discarding.
  const after = Math.min(
    ...withCard.map((_, i) => deadwoodOf(withCard.filter((__, k) => k !== i))),
  );
  return before - after;
}

/** The discard that leaves the least deadwood; ties go to the biggest card. */
export function bestDiscard(hand: Card[]): Card {
  let best = hand[0];
  let bestValue = Infinity;
  let bestCard = -1;

  for (let i = 0; i < hand.length; i++) {
    const rest = hand.filter((_, k) => k !== i);
    const value = deadwoodOf(rest);
    const size = deadwoodValue(hand[i]);
    // Prefer the lower resulting deadwood; between equals, throw the card that
    // would cost most if the hand ends abruptly.
    if (value < bestValue || (value === bestValue && size > bestCard)) {
      best = hand[i];
      bestValue = value;
      bestCard = size;
    }
  }

  return best;
}

/**
 * Whether to knock with this hand.
 *
 * Gin is always taken. A thin knock is not: knocking on ten with the opponent
 * still drawing invites an undercut, so the bot waits for a lower count early
 * and takes what it can get once the stock is running out.
 */
export function shouldKnock(deadwood: number, stockLeft: number): boolean {
  if (deadwood === 0) return true;
  if (deadwood > KNOCK_LIMIT) return false;
  if (stockLeft < 12) return true;
  return deadwood <= 5;
}

/** Play the bot's whole turn: one draw, then one discard or a knock. */
export function takeTurn(game: Game): void {
  if (game.turn !== 'them') return;

  const hand = game.hands.them;
  const up = upcard(game);

  if (game.phase === 'draw') {
    if (up && upcardGain(hand, up) > 0) drawFromDiscard(game);
    else drawFromStock(game);
  }
  if (game.phase !== 'discard') return;

  const card = bestDiscard(game.hands.them);
  const after = game.hands.them.filter((c) => c !== card);

  if (shouldKnock(deadwoodOf(after), game.stock.length) && canKnock(game, card)) {
    knock(game, card);
    return;
  }
  discard(game, card);
}

/** What the bot would advise you to throw, for the hint line. */
export const suggestDiscard = (hand: Card[]): Card => bestDiscard(hand);

/** Melds and deadwood, re-exported so the UI has one import for advice. */
export const readHand = arrange;
