/**
 * Melds and deadwood: the hard part of gin rummy.
 *
 * "How much deadwood am I holding?" is not a lookup, it is a search. Ten cards
 * can often be arranged several ways — the same king can complete a set of
 * kings or a run in spades but not both — and only the best arrangement
 * counts. So this enumerates every meld the hand contains and then searches
 * for the disjoint combination that leaves the least behind, memoised on which
 * cards are already spoken for.
 *
 * Nothing here knows about the engine, the table or whose turn it is.
 */
import { pokerRank, type Card } from '@cathode/cards';

/** Ace 1, court cards 10, everything else its pip value. */
export function deadwoodValue(card: Card): number {
  if (card.rank === 0) return 1;
  return Math.min(card.rank + 1, 10);
}

export const handValue = (cards: Card[]): number =>
  cards.reduce((n, c) => n + deadwoodValue(c), 0);

export type MeldKind = 'set' | 'run';

export interface Meld {
  kind: MeldKind;
  cards: Card[];
}

/**
 * Every meld present in the hand, as index bitmasks.
 *
 * Sets are three or four of a rank; runs are three or more in suit. A run of
 * five contains two runs of four and three of three, and all of them are
 * emitted: the shortest is sometimes the right choice, because it frees a card
 * for a set.
 *
 * Aces are low and do not wrap: Q-K-A is not a run, which is the standard
 * rule and the one difference from the poker evaluator next door.
 */
export function allMelds(hand: Card[]): { mask: number; kind: MeldKind }[] {
  const out: { mask: number; kind: MeldKind }[] = [];

  // Sets: group the indices by rank, then take every subset of size 3 or 4.
  const byRank = new Map<number, number[]>();
  hand.forEach((c, i) => {
    const list = byRank.get(c.rank) ?? [];
    list.push(i);
    byRank.set(c.rank, list);
  });
  for (const indices of byRank.values()) {
    if (indices.length < 3) continue;
    if (indices.length === 4) {
      out.push({ mask: indices.reduce((m, i) => m | (1 << i), 0), kind: 'set' });
      // Each three of the four is also a set, and dropping the right one can
      // free a card for a run.
      for (let skip = 0; skip < 4; skip++) {
        out.push({
          mask: indices.filter((_, k) => k !== skip).reduce((m, i) => m | (1 << i), 0),
          kind: 'set',
        });
      }
    } else {
      out.push({ mask: indices.reduce((m, i) => m | (1 << i), 0), kind: 'set' });
    }
  }

  // Runs: within each suit, walk consecutive ranks and emit every window of
  // three or more.
  for (let suit = 0; suit < 4; suit++) {
    const indices = hand
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.suit === suit)
      .sort((a, b) => a.c.rank - b.c.rank);

    for (let start = 0; start < indices.length; start++) {
      let mask = 1 << indices[start].i;
      for (let end = start + 1; end < indices.length; end++) {
        if (indices[end].c.rank !== indices[end - 1].c.rank + 1) break;
        mask |= 1 << indices[end].i;
        if (end - start + 1 >= 3) out.push({ mask, kind: 'run' });
      }
    }
  }

  return out;
}

export interface Arrangement {
  melds: Meld[];
  deadwood: Card[];
  /** Points left in hand. Ten or fewer is a legal knock; zero is gin. */
  value: number;
}

/**
 * The arrangement of `hand` that leaves the least deadwood.
 *
 * Exhaustive over disjoint meld combinations, memoised on the set of cards
 * already used. A gin rummy hand is ten or eleven cards and yields a few dozen
 * candidate melds, so this is milliseconds — and being exhaustive means the
 * score it reports is the score, not an estimate a player could beat by
 * rearranging their own cards by hand.
 */
export function bestArrangement(hand: Card[]): Arrangement {
  const melds = allMelds(hand);
  const full = (1 << hand.length) - 1;
  const memo = new Map<number, { value: number; picked: number[] }>();

  const leftoverValue = (used: number): number => {
    let n = 0;
    for (let i = 0; i < hand.length; i++) if (!(used & (1 << i))) n += deadwoodValue(hand[i]);
    return n;
  };

  /** Best result reachable from here, given the cards already melded. */
  const solve = (used: number): { value: number; picked: number[] } => {
    const cached = memo.get(used);
    if (cached) return cached;

    let best = { value: leftoverValue(used), picked: [] as number[] };
    if (used !== full) {
      for (let m = 0; m < melds.length; m++) {
        if (melds[m].mask & used) continue;
        const rest = solve(used | melds[m].mask);
        if (rest.value < best.value) best = { value: rest.value, picked: [m, ...rest.picked] };
      }
    }

    memo.set(used, best);
    return best;
  };

  const { value, picked } = solve(0);
  let used = 0;
  const chosen: Meld[] = picked.map((m) => {
    used |= melds[m].mask;
    return {
      kind: melds[m].kind,
      cards: hand.filter((_, i) => melds[m].mask & (1 << i)),
    };
  });

  return {
    melds: chosen,
    deadwood: hand.filter((_, i) => !(used & (1 << i))),
    value,
  };
}

/** Convenience: how many points this hand is holding, best case. */
export const deadwoodOf = (hand: Card[]): number => bestArrangement(hand).value;

/**
 * Whether `card` extends `meld` — a fourth to a set, or either end of a run.
 * This is what a defender may do with their deadwood after a knock.
 */
export function extendsMeld(meld: Meld, card: Card): boolean {
  if (meld.kind === 'set') {
    return meld.cards.length < 4 && meld.cards[0].rank === card.rank;
  }
  if (card.suit !== meld.cards[0].suit) return false;
  const ranks = meld.cards.map((c) => c.rank).sort((a, b) => a - b);
  return card.rank === ranks[0] - 1 || card.rank === ranks[ranks.length - 1] + 1;
}

/**
 * Lay off as much of `deadwood` as will go onto `melds`.
 *
 * Repeated until nothing more fits, because laying a card on the end of a run
 * makes the next one along a legal lay-off too.
 */
export function layOff(deadwood: Card[], melds: Meld[]): { laid: Card[]; left: Card[] } {
  const targets: Meld[] = melds.map((m) => ({ kind: m.kind, cards: [...m.cards] }));
  const left = [...deadwood];
  const laid: Card[] = [];

  let moved = true;
  while (moved) {
    moved = false;
    for (let i = 0; i < left.length; i++) {
      const target = targets.find((m) => extendsMeld(m, left[i]));
      if (!target) continue;
      target.cards.push(left[i]);
      laid.push(left[i]);
      left.splice(i, 1);
      moved = true;
      break;
    }
  }

  return { laid, left };
}

/** Ace-low ordering, for laying a hand out in a readable order. */
export const sortForDisplay = (hand: Card[]): Card[] =>
  [...hand].sort((a, b) => a.suit - b.suit || a.rank - b.rank || pokerRank(a) - pokerRank(b));
