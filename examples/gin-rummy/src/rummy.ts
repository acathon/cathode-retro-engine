/**
 * Gin rummy: draw, discard, knock.
 *
 * The search that decides what a hand is worth lives in `melds.ts`; this is
 * the table around it — two hands, a stock, a discard pile, whose turn it is,
 * and the scoring when somebody knocks. As with the other card games here it
 * touches nothing from the engine, so a whole match can be played out in a
 * test in a millisecond.
 */
import { freshDeck, makeRng, shuffle, type Card } from '@cathode/cards';
import { bestArrangement, deadwoodOf, handValue, layOff, type Meld } from './melds';

export const HAND_SIZE = 10;
/** A knock needs ten or fewer points of deadwood. Zero is gin. */
export const KNOCK_LIMIT = 10;
export const GIN_BONUS = 25;
export const UNDERCUT_BONUS = 25;
export const TARGET_SCORE = 100;

export type Turn = 'you' | 'them';
export type Phase = 'draw' | 'discard' | 'over' | 'match-over';

export type Ending = 'knock' | 'gin' | 'undercut' | 'wall';

export interface Result {
  ending: Ending;
  /** Who took the points. */
  winner: Turn;
  points: number;
  knockerDeadwood: number;
  defenderDeadwood: number;
  /** Deadwood the defender managed to lay off on the knocker's melds. */
  laidOff: Card[];
}

export interface Game {
  hands: Record<Turn, Card[]>;
  stock: Card[];
  discard: Card[];
  turn: Turn;
  phase: Phase;
  scores: Record<Turn, number>;
  result: Result | null;
  log: string[];
  deals: number;
  rand: () => number;
}

export function createGame(seed: number): Game {
  return {
    hands: { you: [], them: [] },
    stock: [],
    discard: [],
    turn: 'you',
    phase: 'draw',
    scores: { you: 0, them: 0 },
    result: null,
    log: [],
    deals: 0,
    rand: makeRng(seed),
  };
}

export const other = (turn: Turn): Turn => (turn === 'you' ? 'them' : 'you');

/** Deal ten each and turn one card up. The non-dealer leads. */
export function deal(game: Game, first: Turn = 'you'): void {
  const deck = shuffle(freshDeck(), game.rand);
  game.hands.you = deck.splice(0, HAND_SIZE).map((c) => ({ ...c, faceUp: true }));
  game.hands.them = deck.splice(0, HAND_SIZE).map((c) => ({ ...c, faceUp: false }));
  game.stock = deck.map((c) => ({ ...c, faceUp: false }));
  game.discard = [{ ...game.stock.pop()!, faceUp: true }];
  game.turn = first;
  game.phase = 'draw';
  game.result = null;
  game.log = [];
  game.deals++;
}

/** The card on top of the discard pile, which either player may take. */
export const upcard = (game: Game): Card | null =>
  game.discard.length ? game.discard[game.discard.length - 1] : null;

/**
 * The stock is never emptied completely: with two cards left the hand is a
 * wash. Playing to the last card would let the final drawer knock with no
 * chance of reply.
 */
export const stockExhausted = (game: Game): boolean => game.stock.length <= 2;

export function drawFromStock(game: Game): Card | null {
  if (game.phase !== 'draw' || !game.stock.length) return null;
  const card = game.stock.pop()!;
  card.faceUp = game.turn === 'you';
  game.hands[game.turn].push(card);
  game.phase = 'discard';
  game.log.push(`${game.turn} DRAWS`);
  return card;
}

export function drawFromDiscard(game: Game): Card | null {
  if (game.phase !== 'draw' || !game.discard.length) return null;
  const card = game.discard.pop()!;
  card.faceUp = true;
  game.hands[game.turn].push(card);
  game.phase = 'discard';
  game.log.push(`${game.turn} TAKES THE UPCARD`);
  return card;
}

/** Put a card down, ending the turn. */
export function discard(game: Game, card: Card): boolean {
  if (game.phase !== 'discard') return false;
  const hand = game.hands[game.turn];
  const at = hand.indexOf(card);
  if (at < 0) return false;

  hand.splice(at, 1);
  card.faceUp = true;
  game.discard.push(card);

  if (stockExhausted(game)) {
    endWall(game);
    return true;
  }

  game.turn = other(game.turn);
  game.phase = 'draw';
  return true;
}

/** Can the player to act knock right now, if they discard `card`? */
export function canKnock(game: Game, card: Card): boolean {
  if (game.phase !== 'discard') return false;
  const hand = game.hands[game.turn].filter((c) => c !== card);
  if (hand.length !== HAND_SIZE) return false;
  return deadwoodOf(hand) <= KNOCK_LIMIT;
}

/**
 * Knock: discard, show the hand, and settle.
 *
 * The defender lays off what they can and then the difference is scored — or,
 * if the defender is level or better, they undercut and take the difference
 * plus a bonus instead. That reversal is the whole tension of a thin knock.
 */
export function knock(game: Game, card: Card): Result | null {
  if (!canKnock(game, card)) return null;

  const knocker = game.turn;
  const defender = other(knocker);
  const hand = game.hands[knocker];
  const at = hand.indexOf(card);
  if (at < 0) return null;
  hand.splice(at, 1);
  card.faceUp = true;
  game.discard.push(card);

  const knockerHand = bestArrangement(hand);
  const defenderHand = bestArrangement(game.hands[defender]);
  const gin = knockerHand.value === 0;

  // Gin cannot be laid off against: there is no incomplete meld to extend.
  const { laid, left } = gin
    ? { laid: [] as Card[], left: defenderHand.deadwood }
    : layOff(defenderHand.deadwood, knockerHand.melds);
  const defenderDeadwood = handValue(left);

  let result: Result;
  if (gin) {
    result = {
      ending: 'gin',
      winner: knocker,
      points: defenderDeadwood + GIN_BONUS,
      knockerDeadwood: 0,
      defenderDeadwood,
      laidOff: laid,
    };
  } else if (defenderDeadwood <= knockerHand.value) {
    result = {
      ending: 'undercut',
      winner: defender,
      points: knockerHand.value - defenderDeadwood + UNDERCUT_BONUS,
      knockerDeadwood: knockerHand.value,
      defenderDeadwood,
      laidOff: laid,
    };
  } else {
    result = {
      ending: 'knock',
      winner: knocker,
      points: defenderDeadwood - knockerHand.value,
      knockerDeadwood: knockerHand.value,
      defenderDeadwood,
      laidOff: laid,
    };
  }

  finish(game, result);
  return result;
}

/** The stock ran out with nobody knocking: nobody scores. */
function endWall(game: Game): void {
  finish(game, {
    ending: 'wall',
    winner: game.turn,
    points: 0,
    knockerDeadwood: deadwoodOf(game.hands[game.turn]),
    defenderDeadwood: deadwoodOf(game.hands[other(game.turn)]),
    laidOff: [],
  });
}

function finish(game: Game, result: Result): void {
  game.result = result;
  game.scores[result.winner] += result.points;
  game.phase = game.scores[result.winner] >= TARGET_SCORE ? 'match-over' : 'over';
  for (const card of [...game.hands.you, ...game.hands.them]) card.faceUp = true;
  game.log.push(`${result.ending.toUpperCase()} — ${result.winner} SCORES ${result.points}`);
}

/** Melds and deadwood for a hand, for the display and for the bot. */
export const arrange = (hand: Card[]): { melds: Meld[]; deadwood: Card[]; value: number } =>
  bestArrangement(hand);

export function newDeal(game: Game): void {
  if (game.phase === 'match-over') {
    game.scores = { you: 0, them: 0 };
    game.deals = 0;
  }
  // The loser of a hand leads the next one.
  deal(game, game.result && game.result.winner === 'you' ? 'them' : 'you');
}
