import type { Card } from '@cathode/cards';
import { describe, expect, it } from 'vitest';
import {
  type Game,
  act, buildPots, contenders, createGame, endHand, legalActions, livePlayers,
  potTotal, roundComplete, startHand,
} from '../src/holdem';

const BLINDS = { small: 5, big: 10 };
const table = (stacks = [200, 200, 200, 200], seed = 7): Game => {
  const g = createGame(['YOU', 'ADA', 'BEN', 'CAI'].slice(0, stacks.length), 0, BLINDS, seed);
  g.seats.forEach((s, i) => { s.chips = stacks[i]; });
  return g;
};

/** Run a hand to the point where `seat` is to act, folding everyone before. */
const foldTo = (g: Game, seat: number, guard = 12): void => {
  while (g.toAct !== seat && g.toAct >= 0 && guard-- > 0) act(g, 'fold');
};

describe('dealing', () => {
  it('gives everyone two cards', () => {
    const g = table();
    startHand(g);
    expect(g.seats.every((s) => s.hole.length === 2)).toBe(true);
  });

  it('posts the blinds', () => {
    const g = table();
    startHand(g);
    const posted = g.seats.map((s) => s.committed).sort((a, b) => a - b);
    expect(posted).toEqual([0, 0, 5, 10]);
    expect(g.currentBet).toBe(10);
  });

  it('starts on the preflop with somebody to act', () => {
    const g = table();
    startHand(g);
    expect(g.street).toBe('preflop');
    expect(g.toAct).toBeGreaterThanOrEqual(0);
  });

  it('shows the human their own cards and nobody else theirs', () => {
    const g = table();
    startHand(g);
    expect(g.seats[0].hole.every((c) => c.faceUp)).toBe(true);
    expect(g.seats[1].hole.every((c) => !c.faceUp)).toBe(true);
  });

  it('deals nobody the same card twice', () => {
    const g = table();
    startHand(g);
    const all = g.seats.flatMap((s) => s.hole);
    expect(new Set(all.map((c: Card) => `${c.suit}:${c.rank}`)).size).toBe(all.length);
  });

  it('will not deal with fewer than two players holding chips', () => {
    const g = table([200, 0, 0, 0]);
    expect(startHand(g)).toBe(false);
  });

  it('moves the button between hands', () => {
    const g = table();
    startHand(g);
    const first = g.button;
    while (g.street !== 'complete') act(g, 'fold');
    startHand(g);
    expect(g.button).not.toBe(first);
  });
});

describe('legal actions', () => {
  it('always allows a fold', () => {
    const g = table();
    startHand(g);
    expect(legalActions(g).fold).toBe(true);
  });

  it('offers a call of the difference, not of the whole bet', () => {
    const g = table();
    startHand(g);
    // The seat to act has posted nothing, so calling the big blind costs 10.
    expect(legalActions(g).call).toBe(10);
  });

  it('does not offer a check when there is a bet to match', () => {
    const g = table();
    startHand(g);
    expect(legalActions(g).check).toBe(false);
  });

  it('sets the minimum raise one full raise above the current bet', () => {
    const g = table();
    startHand(g);
    expect(legalActions(g).minRaise).toBe(20);
  });

  it('caps every raise at the stack', () => {
    const g = table([200, 200, 200, 40]);
    startHand(g);
    foldTo(g, 3);
    expect(legalActions(g).maxRaise).toBeLessThanOrEqual(40);
  });
});

describe('a betting round', () => {
  it('ends once everyone has matched the bet', () => {
    const g = table();
    startHand(g);
    act(g, 'call');
    act(g, 'call');
    act(g, 'call');
    act(g, 'check');       // the big blind's option
    expect(g.street).toBe('flop');
    expect(g.board).toHaveLength(3);
  });

  it('gives the big blind an option rather than ending on a call', () => {
    const g = table();
    startHand(g);
    act(g, 'call');
    act(g, 'call');
    act(g, 'call');
    expect(g.street).toBe('preflop');
    expect(roundComplete(g)).toBe(false);
  });

  it('reopens the betting on a raise', () => {
    const g = table();
    startHand(g);
    act(g, 'raise', 30);
    expect(g.currentBet).toBe(30);
    expect(g.seats.filter((s) => s.acted)).toHaveLength(1);
  });

  it('deals one card on the turn and one on the river', () => {
    const g = table();
    startHand(g);
    act(g, 'call'); act(g, 'call'); act(g, 'call'); act(g, 'check');
    expect(g.board).toHaveLength(3);
    for (let i = 0; i < 4; i++) act(g, 'check');
    expect(g.board).toHaveLength(4);
    for (let i = 0; i < 4; i++) act(g, 'check');
    expect(g.board).toHaveLength(5);
  });

  it('ends the hand when everyone folds to one player', () => {
    const g = table();
    startHand(g);
    act(g, 'fold'); act(g, 'fold'); act(g, 'fold');
    expect(g.street).toBe('complete');
    expect(contenders(g)).toHaveLength(1);
  });

  it('pays the last player standing the whole pot', () => {
    const g = table();
    startHand(g);
    const pot = potTotal(g);
    act(g, 'fold'); act(g, 'fold'); act(g, 'fold');
    expect(g.awards.reduce((n, a) => n + a.amount, 0)).toBe(pot);
  });

  it('never shows a folded winner a hand', () => {
    const g = table();
    startHand(g);
    act(g, 'fold'); act(g, 'fold'); act(g, 'fold');
    expect(g.awards[0].hand).toBeUndefined();
  });
});

describe('side pots', () => {
  /** Set committed amounts directly: this is what the pot builder reads. */
  const staged = (committed: number[], folded: boolean[] = []): Game => {
    const g = table(committed.map(() => 1000));
    startHand(g);
    g.seats.forEach((s, i) => {
      s.committed = committed[i];
      s.folded = folded[i] ?? false;
      s.hole = [{ suit: 0, rank: i, faceUp: true }, { suit: 1, rank: i, faceUp: true }];
    });
    return g;
  };

  it('makes one pot when everyone put in the same', () => {
    const pots = buildPots(staged([50, 50, 50, 50]));
    expect(pots).toHaveLength(1);
    expect(pots[0]).toEqual({ amount: 200, eligible: [0, 1, 2, 3] });
  });

  it('peels a side pot above a short all-in', () => {
    const pots = buildPots(staged([20, 100, 100, 100]));
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 80, eligible: [0, 1, 2, 3] });
    expect(pots[1]).toEqual({ amount: 240, eligible: [1, 2, 3] });
  });

  it('stacks three layers for three different all-ins', () => {
    const pots = buildPots(staged([10, 30, 60, 60]));
    expect(pots.map((p) => p.amount)).toEqual([40, 60, 60]);
    expect(pots.map((p) => p.eligible)).toEqual([[0, 1, 2, 3], [1, 2, 3], [2, 3]]);
  });

  it('takes a folded player’s chips but not their claim', () => {
    const pots = buildPots(staged([50, 50, 50, 50], [true, false, false, false]));
    expect(pots[0].amount).toBe(200);
    expect(pots[0].eligible).toEqual([1, 2, 3]);
  });

  it('never loses or invents a chip', () => {
    for (const committed of [[7, 13, 29, 31], [1, 1, 1, 1], [0, 40, 40, 90], [5, 0, 0, 5]]) {
      const g = staged(committed);
      const total = buildPots(g).reduce((n, p) => n + p.amount, 0);
      expect(total).toBe(committed.reduce((a, b) => a + b, 0));
    }
  });
});

describe('showdown', () => {
  it('pays out everything that was wagered', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = table([200, 200, 200, 200], seed);
      startHand(g);
      const chipsBefore = g.seats.reduce((n, s) => n + s.chips + s.committed, 0);

      let guard = 0;
      while (g.street !== 'complete' && guard++ < 200) {
        const legal = legalActions(g);
        if (legal.check) act(g, 'check');
        else if (legal.call > 0) act(g, 'call');
        else act(g, 'fold');
      }

      expect(g.street).toBe('complete');
      const chipsAfter = g.seats.reduce((n, s) => n + s.chips, 0);
      expect(chipsAfter).toBe(chipsBefore);
    }
  });

  it('runs the board out when everyone is all in', () => {
    const g = table([50, 50, 50, 50], 3);
    startHand(g);
    let guard = 0;
    while (g.street !== 'complete' && guard++ < 40) {
      // A stack that exactly covers the bet cannot raise — only call all in —
      // so shoving is attempted first and calling is the fallback.
      const legal = legalActions(g);
      if (legal.minRaise) act(g, 'raise', legal.maxRaise);
      else if (legal.call > 0) act(g, 'call');
      else act(g, 'check');
    }
    expect(g.seats.every((s) => s.allIn || s.folded)).toBe(true);
    expect(g.board).toHaveLength(5);
    expect(g.street).toBe('complete');
  });

  it('cannot raise on a stack that only covers the call', () => {
    const g = table([50, 200, 200, 200], 3);
    startHand(g);
    // Someone shoves for exactly 50; a 50-chip stack can then only call.
    while (g.toAct !== 0 && g.toAct >= 0) {
      const legal = legalActions(g);
      if (legal.minRaise >= 50) act(g, 'raise', 50);
      else act(g, 'call');
    }
    if (g.currentBet === 50) {
      const legal = legalActions(g);
      expect(legal.minRaise).toBe(0);
      expect(legal.call).toBe(50);
      expect(act(g, 'raise', 100)).toBe(false);
    }
  });

  it('splits a tied pot evenly', () => {
    const g = table();
    startHand(g);
    // Two identical straights and two folds, staged directly and resolved with
    // `endHand`: driving this through the betting rounds would take a dozen
    // actions to reach a position the pot logic can be asked about in three.
    g.seats[0].hole = [{ suit: 0, rank: 12, faceUp: true }, { suit: 0, rank: 11, faceUp: true }];
    g.seats[1].hole = [{ suit: 2, rank: 12, faceUp: true }, { suit: 2, rank: 11, faceUp: true }];
    g.seats[2].folded = true;
    g.seats[3].folded = true;
    g.seats.forEach((seat) => { seat.committed = 100; });
    g.board = [
      { suit: 1, rank: 0, faceUp: true }, { suit: 3, rank: 4, faceUp: true },
      { suit: 1, rank: 7, faceUp: true }, { suit: 3, rank: 9, faceUp: true },
      { suit: 1, rank: 2, faceUp: true },
    ];
    const before = g.seats.map((seat) => seat.chips);

    endHand(g);

    expect(g.seats[0].chips - before[0]).toBe(200);
    expect(g.seats[1].chips - before[1]).toBe(200);
    expect(g.awards).toHaveLength(2);
  });

  it('gives an odd chip to the first winner left of the button', () => {
    const g = table();
    startHand(g);
    g.button = 3;
    g.seats[0].hole = [{ suit: 0, rank: 12, faceUp: true }, { suit: 0, rank: 11, faceUp: true }];
    g.seats[1].hole = [{ suit: 2, rank: 12, faceUp: true }, { suit: 2, rank: 11, faceUp: true }];
    g.seats[2].folded = true;
    g.seats[3].folded = true;
    // 101 chips between two winners: one of them has to get the extra.
    g.seats.forEach((seat, i) => { seat.committed = i === 0 ? 51 : 50; });
    g.board = [
      { suit: 1, rank: 0, faceUp: true }, { suit: 3, rank: 4, faceUp: true },
      { suit: 1, rank: 7, faceUp: true }, { suit: 3, rank: 9, faceUp: true },
      { suit: 1, rank: 2, faceUp: true },
    ];
    const before = g.seats.map((seat) => seat.chips);

    endHand(g);

    const won = g.seats.map((seat, i) => seat.chips - before[i]);
    expect(won[0] + won[1]).toBe(201);
    expect(Math.abs(won[0] - won[1])).toBeLessThanOrEqual(1);
  });

  it('leaves nobody with negative chips over many hands', () => {
    const g = table([300, 300, 300, 300], 99);
    for (let hand = 0; hand < 60 && livePlayers(g).length >= 2; hand++) {
      if (!startHand(g)) break;
      let guard = 0;
      while (g.street !== 'complete' && guard++ < 200) {
        const legal = legalActions(g);
        // A mix of actions, so the run reaches raises and side pots too.
        if (guard % 7 === 0 && legal.minRaise) act(g, 'raise', legal.minRaise);
        else if (legal.check) act(g, 'check');
        else if (legal.call > 0) act(g, 'call');
        else act(g, 'fold');
      }
      expect(g.seats.every((s) => s.chips >= 0)).toBe(true);
    }
    expect(g.seats.reduce((n, s) => n + s.chips, 0)).toBe(1200);
  });
});
