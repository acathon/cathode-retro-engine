import type { Card } from '@cathode/cards';
import { describe, expect, it } from 'vitest';
import { bestDiscard, shouldKnock, takeTurn, upcardGain } from '../src/bot';
import { deadwoodOf } from '../src/melds';
import {
  HAND_SIZE, KNOCK_LIMIT, TARGET_SCORE, type Game,
  canKnock, createGame, deal, discard, drawFromDiscard, drawFromStock, knock,
  newDeal, other, stockExhausted, upcard,
} from '../src/rummy';

const SUIT: Record<string, number> = { S: 0, D: 1, C: 2, H: 3 };
const RANK: Record<string, number> = {
  A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8,
  T: 9, J: 10, Q: 11, K: 12,
};
const card = (s: string): Card => ({
  rank: RANK[s.slice(0, -1)], suit: SUIT[s.slice(-1)], faceUp: true,
});
const hand = (...names: string[]): Card[] => names.map(card);

const dealt = (seed = 5): Game => {
  const g = createGame(seed);
  deal(g);
  return g;
};

describe('the deal', () => {
  it('gives both players ten cards', () => {
    const g = dealt();
    expect(g.hands.you).toHaveLength(HAND_SIZE);
    expect(g.hands.them).toHaveLength(HAND_SIZE);
  });

  it('turns one card face up', () => {
    const g = dealt();
    expect(g.discard).toHaveLength(1);
    expect(upcard(g)!.faceUp).toBe(true);
  });

  it('leaves the rest as stock', () => {
    const g = dealt();
    expect(g.stock).toHaveLength(52 - HAND_SIZE * 2 - 1);
  });

  it('shows you your cards and hides theirs', () => {
    const g = dealt();
    expect(g.hands.you.every((c) => c.faceUp)).toBe(true);
    expect(g.hands.them.every((c) => !c.faceUp)).toBe(true);
  });

  it('deals no card twice', () => {
    const g = dealt();
    const all = [...g.hands.you, ...g.hands.them, ...g.stock, ...g.discard];
    expect(new Set(all.map((c) => `${c.suit}:${c.rank}`)).size).toBe(52);
  });

  it('starts on a draw', () => {
    expect(dealt().phase).toBe('draw');
  });
});

describe('drawing and discarding', () => {
  it('takes a card from the stock', () => {
    const g = dealt();
    const before = g.stock.length;
    drawFromStock(g);
    expect(g.hands.you).toHaveLength(11);
    expect(g.stock).toHaveLength(before - 1);
    expect(g.phase).toBe('discard');
  });

  it('takes the upcard instead', () => {
    const g = dealt();
    const up = upcard(g)!;
    drawFromDiscard(g);
    expect(g.hands.you).toContain(up);
    expect(g.discard).toHaveLength(0);
  });

  it('will not draw twice in a turn', () => {
    const g = dealt();
    drawFromStock(g);
    expect(drawFromStock(g)).toBeNull();
  });

  it('will not discard before drawing', () => {
    const g = dealt();
    expect(discard(g, g.hands.you[0])).toBe(false);
  });

  it('will not discard a card that is not in hand', () => {
    const g = dealt();
    drawFromStock(g);
    expect(discard(g, card('AS'))).toBe(false);
  });

  it('passes the turn on a discard', () => {
    const g = dealt();
    drawFromStock(g);
    discard(g, g.hands.you[0]);
    expect(g.turn).toBe('them');
    expect(g.phase).toBe('draw');
  });

  it('puts the discarded card on top of the pile face up', () => {
    const g = dealt();
    drawFromStock(g);
    const thrown = g.hands.you[3];
    discard(g, thrown);
    expect(upcard(g)).toBe(thrown);
    expect(thrown.faceUp).toBe(true);
  });
});

/** Force an exact position: both hands, and enough stock to keep playing. */
function staged(you: Card[], them: Card[], stock = 20): Game {
  const g = createGame(1);
  deal(g);
  g.hands.you = you;
  g.hands.them = them;
  g.stock = g.stock.slice(0, stock);
  g.turn = 'you';
  g.phase = 'discard';
  return g;
}

describe('knocking', () => {
  // Three sets and a run leaves one card: a legal knock with 2 points.
  const thin = () => hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', '2S', 'KH');

  it('is legal at ten or less', () => {
    const g = staged(thin(), hand('AS', '3D', '5C', '9H', 'TS', 'QD', 'KC', '2H', '4S', '6D'));
    expect(canKnock(g, card('KH'))).toBe(false);      // not in hand
    expect(canKnock(g, g.hands.you[10])).toBe(true);  // throw the king, keep the 2
  });

  it('is not legal above ten', () => {
    const g = staged(
      hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3H', '5S', '9D', 'KH'),
      hand('AS', '3D', '5C', '9H', 'TS', 'QD', 'KC', '2H', '4S', '6D'),
    );
    expect(canKnock(g, g.hands.you[10])).toBe(false);
  });

  it('scores the difference in deadwood', () => {
    const g = staged(thin(), hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3H', '5S', '9D'));
    const defender = deadwoodOf(g.hands.them);
    const r = knock(g, g.hands.you[10])!;
    expect(r.ending).toBe('knock');
    expect(r.winner).toBe('you');
    expect(r.knockerDeadwood).toBe(2);
    expect(r.points).toBe(r.defenderDeadwood - 2);
    expect(r.defenderDeadwood).toBeLessThanOrEqual(defender);
  });

  it('pays a gin bonus for melding everything', () => {
    const gin = hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', 'AS', 'KH');
    // Ten of those meld; throwing the king leaves the ace, so throw the ace.
    const perfect = hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '3H', '4H', '5H', '6H', 'KH');
    const g = staged(perfect, hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3S', '5D', '9C'));
    const r = knock(g, g.hands.you[10])!;
    expect(r.ending).toBe('gin');
    expect(r.knockerDeadwood).toBe(0);
    expect(r.points).toBe(r.defenderDeadwood + 25);
    expect(gin).toHaveLength(11);
  });

  it('lets the defender lay off onto the knocker’s melds', () => {
    const knocker = hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', '2S', 'KH');
    // The defender holds the fourth seven and the seven of hearts run-end.
    const defender = hand('7H', '3H', 'KD', 'QC', '9S', '8D', 'TC', '5C', '4C', '2D');
    const g = staged(knocker, defender);
    const r = knock(g, g.hands.you[10])!;
    expect(r.laidOff.length).toBeGreaterThan(0);
  });

  it('cannot be laid off against a gin hand', () => {
    const perfect = hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '3H', '4H', '5H', '6H', 'KH');
    const defender = hand('7H', 'JH', '2H', 'QC', '9S', '8D', 'TC', '5C', '4C', '2D');
    const g = staged(perfect, defender);
    const r = knock(g, g.hands.you[10])!;
    expect(r.ending).toBe('gin');
    expect(r.laidOff).toHaveLength(0);
  });

  it('gives the hand to the defender on an undercut', () => {
    // The knocker throws with 10; the defender is holding less.
    const knocker = hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', 'TS', 'KH');
    const defender = hand('8S', '8D', '8C', 'QS', 'QD', 'QC', '2H', '3H', '4H', 'AS');
    const g = staged(knocker, defender);
    const r = knock(g, g.hands.you[10])!;
    expect(r.ending).toBe('undercut');
    expect(r.winner).toBe('them');
    expect(r.points).toBe(r.knockerDeadwood - r.defenderDeadwood + 25);
  });

  it('adds the points to the winner’s score', () => {
    const g = staged(
      hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', '2S', 'KH'),
      hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3H', '5S', '9D'),
    );
    const r = knock(g, g.hands.you[10])!;
    expect(g.scores[r.winner]).toBe(r.points);
    expect(g.phase).toBe(r.points >= TARGET_SCORE ? 'match-over' : 'over');
  });

  it('shows every card once the hand is over', () => {
    const g = staged(
      hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', '2S', 'KH'),
      hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3H', '5S', '9D'),
    );
    knock(g, g.hands.you[10]);
    expect([...g.hands.you, ...g.hands.them].every((c) => c.faceUp)).toBe(true);
  });
});

describe('the wall', () => {
  it('ends the hand when the stock runs down', () => {
    const g = staged(
      hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3H', '5S', '9D', 'KH'),
      hand('2H', '4S', '6D', '8C', 'TH', 'QS', 'AD', '3C', '5H', '9S'),
      2,
    );
    expect(stockExhausted(g)).toBe(true);
    discard(g, g.hands.you[10]);
    expect(g.result!.ending).toBe('wall');
    expect(g.result!.points).toBe(0);
  });

  it('scores nobody for a wall', () => {
    const g = staged(
      hand('2S', '4D', '6C', '8H', 'TS', 'QD', 'AC', '3H', '5S', '9D', 'KH'),
      hand('2H', '4S', '6D', '8C', 'TH', 'QS', 'AD', '3C', '5H', '9S'),
      2,
    );
    discard(g, g.hands.you[10]);
    expect(g.scores.you).toBe(0);
    expect(g.scores.them).toBe(0);
  });
});

describe('the bot', () => {
  it('takes an upcard that helps', () => {
    const h = hand('7S', '7D', '2C', '9H', 'TS', 'QD', 'AC', '3H', '5S', '9D');
    expect(upcardGain(h, card('7C'))).toBeGreaterThan(0);
  });

  it('leaves an upcard that does not', () => {
    const h = hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', 'AS');
    expect(upcardGain(h, card('KD'))).toBeLessThanOrEqual(0);
  });

  it('throws the card that leaves the least behind', () => {
    const h = hand('7S', '7D', '7C', 'JS', 'JD', 'JC', '4H', '5H', '6H', 'KH', 'AS');
    expect(bestDiscard(h).rank).toBe(RANK.K);
  });

  it('always knocks on gin', () => {
    expect(shouldKnock(0, 30)).toBe(true);
  });

  it('never knocks above the limit', () => {
    expect(shouldKnock(KNOCK_LIMIT + 1, 5)).toBe(false);
  });

  it('waits for a better hand early and takes what it can late', () => {
    expect(shouldKnock(9, 30)).toBe(false);
    expect(shouldKnock(9, 5)).toBe(true);
  });

  it('plays a whole turn without leaving the table mid-move', () => {
    const g = dealt();
    drawFromStock(g);
    discard(g, g.hands.you[0]);
    expect(g.turn).toBe('them');
    takeTurn(g);
    expect(g.hands.them).toHaveLength(HAND_SIZE);
    expect(g.turn === 'you' || g.phase === 'over' || g.phase === 'match-over').toBe(true);
  });
});

describe('a whole match', () => {
  it('plays to a hundred without stalling or losing a card', () => {
    const g = createGame(4242);
    deal(g);

    let turns = 0;
    while (g.phase !== 'match-over' && turns < 4000) {
      turns++;
      if (g.phase === 'over') { newDeal(g); continue; }

      if (g.turn === 'them') { takeTurn(g); continue; }

      // The player plays the same policy as the bot, which is enough to drive
      // a match and enough to prove the table never gets stuck.
      const up = upcard(g);
      if (g.phase === 'draw') {
        if (up && upcardGain(g.hands.you, up) > 0) drawFromDiscard(g);
        else if (!drawFromStock(g)) break;
      }
      if (g.phase !== 'discard') continue;
      const throwing = bestDiscard(g.hands.you);
      if (canKnock(g, throwing) && deadwoodOf(g.hands.you.filter((c) => c !== throwing)) <= 5) {
        knock(g, throwing);
      } else {
        discard(g, throwing);
      }

      // No card is ever lost or duplicated, at any point in the match.
      const all = [...g.hands.you, ...g.hands.them, ...g.stock, ...g.discard];
      expect(new Set(all.map((c) => `${c.suit}:${c.rank}`)).size).toBe(52);
    }

    expect(g.phase).toBe('match-over');
    expect(Math.max(g.scores.you, g.scores.them)).toBeGreaterThanOrEqual(TARGET_SCORE);
    expect(g.deals).toBeGreaterThan(1);
  });

  it('alternates who leads', () => {
    const g = createGame(9);
    deal(g, 'you');
    g.result = { ending: 'knock', winner: 'you', points: 10, knockerDeadwood: 0, defenderDeadwood: 10, laidOff: [] };
    newDeal(g);
    expect(g.turn).toBe('them');
  });

  it('resets the scores for a new match', () => {
    const g = createGame(9);
    deal(g);
    g.scores = { you: 100, them: 40 };
    g.phase = 'match-over';
    g.result = { ending: 'knock', winner: 'you', points: 10, knockerDeadwood: 0, defenderDeadwood: 10, laidOff: [] };
    newDeal(g);
    expect(g.scores).toEqual({ you: 0, them: 0 });
  });

  it('knows which player is the other one', () => {
    expect(other('you')).toBe('them');
    expect(other('them')).toBe('you');
  });
});
