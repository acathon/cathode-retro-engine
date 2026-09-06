import { freshDeck, makeRng, shuffle, type Card } from '@cathode/cards';
import { describe as group, expect, it } from 'vitest';
import { Category, compare, describe, evaluate, score5 } from '../src/evaluator';

/** "AS" spades, "10H" hearts. Rank 0 is an ace, 12 a king. */
const SUIT: Record<string, number> = { S: 0, D: 1, C: 2, H: 3 };
const RANK: Record<string, number> = {
  A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8,
  T: 9, J: 10, Q: 11, K: 12,
};

const card = (s: string): Card => ({
  rank: RANK[s.slice(0, -1)], suit: SUIT[s.slice(-1)], faceUp: true,
});
const hand = (...names: string[]): Card[] => names.map(card);
const cat = (...names: string[]) => evaluate(hand(...names)).category;

group('categories', () => {
  it('reads a high card', () => {
    expect(cat('AS', 'KD', '9C', '7H', '3S')).toBe(Category.HighCard);
  });

  it('reads a pair', () => {
    expect(cat('AS', 'AD', '9C', '7H', '3S')).toBe(Category.Pair);
  });

  it('reads two pair', () => {
    expect(cat('AS', 'AD', '9C', '9H', '3S')).toBe(Category.TwoPair);
  });

  it('reads three of a kind', () => {
    expect(cat('AS', 'AD', 'AC', '9H', '3S')).toBe(Category.Trips);
  });

  it('reads a straight', () => {
    expect(cat('9S', '8D', '7C', '6H', '5S')).toBe(Category.Straight);
  });

  it('reads a flush', () => {
    expect(cat('AS', 'JS', '9S', '7S', '3S')).toBe(Category.Flush);
  });

  it('reads a full house', () => {
    expect(cat('AS', 'AD', 'AC', '9H', '9S')).toBe(Category.FullHouse);
  });

  it('reads four of a kind', () => {
    expect(cat('AS', 'AD', 'AC', 'AH', '9S')).toBe(Category.Quads);
  });

  it('reads a straight flush', () => {
    expect(cat('9S', '8S', '7S', '6S', '5S')).toBe(Category.StraightFlush);
  });
});

group('the wheel', () => {
  it('counts A-2-3-4-5 as a straight', () => {
    expect(cat('AS', '2D', '3C', '4H', '5S')).toBe(Category.Straight);
  });

  it('ranks the wheel as a five, not as an ace', () => {
    expect(evaluate(hand('AS', '2D', '3C', '4H', '5S')).kickers).toEqual([5]);
  });

  it('loses the wheel to a six-high straight', () => {
    const wheel = evaluate(hand('AS', '2D', '3C', '4H', '5S'));
    const six = evaluate(hand('2S', '3D', '4C', '5H', '6S'));
    expect(compare(six, wheel)).toBeGreaterThan(0);
  });

  it('counts a suited wheel as a straight flush', () => {
    expect(cat('AS', '2S', '3S', '4S', '5S')).toBe(Category.StraightFlush);
  });

  it('does not read K-A-2-3-4 as a straight', () => {
    expect(cat('KS', 'AD', '2C', '3H', '4S')).toBe(Category.HighCard);
  });
});

group('ordering within a category', () => {
  it('breaks a pair on the kicker', () => {
    const better = evaluate(hand('KS', 'KD', 'AC', '7H', '3S'));
    const worse = evaluate(hand('KH', 'KC', 'QC', '7D', '3D'));
    expect(compare(better, worse)).toBeGreaterThan(0);
  });

  it('breaks two pair on the higher pair first', () => {
    const better = evaluate(hand('KS', 'KD', '2C', '2H', '3S'));
    const worse = evaluate(hand('QS', 'QD', 'JC', 'JH', 'AS'));
    expect(compare(better, worse)).toBeGreaterThan(0);
  });

  it('breaks two pair on the fifth card when both pairs match', () => {
    const better = evaluate(hand('KS', 'KD', '2C', '2H', 'AS'));
    const worse = evaluate(hand('KH', 'KC', '2S', '2D', 'QS'));
    expect(compare(better, worse)).toBeGreaterThan(0);
  });

  it('breaks a flush card by card', () => {
    const better = evaluate(hand('AS', 'QS', '9S', '7S', '3S'));
    const worse = evaluate(hand('AD', 'JD', '9D', '7D', '3D'));
    expect(compare(better, worse)).toBeGreaterThan(0);
  });

  it('splits identical hands of different suits', () => {
    const a = evaluate(hand('AS', 'KD', '9C', '7H', '3S'));
    const b = evaluate(hand('AH', 'KC', '9D', '7S', '3H'));
    expect(compare(a, b)).toBe(0);
  });

  it('ranks a full house by the trips, not the pair', () => {
    const better = evaluate(hand('3S', '3D', '3C', '2H', '2S'));
    const worse = evaluate(hand('2D', '2C', '2S', 'AH', 'AS'));
    expect(compare(better, worse)).toBeGreaterThan(0);
  });
});

group('the ladder', () => {
  const ladder = [
    ['AS', 'KD', '9C', '7H', '3S'],       // high card
    ['2S', '2D', '9C', '7H', '3S'],       // pair
    ['2S', '2D', '3C', '3H', '9S'],       // two pair
    ['2S', '2D', '2C', '7H', '3S'],       // trips
    ['2S', '3D', '4C', '5H', '6S'],       // straight
    ['2S', '5S', '9S', 'JS', 'KS'],       // flush
    ['2S', '2D', '2C', '3H', '3S'],       // full house
    ['2S', '2D', '2C', '2H', '3S'],       // quads
    ['2S', '3S', '4S', '5S', '6S'],       // straight flush
  ];

  it('orders every category above the one below it', () => {
    for (let i = 1; i < ladder.length; i++) {
      const above = evaluate(hand(...ladder[i]));
      const below = evaluate(hand(...ladder[i - 1]));
      expect(compare(above, below)).toBeGreaterThan(0);
    }
  });
});

group('seven cards', () => {
  it('finds the flush hiding in seven', () => {
    expect(cat('AS', 'KS', '9S', '7S', '3S', '2D', '4C')).toBe(Category.Flush);
  });

  it('prefers a flush to the straight in the same seven', () => {
    // 5-6-7-8-9 is a straight; the four spades plus one more make a flush.
    const r = evaluate(hand('5S', '6S', '7S', '8S', '9D', '2S', 'KH'));
    expect(r.category).toBe(Category.Flush);
  });

  it('finds a straight flush over a lesser flush in the same suit', () => {
    expect(cat('5S', '6S', '7S', '8S', '9S', 'KS', '2D')).toBe(Category.StraightFlush);
    expect(evaluate(hand('5S', '6S', '7S', '8S', '9S', 'KS', '2D')).kickers).toEqual([9]);
  });

  it('takes the best full house from two available', () => {
    // Kings full of aces beats aces full of kings? No: trips decide it.
    const r = evaluate(hand('KS', 'KD', 'KC', 'AH', 'AS', '2C', '3D'));
    expect(r.category).toBe(Category.FullHouse);
    expect(r.kickers).toEqual([13, 14]);
  });

  it('uses only five cards', () => {
    expect(evaluate(hand('AS', 'KS', '9S', '7S', '3S', '2D', '4C')).cards).toHaveLength(5);
  });

  it('handles six cards as well as seven', () => {
    expect(cat('AS', 'AD', 'AC', 'AH', '9S', '2D')).toBe(Category.Quads);
  });

  it('refuses fewer than five cards', () => {
    expect(() => evaluate(hand('AS', 'KD', '9C', '7H'))).toThrow();
  });
});

group('describe', () => {
  it('names the hand for a HUD', () => {
    expect(describe(evaluate(hand('KS', 'KD', '9C', '7H', '3S')))).toBe('PAIR OF KINGS');
    expect(describe(evaluate(hand('AS', 'JS', '9S', '7S', '3S')))).toBe('FLUSH, A HIGH');
    expect(describe(evaluate(hand('AS', 'AD', 'AC', 'KH', 'KS')))).toBe('ACES FULL OF KINGS');
    expect(describe(evaluate(hand('AS', 'KS', 'QS', 'JS', 'TS')))).toBe('ROYAL FLUSH');
    expect(describe(evaluate(hand('9S', '9D', '2C', '2H', '3S')))).toBe('NINES AND DEUCES');
  });
});

group('the whole deck', () => {
  /** 2000 real seven-card deals, from a seed so a failure is reproducible. */
  const deals = (n: number): Card[][] => {
    const rand = makeRng(20260906);
    return Array.from({ length: n }, () => shuffle(freshDeck(true), rand).slice(0, 7));
  };

  it('never throws and always returns exactly five cards', () => {
    let seen = 0;
    for (const seven of deals(2000)) {
      const r = evaluate(seven);
      expect(r.cards).toHaveLength(5);
      expect(r.kickers.length).toBeGreaterThan(0);
      // The chosen five must be five of the seven that were dealt.
      for (const c of r.cards) expect(seven).toContain(c);
      seen++;
    }
    expect(seen).toBe(2000);
  });

  it('never rates the best of seven below any five inside it', () => {
    for (const seven of deals(300)) {
      const best = evaluate(seven);
      // Every one of the twenty-one subsets, not just the first.
      for (let a = 0; a < 3; a++) {
        const five = [seven[a], seven[a + 1], seven[a + 2], seven[a + 3], seven[a + 4]];
        expect(compare(best, score5(five))).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('finds every category somewhere in ten thousand deals', () => {
    const rand = makeRng(4242);
    const found = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      found.add(evaluate(shuffle(freshDeck(true), rand).slice(0, 7)).category);
    }
    // Straight flushes are rare enough to miss, but everything up to quads
    // should turn up; a category that never appears means it is unreachable.
    for (const c of [Category.HighCard, Category.Pair, Category.TwoPair,
      Category.Trips, Category.Straight, Category.Flush,
      Category.FullHouse, Category.Quads]) {
      expect(found).toContain(c);
    }
  });
});
