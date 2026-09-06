/**
 * One deck of cards, shared by every card game in the repository.
 *
 * Nothing here touches the engine. A card is a suit, a rank and whether it is
 * face up; everything else — what beats what, what a hand is worth, where it
 * may be played — belongs to the game that is using the deck, because those
 * answers disagree between solitaire, blackjack, poker and rummy.
 */

export const SUITS = ['spades', 'diamonds', 'clubs', 'hearts'] as const;
export type Suit = (typeof SUITS)[number];

/**
 * 0 = Ace, 12 = King.
 *
 * The ordering matches the sprite sheet's columns, which is the only reason
 * to store an ace as 0 when most games want it to be the highest card. Games
 * that rank aces high call `pokerRank`; games that count them call
 * `blackjackValues`.
 */
export type Rank = number;

export interface Card {
  suit: number;
  rank: Rank;
  faceUp: boolean;
}

export const RANKS_PER_SUIT = 13;
export const DECK_SIZE = 52;

/** Diamonds and hearts. Solitaire alternates on it; poker does not care. */
export const isRed = (suit: number): boolean => suit === 1 || suit === 3;

/** A number in 0..51, unique per card in a single deck. */
export const cardId = (c: Card): number => c.suit * RANKS_PER_SUIT + c.rank;

export const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_GLYPHS = ['S', 'D', 'C', 'H'];

/** "AS", "10H" — short enough for a HUD, unambiguous enough for a test name. */
export const cardName = (c: Card): string => `${RANK_NAMES[c.rank]}${SUIT_GLYPHS[c.suit]}`;

/**
 * Ace-high rank, 2..14, for games where an ace beats a king.
 *
 * Poker's wheel straight (A-2-3-4-5) is the one place this is wrong, and the
 * evaluator that needs it handles the ace as 1 there itself.
 */
export const pokerRank = (c: Card): number => (c.rank === 0 ? 14 : c.rank + 1);

/**
 * What a card is worth in blackjack. An ace is returned as both of its
 * values, because "is this hand soft?" is a question about the hand, not
 * about the card, and collapsing it here loses the answer.
 */
export function blackjackValues(c: Card): number[] {
  if (c.rank === 0) return [1, 11];
  return [Math.min(c.rank + 1, 10)];
}

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

export function freshDeck(faceUp = false): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < SUITS.length; suit++) {
    for (let rank = 0; rank < RANKS_PER_SUIT; rank++) deck.push({ suit, rank, faceUp });
  }
  return deck;
}

/** Fisher-Yates, returning a new array so the input can be a constant. */
export function shuffle(deck: Card[], rand: () => number): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A deck you draw from, with the reshuffle rule games actually need: a shoe
 * of `decks` decks that reshuffles once it is down to `penetration` of its
 * cards, the way a casino shoe does.
 */
export class Shoe {
  private cards: Card[] = [];
  private rand: () => number;
  /** Cards dealt since the last shuffle. Blackjack counters would want this. */
  dealt = 0;

  constructor(
    seed: number,
    readonly decks = 1,
    readonly penetration = 0.25,
  ) {
    this.rand = makeRng(seed);
    this.refill();
  }

  get remaining(): number {
    return this.cards.length;
  }

  /** True when the next draw will trigger a reshuffle. */
  get spent(): boolean {
    return this.cards.length <= this.decks * DECK_SIZE * this.penetration;
  }

  refill(): void {
    const all: Card[] = [];
    for (let i = 0; i < this.decks; i++) all.push(...freshDeck());
    this.cards = shuffle(all, this.rand);
    this.dealt = 0;
  }

  /** Take one card. Reshuffles first if the shoe has run down. */
  draw(faceUp = true): Card {
    if (this.spent) this.refill();
    const card = this.cards.pop()!;
    card.faceUp = faceUp;
    this.dealt++;
    return card;
  }

  drawMany(n: number, faceUp = true): Card[] {
    return Array.from({ length: n }, () => this.draw(faceUp));
  }
}
