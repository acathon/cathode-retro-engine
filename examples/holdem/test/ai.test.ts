import { makeRng, type Card } from '@cathode/cards';
import { describe, expect, it } from 'vitest';
import { PERSONALITIES, chenScore, decide, play, strength } from '../src/ai';
import {
  type Game,
  act, createGame, legalActions, potTotal, startHand,
} from '../src/holdem';

const SUIT: Record<string, number> = { S: 0, D: 1, C: 2, H: 3 };
const RANK: Record<string, number> = {
  A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8,
  T: 9, J: 10, Q: 11, K: 12,
};
const card = (s: string): Card => ({
  rank: RANK[s.slice(0, -1)], suit: SUIT[s.slice(-1)], faceUp: true,
});
const cards = (...names: string[]): Card[] => names.map(card);

const [ADA, BEN, CAI] = PERSONALITIES;

describe('chenScore', () => {
  it('rates pocket aces highest', () => {
    expect(chenScore(cards('AS', 'AD'))).toBe(20);
  });

  it('rates seven-deuce offsuit near the bottom', () => {
    expect(chenScore(cards('7S', '2D'))).toBeLessThan(4);
  });

  it('prefers suited to offsuit', () => {
    expect(chenScore(cards('AS', 'KS'))).toBeGreaterThan(chenScore(cards('AS', 'KD')));
  });

  it('prefers connected to gapped', () => {
    expect(chenScore(cards('9S', '8D'))).toBeGreaterThan(chenScore(cards('9S', '4D')));
  });

  it('doubles a pair', () => {
    expect(chenScore(cards('KS', 'KD'))).toBe(16);
  });

  it('never goes below zero', () => {
    expect(chenScore(cards('3S', '2D'))).toBeGreaterThanOrEqual(0);
  });
});

describe('strength', () => {
  it('rates a made flush above a pair', () => {
    const board = cards('2S', '7S', 'TS', '3D', '4C');
    expect(strength(cards('AS', 'KS'), board))
      .toBeGreaterThan(strength(cards('AD', 'AC'), cards('2S', '7H', 'TD', '3D', '4C')));
  });

  it('discounts a hand that is only the board', () => {
    // The board is a straight; the hole cards add nothing.
    const board = cards('5S', '6D', '7C', '8H', '9S');
    const playingBoard = strength(cards('2S', '3D'), board);
    const withHole = strength(cards('TD', '2C'), board);
    expect(withHole).toBeGreaterThan(playingBoard);
  });

  it('pays for a flush draw while cards are still to come', () => {
    const withDraw = strength(cards('AS', 'KS'), cards('2S', '7S', 'TD'));
    const without = strength(cards('AS', 'KD'), cards('2S', '7H', 'TD'));
    expect(withDraw).toBeGreaterThan(without);
  });

  it('stops paying for a draw on the river', () => {
    const four = cards('2S', '7S', 'TD', '3H', '4C');
    expect(strength(cards('AS', 'KS'), four)).toBeLessThan(0.35);
  });

  it('stays inside zero and one', () => {
    const rand = makeRng(5);
    for (let i = 0; i < 200; i++) {
      const board = cards('2S', '7H', 'TD', '3C', '4S');
      const v = strength([card('AS'), card('KD')], board.slice(0, (i % 4) + 2));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      rand();
    }
  });
});

/**
 * A table with one seat's cards, the board, the bet to call and the pot all
 * forced. The pot matters: pot odds are the other half of every decision, and
 * a position with only the blinds in it makes every bet look enormous.
 */
function position(hole: Card[], board: Card[], currentBet: number, pot = 100): Game {
  const g = createGame(['YOU', 'ADA', 'BEN', 'CAI'], 800, { small: 5, big: 10 }, 11);
  startHand(g);
  g.board = board;
  g.street = board.length ? 'flop' : 'preflop';
  g.seats.forEach((s) => { s.bet = 0; s.acted = false; s.committed = pot / 4; });
  g.seats[1].hole = hole;
  g.currentBet = currentBet;
  g.lastRaise = 10;
  g.toAct = 1;
  return g;
}

describe('decisions', () => {
  it('folds trash to a large bet', () => {
    const g = position(cards('7S', '2D'), cards('AS', 'KH', 'QC'), 200);
    for (const who of PERSONALITIES) {
      expect(decide(g, 1, who, makeRng(1)).action).toBe('fold');
    }
  });

  it('does not fold the nuts', () => {
    const g = position(cards('AS', 'KS'), cards('QS', 'JS', 'TS'), 100);
    for (const who of PERSONALITIES) {
      expect(decide(g, 1, who, makeRng(3)).action).not.toBe('fold');
    }
  });

  it('checks a weak hand rather than betting it, when checking is free', () => {
    const g = position(cards('7S', '2D'), cards('AS', 'KH', 'QC'), 0);
    // The rock has almost no bluff in it, so this is a check every time.
    expect(decide(g, 1, ADA, makeRng(9)).action).toBe('check');
  });

  it('raises more often the more aggressive the seat', () => {
    const count = (who: typeof ADA): number => {
      let raises = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const g = position(cards('AS', 'AD'), cards('AH', 'KH', 'QC'), 0);
        if (decide(g, 1, who, makeRng(seed)).action === 'raise') raises++;
      }
      return raises;
    };
    expect(count(CAI)).toBeGreaterThan(count(BEN));
    expect(count(ADA)).toBeGreaterThan(count(BEN));
  });

  it('calls wider the looser the seat', () => {
    // Swept across bet sizes rather than asked at one: a single position is
    // usually a fold for everybody or a call for everybody, and the
    // difference between a rock and a maniac lives in the band between.
    const HANDS = [['9S', '9D'], ['7S', '2D'], ['AS', 'KS'], ['QS', 'JS'], ['JS', 'TD']];
    const BETS = [10, 20, 30, 45, 60, 90, 120];

    const continues = (who: typeof ADA): number => {
      let n = 0;
      for (const hole of HANDS) {
        for (const bet of BETS) {
          for (let seed = 1; seed <= 20; seed++) {
            const g = position(cards(...hole), cards('AS', 'KH', '2C'), bet);
            if (decide(g, 1, who, makeRng(seed)).action !== 'fold') n++;
          }
        }
      }
      return n;
    };

    const loose = continues(CAI);
    const tight = continues(ADA);
    const total = HANDS.length * BETS.length * 20;
    expect(loose).toBeGreaterThan(tight);
    // Neither extreme: a bot that folds everything or plays everything is not
    // a personality, it is a bug.
    expect(tight).toBeGreaterThan(total * 0.05);
    expect(loose).toBeLessThan(total * 0.95);
  });

  it('never lays down three of a kind or better', () => {
    // Trips on this board, against a bet far larger than the pot.
    const g = position(cards('2S', '2D'), cards('2H', 'KH', '7C'), 900);
    for (const who of PERSONALITIES) {
      for (let seed = 1; seed <= 30; seed++) {
        expect(decide(g, 1, who, makeRng(seed)).action).not.toBe('fold');
      }
    }
  });

  it('never asks to raise beyond its stack', () => {
    const g = position(cards('AS', 'AD'), cards('AH', 'KH', 'QC'), 0);
    for (let seed = 1; seed <= 200; seed++) {
      const d = decide(g, 1, CAI, makeRng(seed));
      if (d.action === 'raise') {
        expect(d.amount).toBeLessThanOrEqual(legalActions(g).maxRaise);
        expect(d.amount).toBeGreaterThanOrEqual(legalActions(g).minRaise);
      }
    }
  });
});

describe('bots at a table', () => {
  it('plays hand after hand without stalling or losing chips', () => {
    const g = createGame(['YOU', 'ADA', 'BEN', 'CAI'], 400, { small: 5, big: 10 }, 2718);
    const rand = makeRng(31415);
    const seatOf = (i: number) => PERSONALITIES[(i - 1 + PERSONALITIES.length) % PERSONALITIES.length];
    const bank = 1600;

    let hands = 0;
    for (let n = 0; n < 80; n++) {
      if (!startHand(g)) break;
      hands++;
      let guard = 0;
      while (g.street !== 'complete' && guard++ < 400) {
        const seat = g.toAct;
        if (seat < 0) break;
        const ok = play(g, seat, seatOf(seat), rand,
          (action, amount) => act(g, action, amount));
        expect(ok).toBe(true);
      }
      expect(g.street).toBe('complete');
      // Chips are conserved: the table neither prints nor burns them.
      expect(g.seats.reduce((t, s) => t + s.chips, 0)).toBe(bank);
      expect(g.seats.every((s) => s.chips >= 0)).toBe(true);
    }
    expect(hands).toBeGreaterThan(20);
  });

  it('does not always end in a fold-out — real hands reach a showdown', () => {
    const g = createGame(['YOU', 'ADA', 'BEN', 'CAI'], 400, { small: 5, big: 10 }, 555);
    const rand = makeRng(777);
    const seatOf = (i: number) => PERSONALITIES[(i - 1 + PERSONALITIES.length) % PERSONALITIES.length];
    let showdowns = 0;
    let flops = 0;

    for (let n = 0; n < 60 && startHand(g); n++) {
      let guard = 0;
      while (g.street !== 'complete' && guard++ < 400) {
        if (g.toAct < 0) break;
        play(g, g.toAct, seatOf(g.toAct), rand, (a, amt) => act(g, a, amt));
      }
      if (g.board.length >= 3) flops++;
      if (g.awards.some((a) => a.hand)) showdowns++;
      if (g.seats.filter((s) => s.chips > 0).length < 2) break;
    }
    expect(flops).toBeGreaterThan(5);
    expect(showdowns).toBeGreaterThan(3);
  });

  it('pays the pot to somebody every single hand', () => {
    const g = createGame(['YOU', 'ADA', 'BEN', 'CAI'], 600, { small: 5, big: 10 }, 8080);
    const rand = makeRng(9090);
    const seatOf = (i: number) => PERSONALITIES[(i - 1 + PERSONALITIES.length) % PERSONALITIES.length];

    for (let n = 0; n < 50 && startHand(g); n++) {
      let guard = 0;
      while (g.street !== 'complete' && guard++ < 400) {
        if (g.toAct < 0) break;
        play(g, g.toAct, seatOf(g.toAct), rand, (a, amt) => act(g, a, amt));
      }
      // `potTotal` is zero once the hand is paid out, so the pot to compare
      // against is the breakdown the payout was computed from.
      const awarded = g.awards.reduce((t, a) => t + a.amount, 0);
      expect(awarded).toBe(g.pots.reduce((t, p) => t + p.amount, 0));
      expect(potTotal(g)).toBe(0);
      if (g.seats.filter((s) => s.chips > 0).length < 2) break;
    }
  });
});
