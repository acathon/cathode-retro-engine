/**
 * Klondike solitaire, as rules rather than as pixels.
 *
 * Nothing in this file touches the engine, a canvas or an input device, which
 * is what lets the whole rule set be unit-tested: a legal move is decided by
 * `canDrop`, and every mutation goes through `applyMove`. `main.ts` only
 * decides which move to ask for and how to draw the result.
 */

export const SUITS = ['spades', 'diamonds', 'clubs', 'hearts'] as const;
export type Suit = (typeof SUITS)[number];

/** 0 = Ace, 12 = King. */
export type Rank = number;

export interface Card {
  suit: number;
  rank: Rank;
  faceUp: boolean;
}

/** Red suits are diamonds and hearts; the tableau alternates colour. */
export const isRed = (suit: number): boolean => suit === 1 || suit === 3;

export const cardId = (c: Card): number => c.suit * 13 + c.rank;

export const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Where a card can live. The order matters: it is the order the cursor walks
 * left to right across the table.
 */
export type PileKind = 'stock' | 'waste' | 'foundation' | 'tableau';

export interface Pile {
  kind: PileKind;
  cards: Card[];
  /** Foundations only: which suit this pile collects. */
  suit?: number;
}

export interface Game {
  piles: Pile[];
  moves: number;
  /** Times the waste has been turned back into the stock. */
  recycles: number;
  won: boolean;
}

export const STOCK = 0;
export const WASTE = 1;
export const FOUNDATION_0 = 2;
export const TABLEAU_0 = 6;
export const TABLEAU_COUNT = 7;
export const PILE_COUNT = TABLEAU_0 + TABLEAU_COUNT;

/** A deterministic RNG, so a seed always deals the same game. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 0; rank < 13; rank++) deck.push({ suit, rank, faceUp: false });
  }
  return deck;
}

export function shuffle(deck: Card[], rand: () => number): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deal a new game: column i gets i+1 cards, the last of them face up. */
export function deal(seed: number): Game {
  const deck = shuffle(freshDeck(), makeRng(seed));
  const piles: Pile[] = [
    { kind: 'stock', cards: [] },
    { kind: 'waste', cards: [] },
  ];
  for (let i = 0; i < 4; i++) piles.push({ kind: 'foundation', cards: [], suit: i });
  for (let i = 0; i < TABLEAU_COUNT; i++) piles.push({ kind: 'tableau', cards: [] });

  let next = 0;
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    for (let n = 0; n <= col; n++) {
      const card = deck[next++];
      card.faceUp = n === col;
      piles[TABLEAU_0 + col].cards.push(card);
    }
  }
  while (next < deck.length) {
    deck[next].faceUp = false;
    piles[STOCK].cards.push(deck[next++]);
  }

  return { piles, moves: 0, recycles: 0, won: false };
}

export const top = (pile: Pile): Card | null =>
  pile.cards.length ? pile.cards[pile.cards.length - 1] : null;

/**
 * How many cards from the top of a tableau pile form a legal moveable run:
 * face up, descending, alternating colour.
 */
export function runLength(pile: Pile): number {
  const { cards } = pile;
  let n = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    if (!card.faceUp) break;
    if (n > 0) {
      const above = cards[i + 1];
      if (above.rank !== card.rank - 1) break;
      if (isRed(above.suit) === isRed(card.suit)) break;
    }
    n++;
  }
  return n;
}

/** Can `cards` (already a legal run) be dropped onto `dest`? */
export function canDrop(dest: Pile, cards: Card[]): boolean {
  if (!cards.length) return false;
  const first = cards[0];

  if (dest.kind === 'foundation') {
    // Foundations take one card at a time, in suit, from the Ace up.
    if (cards.length !== 1) return false;
    if (first.suit !== dest.suit) return false;
    const t = top(dest);
    return t ? first.rank === t.rank + 1 : first.rank === 0;
  }

  if (dest.kind === 'tableau') {
    const t = top(dest);
    // An empty column is a King's alone.
    if (!t) return first.rank === 12;
    if (!t.faceUp) return false;
    return first.rank === t.rank - 1 && isRed(first.suit) !== isRed(t.suit);
  }

  // Nothing is ever dropped back onto the stock or the waste.
  return false;
}

/** The cards a pile would hand over if picked up at `depth` from its top. */
export function grab(pile: Pile, depth: number): Card[] {
  if (pile.kind === 'stock') return [];
  if (pile.kind === 'waste' || pile.kind === 'foundation') {
    const t = top(pile);
    return t ? [t] : [];
  }
  const max = runLength(pile);
  const n = Math.max(1, Math.min(depth, max));
  return max === 0 ? [] : pile.cards.slice(pile.cards.length - n);
}

export interface Move {
  from: number;
  to: number;
  /** How many cards, counted from the top of `from`. */
  count: number;
}

/** Is this move legal right now? */
export function isLegal(game: Game, move: Move): boolean {
  const from = game.piles[move.from];
  const to = game.piles[move.to];
  if (!from || !to || move.from === move.to) return false;
  if (from.kind === 'stock') return false;
  if (move.count < 1 || move.count > from.cards.length) return false;

  const cards = from.cards.slice(from.cards.length - move.count);
  if (cards.some((c) => !c.faceUp)) return false;
  if (from.kind !== 'tableau' && move.count !== 1) return false;
  if (from.kind === 'tableau' && move.count > runLength(from)) return false;

  return canDrop(to, cards);
}

/**
 * Apply a move, turning up the card it exposes.
 *
 * Returns false and changes nothing when the move is illegal, so the caller
 * can treat "did it move?" as the same question as "was it allowed?".
 */
export function applyMove(game: Game, move: Move): boolean {
  if (!isLegal(game, move)) return false;

  const from = game.piles[move.from];
  const to = game.piles[move.to];
  const cards = from.cards.splice(from.cards.length - move.count, move.count);
  to.cards.push(...cards);

  // Exposing a face-down card in the tableau turns it over. That is the only
  // way information enters the game, which is why it is not optional.
  if (from.kind === 'tableau') {
    const exposed = top(from);
    if (exposed && !exposed.faceUp) exposed.faceUp = true;
  }

  game.moves++;
  game.won = isWon(game);
  return true;
}

/** Turn one card from the stock, or recycle the waste when it is empty. */
export function drawFromStock(game: Game): boolean {
  const stock = game.piles[STOCK];
  const waste = game.piles[WASTE];

  if (stock.cards.length) {
    const card = stock.cards.pop()!;
    card.faceUp = true;
    waste.cards.push(card);
    game.moves++;
    return true;
  }

  if (!waste.cards.length) return false;

  // Recycling preserves the order rather than reshuffling: the pile you have
  // already seen is information, and shuffling it away is a different game.
  while (waste.cards.length) {
    const card = waste.cards.pop()!;
    card.faceUp = false;
    stock.cards.push(card);
  }
  game.recycles++;
  game.moves++;
  return true;
}

/** The foundation this card belongs to, whether or not it can go there yet. */
export const foundationFor = (card: Card): number => FOUNDATION_0 + card.suit;

/**
 * Send the top card of `pile` to its foundation if it will go.
 * Used by the one-key "promote" control and by the auto-finish.
 */
export function autoPromote(game: Game, pileIndex: number): boolean {
  const pile = game.piles[pileIndex];
  const card = top(pile);
  if (!card || !card.faceUp) return false;
  return applyMove(game, { from: pileIndex, to: foundationFor(card), count: 1 });
}

export const isWon = (game: Game): boolean =>
  game.piles.filter((p) => p.kind === 'foundation').every((p) => p.cards.length === 13);

/**
 * True once no card is face-down and the stock is empty: from here every
 * remaining card can be promoted, so the game offers to finish itself rather
 * than making the player click out a foregone conclusion.
 */
export function canAutoFinish(game: Game): boolean {
  if (game.won) return false;
  if (game.piles[STOCK].cards.length || game.piles[WASTE].cards.length) return false;
  return game.piles.every((p) => p.kind !== 'tableau' || p.cards.every((c) => c.faceUp));
}

/** One step of the auto-finish. Returns the pile it promoted from, or -1. */
export function autoFinishStep(game: Game): number {
  for (let i = TABLEAU_0; i < PILE_COUNT; i++) {
    if (autoPromote(game, i)) return i;
  }
  return -1;
}

/**
 * Where the top card of `from` could legally go, best destination first:
 * a foundation before a tableau, since promoting is almost always progress.
 */
export function suggestDestination(game: Game, from: number, count: number): number {
  const pile = game.piles[from];
  if (!pile || pile.cards.length < count) return -1;
  const cards = pile.cards.slice(pile.cards.length - count);

  if (count === 1) {
    const dest = foundationFor(cards[0]);
    if (isLegal(game, { from, to: dest, count: 1 })) return dest;
  }
  // Moving a whole tableau pile into an empty column gains nothing: it
  // exposes no face-down card and frees no space, so a lone King would be
  // suggested back and forth between empty columns forever. The rules still
  // allow it — a player may have a reason — but the hint will not offer it.
  const wholePile = pile.kind === 'tableau' && count === pile.cards.length;

  for (let i = TABLEAU_0; i < PILE_COUNT; i++) {
    if (i === from) continue;
    if (wholePile && game.piles[i].cards.length === 0) continue;
    if (isLegal(game, { from, to: i, count })) return i;
  }
  return -1;
}
