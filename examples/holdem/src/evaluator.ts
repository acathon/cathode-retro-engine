/**
 * Poker hand evaluation: the best five cards out of five, six or seven.
 *
 * This is the part of a poker game that must be exactly right, and the part
 * that is easiest to get subtly wrong — the wheel straight, a flush that also
 * makes a straight, two pair where the kicker decides it. It is therefore
 * pure: cards in, a ranking out, no engine, no table, no opinions.
 *
 * Seven-card hands are evaluated by trying all twenty-one five-card subsets.
 * A lookup table would be faster and much harder to believe; twenty-one
 * comparisons per hand is nothing at four players and one hand every few
 * seconds.
 */
import { RANK_NAMES, pokerRank, type Card } from '@cathode/cards';

export enum Category {
  HighCard = 0,
  Pair,
  TwoPair,
  Trips,
  Straight,
  Flush,
  FullHouse,
  Quads,
  StraightFlush,
}

export const CATEGORY_NAMES: Record<Category, string> = {
  [Category.HighCard]: 'HIGH CARD',
  [Category.Pair]: 'PAIR',
  [Category.TwoPair]: 'TWO PAIR',
  [Category.Trips]: 'THREE OF A KIND',
  [Category.Straight]: 'STRAIGHT',
  [Category.Flush]: 'FLUSH',
  [Category.FullHouse]: 'FULL HOUSE',
  [Category.Quads]: 'FOUR OF A KIND',
  [Category.StraightFlush]: 'STRAIGHT FLUSH',
};

export interface Ranked {
  category: Category;
  /**
   * Tie-breaking ranks, most significant first, using ace-high values 2..14.
   * Two hands of the same category are ordered entirely by this list.
   */
  kickers: number[];
  /** The five cards that made it. */
  cards: Card[];
}

/** Ace-high rank as a name: 14 is an ace, 10 is a ten. */
const rankName = (r: number): string => RANK_NAMES[r === 14 ? 0 : r - 1];

/** Plural for a HUD line: "PAIR OF KINGS", "THREE OF A KIND, SIXES". */
const PLURALS: Record<string, string> = {
  A: 'ACES', '2': 'DEUCES', '3': 'THREES', '4': 'FOURS', '5': 'FIVES',
  '6': 'SIXES', '7': 'SEVENS', '8': 'EIGHTS', '9': 'NINES', '10': 'TENS',
  J: 'JACKS', Q: 'QUEENS', K: 'KINGS',
};
const plural = (r: number): string => PLURALS[rankName(r)];

/** Score exactly five cards. */
export function score5(cards: Card[]): Ranked {
  const ranks = cards.map(pokerRank).sort((a, b) => b - a);
  const suit = cards[0].suit;
  const flush = cards.every((c) => c.suit === suit);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Biggest group first, then highest rank: this ordering is what makes the
  // kicker lists below correct without any further sorting.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const distinct = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    // The wheel: A-2-3-4-5, where the ace plays low and the straight is a five.
    else if (distinct[0] === 14 && distinct[1] === 5 && distinct[4] === 2) straightHigh = 5;
  }

  const make = (category: Category, kickers: number[]): Ranked => ({ category, kickers, cards });

  if (flush && straightHigh) return make(Category.StraightFlush, [straightHigh]);
  if (groups[0][1] === 4) return make(Category.Quads, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return make(Category.FullHouse, [groups[0][0], groups[1][0]]);
  }
  if (flush) return make(Category.Flush, distinct);
  if (straightHigh) return make(Category.Straight, [straightHigh]);
  if (groups[0][1] === 3) return make(Category.Trips, groups.map((g) => g[0]));
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return make(Category.TwoPair, [groups[0][0], groups[1][0], groups[2][0]]);
  }
  if (groups[0][1] === 2) return make(Category.Pair, groups.map((g) => g[0]));
  return make(Category.HighCard, ranks);
}

/** Every five-card subset of `cards`. */
function combinations5(cards: Card[]): Card[][] {
  const out: Card[][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            out.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return out;
}

/**
 * The best five-card hand available in `cards`, which may be five, six or
 * seven cards. Fewer than five throws: there is no such thing as a ranked
 * four-card hand, and silently inventing one hides a bug at the call site.
 */
export function evaluate(cards: Card[]): Ranked {
  if (cards.length < 5) {
    throw new Error(`evaluate needs at least five cards, got ${cards.length}`);
  }
  if (cards.length === 5) return score5(cards);

  let best = score5(cards.slice(0, 5));
  for (const combo of combinations5(cards)) {
    const r = score5(combo);
    if (compare(r, best) > 0) best = r;
  }
  return best;
}

/** Positive when `a` beats `b`, negative when it loses, 0 for a split pot. */
export function compare(a: Ranked, b: Ranked): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const diff = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** A short line for the HUD: "PAIR OF KINGS", "FLUSH, ACE HIGH". */
export function describe(r: Ranked): string {
  const k = r.kickers;
  switch (r.category) {
    case Category.StraightFlush:
      return k[0] === 14 ? 'ROYAL FLUSH' : `STRAIGHT FLUSH, ${rankName(k[0])} HIGH`;
    case Category.Quads: return `FOUR ${plural(k[0])}`;
    case Category.FullHouse: return `${plural(k[0])} FULL OF ${plural(k[1])}`;
    case Category.Flush: return `FLUSH, ${rankName(k[0])} HIGH`;
    case Category.Straight: return `STRAIGHT, ${rankName(k[0])} HIGH`;
    case Category.Trips: return `THREE ${plural(k[0])}`;
    case Category.TwoPair: return `${plural(k[0])} AND ${plural(k[1])}`;
    case Category.Pair: return `PAIR OF ${plural(k[0])}`;
    default: return `${rankName(k[0])} HIGH`;
  }
}
