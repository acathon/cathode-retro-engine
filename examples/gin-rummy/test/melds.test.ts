import type { Card } from '@cathode/cards';
import { describe, expect, it } from 'vitest';
import {
  allMelds, bestArrangement, deadwoodOf, deadwoodValue, extendsMeld,
  handValue, layOff,
} from '../src/melds';

const SUIT: Record<string, number> = { S: 0, D: 1, C: 2, H: 3 };
const RANK: Record<string, number> = {
  A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8,
  T: 9, J: 10, Q: 11, K: 12,
};
const card = (s: string): Card => ({
  rank: RANK[s.slice(0, -1)], suit: SUIT[s.slice(-1)], faceUp: true,
});
const hand = (...names: string[]): Card[] => names.map(card);

describe('card values', () => {
  it('counts an ace as one', () => {
    expect(deadwoodValue(card('AS'))).toBe(1);
  });

  it('counts every court card as ten', () => {
    for (const c of ['TS', 'JS', 'QS', 'KS']) expect(deadwoodValue(card(c))).toBe(10);
  });

  it('counts pips at face value', () => {
    expect(deadwoodValue(card('7D'))).toBe(7);
  });

  it('adds a hand up', () => {
    expect(handValue(hand('AS', '7D', 'KH'))).toBe(18);
  });
});

describe('finding melds', () => {
  it('finds a set of three', () => {
    const melds = allMelds(hand('7S', '7D', '7C', '2H'));
    expect(melds.filter((m) => m.kind === 'set')).toHaveLength(1);
  });

  it('finds a set of four and each three inside it', () => {
    const sets = allMelds(hand('7S', '7D', '7C', '7H')).filter((m) => m.kind === 'set');
    expect(sets).toHaveLength(5);
  });

  it('finds a run of three', () => {
    const runs = allMelds(hand('5S', '6S', '7S', 'KH')).filter((m) => m.kind === 'run');
    expect(runs).toHaveLength(1);
  });

  it('finds every window inside a longer run', () => {
    // 5-6-7-8: two threes and one four.
    const runs = allMelds(hand('5S', '6S', '7S', '8S')).filter((m) => m.kind === 'run');
    expect(runs).toHaveLength(3);
  });

  it('does not run across suits', () => {
    expect(allMelds(hand('5S', '6D', '7C')).filter((m) => m.kind === 'run')).toHaveLength(0);
  });

  it('does not wrap the ace round from the king', () => {
    expect(allMelds(hand('QS', 'KS', 'AS')).filter((m) => m.kind === 'run')).toHaveLength(0);
  });

  it('does run from the ace upward', () => {
    expect(allMelds(hand('AS', '2S', '3S')).filter((m) => m.kind === 'run')).toHaveLength(1);
  });

  it('finds nothing in a hand with nothing', () => {
    expect(allMelds(hand('2S', '5D', '9C', 'KH'))).toHaveLength(0);
  });
});

describe('the best arrangement', () => {
  it('melds everything when everything melds', () => {
    const r = bestArrangement(hand('7S', '7D', '7C', '4H', '5H', '6H'));
    expect(r.value).toBe(0);
    expect(r.melds).toHaveLength(2);
    expect(r.deadwood).toHaveLength(0);
  });

  it('leaves what cannot meld', () => {
    const r = bestArrangement(hand('7S', '7D', '7C', 'KH', '2S'));
    expect(r.value).toBe(12);
    expect(r.deadwood.map((c) => c.rank).sort()).toEqual([1, 12]);
  });

  /**
   * The case a greedy solver gets wrong. The seven of spades can complete the
   * run or the set but not both, and the two choices are not equal: keeping
   * the run leaves 7+7+K = 24, keeping the set leaves 5+6+K = 21. A solver
   * that takes the first meld it finds picks whichever it happened to
   * enumerate first.
   */
  it('chooses between a set and a run competing for one card', () => {
    const r = bestArrangement(hand('5S', '6S', '7S', '7D', '7C', 'KH'));
    expect(r.value).toBe(21);
    expect(r.melds).toHaveLength(1);
    expect(r.melds[0].kind).toBe('set');
  });

  it('prefers the arrangement that melds more, not the one it finds first', () => {
    // 8-9-10 of spades plus three eights: taking the run leaves two eights
    // (16); taking the set leaves 9 and 10 of spades (19).
    const r = bestArrangement(hand('8S', '9S', 'TS', '8D', '8C'));
    expect(r.value).toBe(16);
  });

  it('splits a run of four to feed a set', () => {
    // 4-5-6-7 of spades and two more sevens: the run of three plus the set of
    // sevens melds all six cards, but only if the run gives up its seven.
    const r = bestArrangement(hand('4S', '5S', '6S', '7S', '7D', '7C'));
    expect(r.value).toBe(0);
    expect(r.melds).toHaveLength(2);
  });

  it('scores a gin hand as zero', () => {
    const r = bestArrangement(hand('AS', '2S', '3S', '7D', '7C', '7H', 'JS', 'JD', 'JC', 'JH'));
    expect(r.value).toBe(0);
  });

  it('scores a hand with no melds as its face value', () => {
    const cards = hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3H', '5S', '9D');
    expect(bestArrangement(cards).value).toBe(handValue(cards));
  });

  it('never reports deadwood the hand does not contain', () => {
    const cards = hand('4S', '5S', '6S', '7S', '7D', '7C', 'KH', '2C', '9D', 'AS');
    const r = bestArrangement(cards);
    for (const c of r.deadwood) expect(cards).toContain(c);
    for (const m of r.melds) for (const c of m.cards) expect(cards).toContain(c);
    expect(r.melds.flatMap((m) => m.cards).length + r.deadwood.length).toBe(cards.length);
  });

  it('never uses one card in two melds', () => {
    const cards = hand('4S', '5S', '6S', '7S', '7D', '7C', 'KH', '2C', '9D', 'AS');
    const used = bestArrangement(cards).melds.flatMap((m) => m.cards);
    expect(new Set(used).size).toBe(used.length);
  });

  it('handles eleven cards, which is what a hand is mid-turn', () => {
    const cards = hand('4S', '5S', '6S', '7S', '7D', '7C', 'KH', '2C', '9D', 'AS', '3H');
    expect(bestArrangement(cards).value).toBeGreaterThanOrEqual(0);
  });
});

describe('laying off', () => {
  const setOfSevens = { kind: 'set' as const, cards: hand('7S', '7D', '7C') };
  const runInSpades = { kind: 'run' as const, cards: hand('5S', '6S', '7S') };

  it('adds a fourth to a set', () => {
    expect(extendsMeld(setOfSevens, card('7H'))).toBe(true);
  });

  it('will not add a fifth to a set', () => {
    const full = { kind: 'set' as const, cards: hand('7S', '7D', '7C', '7H') };
    expect(extendsMeld(full, card('7S'))).toBe(false);
  });

  it('extends a run at either end', () => {
    expect(extendsMeld(runInSpades, card('4S'))).toBe(true);
    expect(extendsMeld(runInSpades, card('8S'))).toBe(true);
  });

  it('will not extend a run with another suit', () => {
    expect(extendsMeld(runInSpades, card('8D'))).toBe(false);
  });

  it('lays off what fits and keeps what does not', () => {
    const { laid, left } = layOff(hand('7H', 'KD'), [setOfSevens]);
    expect(laid.map((c) => c.rank)).toEqual([6]);
    expect(left.map((c) => c.rank)).toEqual([12]);
  });

  it('lays a card on a run and then the next one along', () => {
    // The 8 extends 5-6-7; once it is there, the 9 extends it too.
    const { laid } = layOff(hand('8S', '9S'), [runInSpades]);
    expect(laid).toHaveLength(2);
  });

  it('leaves everything when nothing fits', () => {
    const { laid, left } = layOff(hand('2H', 'KD'), [setOfSevens]);
    expect(laid).toHaveLength(0);
    expect(left).toHaveLength(2);
  });
});

describe('deadwoodOf', () => {
  it('agrees with the arrangement it comes from', () => {
    const cards = hand('4S', '5S', '6S', '7D', 'KH', '2C', '9D', 'AS', '3H', 'QC');
    expect(deadwoodOf(cards)).toBe(bestArrangement(cards).value);
  });
});
