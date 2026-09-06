/**
 * No-limit Texas hold'em: blinds, four betting rounds, side pots, showdown.
 *
 * The hand rankings live in `evaluator.ts` and the opponents in `ai.ts`; this
 * file is only the table's state machine, and like the rest of the card games
 * it knows nothing about the engine. Every question the table can be asked is
 * a function of one `Game` value, which is what makes side pots — the part of
 * poker that is genuinely fiddly — testable rather than hopeful.
 */
import { freshDeck, makeRng, shuffle, type Card } from '@cathode/cards';
import { compare, evaluate, type Ranked } from './evaluator';

export interface Seat {
  name: string;
  chips: number;
  hole: Card[];
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in across the whole hand. Side pots peel these. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Has this seat acted since the last aggression? */
  acted: boolean;
  human: boolean;
}

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export type Action = 'fold' | 'check' | 'call' | 'raise';

export interface Pot {
  amount: number;
  /** Seat indices that can win this pot. */
  eligible: number[];
}

export interface Award {
  seat: number;
  amount: number;
  /** Absent when the hand ended without a showdown. */
  hand?: Ranked;
}

export interface Blinds {
  small: number;
  big: number;
}

export interface Game {
  deck: Card[];
  board: Card[];
  seats: Seat[];
  button: number;
  /** Whose turn it is, or -1 when nobody is to act. */
  toAct: number;
  street: Street;
  /** The highest bet on this street. */
  currentBet: number;
  /** The size of the last raise, which sets the minimum for the next one. */
  lastRaise: number;
  blinds: Blinds;
  pots: Pot[];
  awards: Award[];
  log: string[];
  handNumber: number;
  rand: () => number;
}

export const BOARD_SIZE: Record<Street, number> = {
  idle: 0, preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5, complete: 5,
};

export function createGame(names: string[], startingStack: number, blinds: Blinds, seed: number): Game {
  return {
    deck: [],
    board: [],
    seats: names.map((name, i) => ({
      name,
      chips: startingStack,
      hole: [],
      bet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      acted: false,
      human: i === 0,
      })),
    button: names.length - 1,
    toAct: -1,
    street: 'idle',
    currentBet: 0,
    lastRaise: blinds.big,
    blinds,
    pots: [],
    awards: [],
    log: [],
    handNumber: 0,
    rand: makeRng(seed),
  };
}

/** Seats with chips left, which is who can be dealt into the next hand. */
export const livePlayers = (game: Game): number[] =>
  game.seats.map((s, i) => (s.chips > 0 ? i : -1)).filter((i) => i >= 0);

/** Seats still contesting the pot. */
export const contenders = (game: Game): number[] =>
  game.seats.map((s, i) => (!s.folded && s.hole.length ? i : -1)).filter((i) => i >= 0);

/** Everything wagered this hand, which is the number the HUD shows as "POT". */
export const potTotal = (game: Game): number =>
  game.seats.reduce((n, s) => n + s.committed, 0);

const next = (game: Game, from: number): number => (from + 1) % game.seats.length;

/** The next seat that can still act: not folded, not already all in. */
function nextToAct(game: Game, from: number): number {
  for (let i = 1; i <= game.seats.length; i++) {
    const seat = (from + i) % game.seats.length;
    const s = game.seats[seat];
    if (!s.folded && !s.allIn && s.hole.length) return seat;
  }
  return -1;
}

// --- Dealing ---------------------------------------------------------------

/**
 * Post the blinds and deal two cards each.
 *
 * Heads-up blinds are the reverse of a full ring — the button posts the small
 * blind and acts first before the flop — so the two cases are separated
 * rather than papered over with an off-by-one.
 */
export function startHand(game: Game): boolean {
  const live = livePlayers(game);
  if (live.length < 2) return false;

  game.deck = shuffle(freshDeck(), game.rand);
  game.board = [];
  game.pots = [];
  game.awards = [];
  game.log = [];
  game.handNumber++;
  game.currentBet = 0;
  game.lastRaise = game.blinds.big;

  for (const s of game.seats) {
    s.hole = [];
    s.bet = 0;
    s.committed = 0;
    s.folded = false;
    s.allIn = false;
    s.acted = false;
  }

  // Move the button to the next seat that still has chips.
  do { game.button = next(game, game.button); }
  while (game.seats[game.button].chips === 0);

  for (const i of live) game.seats[i].hole = [game.deck.pop()!, game.deck.pop()!];
  for (const i of live) game.seats[i].hole.forEach((c) => { c.faceUp = game.seats[i].human; });

  const headsUp = live.length === 2;
  const sbSeat = headsUp ? game.button : seatAfter(game, game.button);
  const bbSeat = seatAfter(game, sbSeat);

  post(game, sbSeat, game.blinds.small);
  post(game, bbSeat, game.blinds.big);
  game.currentBet = game.blinds.big;

  game.street = 'preflop';
  game.toAct = nextToAct(game, bbSeat);
  game.log.push(`HAND ${game.handNumber}`);
  return true;
}

/** The next seat holding chips, clockwise. */
function seatAfter(game: Game, from: number): number {
  for (let i = 1; i <= game.seats.length; i++) {
    const seat = (from + i) % game.seats.length;
    if (game.seats[seat].chips > 0 || game.seats[seat].committed > 0) return seat;
  }
  return from;
}

/** A blind, or any other forced bet: clamped to the stack, all-in if short. */
function post(game: Game, seat: number, amount: number): number {
  const s = game.seats[seat];
  const n = Math.min(amount, s.chips);
  s.chips -= n;
  s.bet += n;
  s.committed += n;
  if (s.chips === 0) s.allIn = true;
  return n;
}

// --- Actions ---------------------------------------------------------------

export interface Legal {
  fold: boolean;
  check: boolean;
  /** Chips needed to call, 0 when checking is free. */
  call: number;
  /** The smallest legal raise-to, or 0 when no raise is possible. */
  minRaise: number;
  /** The largest raise-to, which is always the seat's whole stack. */
  maxRaise: number;
}

export function legalActions(game: Game): Legal {
  const seat = game.seats[game.toAct];
  if (!seat || game.toAct < 0) {
    return { fold: false, check: false, call: 0, minRaise: 0, maxRaise: 0 };
  }
  const toCall = Math.min(game.currentBet - seat.bet, seat.chips);
  const maxRaise = seat.bet + seat.chips;
  // A raise has to at least match the last one; a short stack may still shove
  // for less, which is why the minimum is capped at the whole stack.
  const wanted = game.currentBet + game.lastRaise;
  const minRaise = maxRaise > game.currentBet ? Math.min(wanted, maxRaise) : 0;

  return {
    fold: true,
    check: toCall === 0,
    call: toCall,
    minRaise,
    maxRaise: minRaise > 0 ? maxRaise : 0,
  };
}

/**
 * Take an action for the seat to act.
 *
 * `amount` is the raise *to*, not the raise *by*: "raise to 200" is what a
 * table says out loud, and the by-amount is a subtraction the caller should
 * never have to remember to do.
 */
export function act(game: Game, action: Action, amount = 0): boolean {
  if (game.toAct < 0) return false;
  const seat = game.seats[game.toAct];
  const legal = legalActions(game);
  const who = seat.name;

  switch (action) {
    case 'fold':
      seat.folded = true;
      game.log.push(`${who} FOLDS`);
      break;

    case 'check':
      if (!legal.check) return false;
      game.log.push(`${who} CHECKS`);
      break;

    case 'call': {
      if (legal.call <= 0) return false;
      const paid = post(game, game.toAct, legal.call);
      game.log.push(`${who} CALLS ${paid}`);
      break;
    }

    case 'raise': {
      if (legal.minRaise === 0) return false;
      const to = Math.max(legal.minRaise, Math.min(Math.floor(amount), legal.maxRaise));
      const by = to - game.currentBet;
      post(game, game.toAct, to - seat.bet);

      // An all-in for less than a full raise does not reopen the betting, so
      // only a genuine raise clears everyone else's "has acted" flag.
      if (by >= game.lastRaise) {
        game.lastRaise = by;
        for (const s of game.seats) if (s !== seat) s.acted = false;
      }
      game.currentBet = Math.max(game.currentBet, seat.bet);
      game.log.push(`${who} ${by >= game.lastRaise ? 'RAISES TO' : 'IS ALL IN FOR'} ${to}`);
      break;
    }

    default:
      return false;
  }

  seat.acted = true;
  advance(game);
  return true;
}

/** True once every seat that can act has matched the bet. */
export function roundComplete(game: Game): boolean {
  const live = contenders(game);
  if (live.length <= 1) return true;
  const active = live.filter((i) => !game.seats[i].allIn);
  if (active.length === 0) return true;
  return active.every((i) => game.seats[i].acted && game.seats[i].bet === game.currentBet);
}

function advance(game: Game): void {
  if (contenders(game).length <= 1) {
    finish(game);
    return;
  }
  if (roundComplete(game)) {
    nextStreet(game);
    return;
  }
  game.toAct = nextToAct(game, game.toAct);
  // Everyone left is all in: run the board out rather than asking for action.
  if (game.toAct < 0) nextStreet(game);
}

const ORDER: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];

/** Deal the next street, or go to showdown after the river. */
export function nextStreet(game: Game): void {
  const at = ORDER.indexOf(game.street);
  const to = ORDER[at + 1] ?? 'showdown';

  for (const s of game.seats) {
    s.bet = 0;
    s.acted = false;
  }
  game.currentBet = 0;
  game.lastRaise = game.blinds.big;
  game.street = to;

  if (to === 'showdown') {
    finish(game);
    return;
  }

  // The burn card is not modelled: it changes nothing that can be observed,
  // and pretending otherwise would only make the deck harder to reason about.
  const want = BOARD_SIZE[to];
  while (game.board.length < want) {
    const card = game.deck.pop()!;
    card.faceUp = true;
    game.board.push(card);
  }

  game.toAct = nextToAct(game, game.button);
  // Nobody can act — everyone is all in — so keep dealing.
  if (game.toAct < 0) nextStreet(game);
}

// --- Pots and showdown -----------------------------------------------------

/**
 * Split what has been wagered into a main pot and any side pots.
 *
 * Every distinct all-in amount is a layer: each seat contributes up to that
 * layer, and only the seats who reached it can win it. Folded seats pay into
 * the layers they reached but are eligible for none.
 */
export function buildPots(game: Game): Pot[] {
  const levels = [...new Set(game.seats.map((s) => s.committed))]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const pots: Pot[] = [];
  let floor = 0;
  for (const level of levels) {
    let amount = 0;
    const eligible: number[] = [];
    game.seats.forEach((s, i) => {
      amount += Math.min(s.committed, level) - Math.min(s.committed, floor);
      if (s.committed >= level && !s.folded && s.hole.length) eligible.push(i);
    });
    if (amount > 0) pots.push({ amount, eligible });
    floor = level;
  }

  // Two layers with the same eligible players are not two pots. The blinds
  // alone produce a 5 layer and a 10 layer, which would otherwise pay the
  // same winner twice and read as a side pot that does not exist.
  const merged: Pot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    const same = last
      && last.eligible.length === pot.eligible.length
      && last.eligible.every((v, i) => v === pot.eligible[i]);
    if (same) last.amount += pot.amount;
    else merged.push({ amount: pot.amount, eligible: pot.eligible });
  }
  return merged;
}

/**
 * Award every pot and mark the hand complete.
 *
 * A pot with one contender is pushed without a showdown, which is why the
 * award's `hand` is optional: nobody has to show to win chips nobody contests.
 */
function finish(game: Game): void {
  game.pots = buildPots(game);
  game.awards = [];
  game.toAct = -1;
  game.street = 'complete';

  const showdown = contenders(game).length > 1;
  if (showdown) {
    // The board runs out even when everyone is all in.
    while (game.board.length < 5 && game.deck.length) {
      const card = game.deck.pop()!;
      card.faceUp = true;
      game.board.push(card);
    }
    for (const i of contenders(game)) game.seats[i].hole.forEach((c) => { c.faceUp = true; });
  }

  const ranked = new Map<number, Ranked>();
  if (showdown) {
    for (const i of contenders(game)) {
      ranked.set(i, evaluate([...game.seats[i].hole, ...game.board]));
    }
  }

  for (const pot of game.pots) {
    const eligible = pot.eligible;
    if (eligible.length === 0) continue;

    let winners = eligible;
    if (showdown && eligible.length > 1) {
      winners = eligible.reduce<number[]>((best, i) => {
        if (!best.length) return [i];
        const c = compare(ranked.get(i)!, ranked.get(best[0])!);
        return c > 0 ? [i] : c === 0 ? [...best, i] : best;
      }, []);
    }

    // Odd chips go to the first winner left of the button, as at a real table.
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    const ordered = [...winners].sort(
      (a, b) => ((a - game.button + game.seats.length) % game.seats.length)
        - ((b - game.button + game.seats.length) % game.seats.length),
    );

    for (const seat of ordered) {
      const extra = odd > 0 ? 1 : 0;
      odd -= extra;
      const amount = share + extra;
      game.seats[seat].chips += amount;
      game.awards.push({ seat, amount, hand: ranked.get(seat) });
    }
  }

  for (const a of game.awards) {
    game.log.push(`${game.seats[a.seat].name} WINS ${a.amount}`);
  }

  // The chips have moved back to the seats, so nothing is in the middle any
  // more. Leaving `committed` set would keep `potTotal` reporting a pot that
  // has already been paid — a phantom pot on the HUD between hands, and a
  // double count for anyone totalling the table's chips. `pots` keeps the
  // breakdown for display.
  for (const seat of game.seats) seat.committed = 0;
}

/** Force the hand to end now — used when the human quits mid-hand. */
export const endHand = (game: Game): void => finish(game);
