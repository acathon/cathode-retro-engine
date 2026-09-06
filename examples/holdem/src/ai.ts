/**
 * The opponents.
 *
 * A poker bot that plays randomly is not an opponent, and one that plays
 * perfectly is not a game, so these three play recognisably differently: a
 * rock who folds and then bets the house, a station who calls too much, and a
 * maniac who raises with anything. You should be able to name which is which
 * after a dozen hands without being told.
 *
 * The decision is deliberately readable rather than optimal — hand strength,
 * pot odds, personality, in that order — because an example whose AI is a
 * trained black box teaches nobody anything.
 */
import { pokerRank, type Card } from '@cathode/cards';
import { Category, evaluate } from './evaluator';
import {
  type Action, type Game,
  contenders, legalActions, potTotal,
} from './holdem';

export interface Personality {
  name: string;
  /** How much edge it needs before putting chips in. 0 calls anything. */
  tightness: number;
  /** How often a strong hand becomes a raise rather than a call. */
  aggression: number;
  /** How often a weak hand becomes a raise anyway. */
  bluff: number;
}

export const PERSONALITIES: Personality[] = [
  { name: 'ADA', tightness: 0.78, aggression: 0.70, bluff: 0.08 },
  { name: 'BEN', tightness: 0.30, aggression: 0.22, bluff: 0.04 },
  { name: 'CAI', tightness: 0.26, aggression: 0.85, bluff: 0.34 },
];

// --- Hand strength ---------------------------------------------------------

/**
 * Preflop strength from the two hole cards, on Bill Chen's scale.
 *
 * Chen's formula is a hand-ranking heuristic from the 1990s that survives
 * because it is close enough and fits on a napkin: score the high card,
 * double it for a pair, add for suitedness, subtract for the gap.
 */
export function chenScore(hole: Card[]): number {
  const [a, b] = hole.map(pokerRank).sort((x, y) => y - x);

  const highValue = (r: number): number => {
    if (r === 14) return 10;
    if (r === 13) return 8;
    if (r === 12) return 7;
    if (r === 11) return 6;
    return r / 2;
  };

  let score = highValue(a);
  if (a === b) score = Math.max(5, score * 2);
  if (hole[0].suit === hole[1].suit) score += 2;

  const gap = a - b - 1;
  if (a !== b) {
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    // Connectors and one-gappers below a queen can make straights both ways.
    if (gap <= 1 && a < 12) score += 1;
  }

  return Math.max(0, Math.ceil(score));
}

/**
 * How strong each made hand is, before draws and board-playing are counted.
 *
 * These are rough win probabilities, not rarities: a pair is uncommon enough
 * to be worth 0.9 on a scarcity scale and worth about a coin flip at a real
 * table, and it is the second number that should decide whether to call.
 */
const CATEGORY_STRENGTH: Record<Category, number> = {
  [Category.HighCard]: 0.10,
  [Category.Pair]: 0.45,
  [Category.TwoPair]: 0.65,
  [Category.Trips]: 0.78,
  [Category.Straight]: 0.85,
  [Category.Flush]: 0.90,
  [Category.FullHouse]: 0.95,
  [Category.Quads]: 0.98,
  [Category.StraightFlush]: 1,
};

/** Four to a flush: worth chasing while there are cards to come. */
function flushDraw(cards: Card[]): boolean {
  const bySuit = [0, 0, 0, 0];
  for (const c of cards) bySuit[c.suit]++;
  return bySuit.some((n) => n === 4);
}

/** Four to an open-ended straight, ace counted both high and low. */
function straightDraw(cards: Card[]): boolean {
  const ranks = new Set(cards.map(pokerRank));
  if (ranks.has(14)) ranks.add(1);
  for (let low = 1; low <= 11; low++) {
    let run = 0;
    for (let r = low; r < low + 4; r++) if (ranks.has(r)) run++;
    if (run === 4) return true;
  }
  return false;
}

/**
 * A number in 0..1 for how good this seat's hand is right now.
 *
 * Postflop it is the made hand, discounted when the best five cards are all
 * on the board — everyone at the table has that hand — and topped up for a
 * draw while there are still cards to come.
 */
export function strength(hole: Card[], board: Card[]): number {
  // A real hold'em board is 0, 3, 4 or 5 cards, but `strength` is public and
  // throwing on a four-card total would be a landmine for any other caller.
  if (hole.length + board.length < 5) return Math.min(1, chenScore(hole) / 20);

  const all = [...hole, ...board];
  const made = evaluate(all);
  let value = CATEGORY_STRENGTH[made.category];

  // Playing the board: the same five cards are available to every opponent.
  const usesHole = made.cards.some((c) => hole.includes(c));
  if (!usesHole) value *= 0.55;

  // Which pair matters as much as having one. Bottom pair with a bad kicker
  // and top pair are the same category and nothing like the same hand, and
  // without this a seven-deuce that paired the board played like a real hand.
  if (made.category === Category.Pair || made.category === Category.TwoPair) {
    value *= 0.6 + 0.4 * ((made.kickers[0] - 2) / 12);
  }

  if (board.length < 5) {
    if (flushDraw(all)) value = Math.max(value, value + 0.18);
    if (straightDraw(all)) value = Math.max(value, value + 0.12);
  }

  return Math.max(0, Math.min(1, value));
}

// --- The decision ----------------------------------------------------------

export interface Decision {
  action: Action;
  /** For a raise, the amount to raise *to*. */
  amount?: number;
}

/**
 * What this seat does, given the table and a source of randomness.
 *
 * The randomness is passed in rather than taken from `Math.random` so a hand
 * can be replayed exactly, which is the only way to debug a bot that did
 * something strange four streets ago.
 */
export function decide(game: Game, seat: number, who: Personality, rand: () => number): Decision {
  const legal = legalActions(game);
  const s = game.seats[seat];
  const value = strength(s.hole, game.board);
  const pot = potTotal(game);
  const opponents = contenders(game).length - 1;

  // Pot odds: the share of the eventual pot this call costs. A call needs to
  // win more often than this to be worth making.
  const odds = legal.call > 0 ? legal.call / (pot + legal.call) : 0;

  // Tighter players demand a wider margin over the raw odds, and every extra
  // opponent is another hand that might already be better.
  //
  // The cap matters more than it looks: pot odds against a huge bet approach
  // 1, and adding a margin on top pushed the bar above the top of the
  // strength scale — which folded a royal flush, because nothing could clear
  // it. At 0.75 nothing from three of a kind upward is ever laid down, which
  // is a simplification (a set can be beaten by the river) and still far
  // closer to poker than folding a monster to a big number.
  const margin = who.tightness * 0.26 + opponents * 0.02;
  const threshold = Math.min(0.75, odds + margin);
  const bluffing = rand() < who.bluff && opponents <= 2;

  const raiseTo = (): number => {
    // Roughly half to a full pot, scaled by how aggressive this seat is.
    const want = game.currentBet + Math.round(
      Math.max(game.lastRaise, pot * (0.45 + who.aggression * 0.55)),
    );
    return Math.max(legal.minRaise, Math.min(want, legal.maxRaise));
  };

  if (legal.check) {
    if (value > 0.58 && rand() < who.aggression && legal.minRaise > 0) {
      return { action: 'raise', amount: raiseTo() };
    }
    if (bluffing && value < 0.3 && legal.minRaise > 0) {
      return { action: 'raise', amount: legal.minRaise };
    }
    return { action: 'check' };
  }

  // Facing a bet.
  if (value < threshold && !bluffing) return { action: 'fold' };

  if (value > 0.72 && rand() < who.aggression && legal.minRaise > 0) {
    return { action: 'raise', amount: raiseTo() };
  }
  if (bluffing && value < 0.35 && legal.minRaise > 0) {
    return { action: 'raise', amount: legal.minRaise };
  }

  if (legal.call > 0) return { action: 'call' };
  return { action: 'check' };
}

/**
 * Apply a decision, falling back to the safest legal action if the table
 * refuses it. A bot that stalls the game is worse than a bot that folds.
 */
export function play(game: Game, seat: number, who: Personality, rand: () => number,
  apply: (action: Action, amount?: number) => boolean): boolean {
  const decision = decide(game, seat, who, rand);
  if (apply(decision.action, decision.amount)) return true;

  const legal = legalActions(game);
  if (legal.check && apply('check')) return true;
  if (legal.call > 0 && apply('call')) return true;
  return apply('fold');
}
