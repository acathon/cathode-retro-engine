import type { Card } from '@cathode/cards';
import { describe, expect, it } from 'vitest';
import {
  HOUSE_RULES, type Hand, type Rules, type Table,
  canDouble, canSplit, createTable, dealerShouldHit, dealerStep, double,
  handValue, hit, insurancePayout, isBlackjack, isBust, isPair, nextRound,
  offersInsurance, resolveInsurance, roundPayout, settleHand, split, stand,
  startRound, total,
} from '../src/blackjack';

/** Rank shorthand: 0 = Ace, 9 = ten, 12 = King. */
const c = (rank: number, suit = 0): Card => ({ suit, rank, faceUp: true });
const A = c(0), TWO = c(1), THREE = c(2), FIVE = c(4), SIX = c(5), SEVEN = c(6);
const NINE = c(8), TEN = c(9), JACK = c(10), QUEEN = c(11), KING = c(12);

const hand = (cards: Card[], over: Partial<Hand> = {}): Hand => ({
  cards, bet: 10, doubled: false, stood: false, fromSplit: false, ...over,
});

describe('handValue', () => {
  it('adds pips at face value', () => {
    expect(handValue([TWO, THREE]).total).toBe(5);
  });

  it('counts every court card as ten', () => {
    expect(handValue([JACK, QUEEN]).total).toBe(20);
    expect(handValue([KING, TEN]).total).toBe(20);
  });

  it('counts a lone ace as eleven, and says so', () => {
    expect(handValue([A, SIX])).toEqual({ total: 17, soft: true });
  });

  it('drops the ace to one rather than bust', () => {
    expect(handValue([A, SIX, KING])).toEqual({ total: 17, soft: false });
  });

  it('counts only one of two aces as eleven', () => {
    expect(handValue([A, A])).toEqual({ total: 12, soft: true });
  });

  it('hardens both aces when it must', () => {
    expect(handValue([A, A, NINE, TEN])).toEqual({ total: 21, soft: false });
  });

  it('makes 21 from three aces and a court card is impossible to soften', () => {
    expect(handValue([A, A, A, KING])).toEqual({ total: 13, soft: false });
  });

  it('reports a bust', () => {
    expect(isBust([KING, QUEEN, TWO])).toBe(true);
    expect(isBust([KING, QUEEN])).toBe(false);
  });
});

describe('blackjack and pairs', () => {
  it('is an ace and a ten on the first two cards', () => {
    expect(isBlackjack(hand([A, KING]))).toBe(true);
  });

  it('is not 21 made from three cards', () => {
    expect(isBlackjack(hand([SEVEN, SEVEN, SEVEN]))).toBe(false);
  });

  it('is never a split hand, however it adds up', () => {
    expect(isBlackjack(hand([A, KING], { fromSplit: true }))).toBe(false);
  });

  it('pairs on rank, not on value', () => {
    expect(isPair(hand([SEVEN, c(6, 2)]))).toBe(true);
    expect(isPair(hand([KING, QUEEN]))).toBe(false);
  });
});

describe('dealer policy', () => {
  const s17: Rules = { ...HOUSE_RULES, dealerHitsSoft17: false };
  const h17: Rules = { ...HOUSE_RULES, dealerHitsSoft17: true };

  it('hits everything below seventeen', () => {
    expect(dealerShouldHit([TEN, SIX], s17)).toBe(true);
    expect(dealerShouldHit([TWO, THREE], s17)).toBe(true);
  });

  it('stands on a hard seventeen', () => {
    expect(dealerShouldHit([TEN, SEVEN], s17)).toBe(false);
    expect(dealerShouldHit([TEN, SEVEN], h17)).toBe(false);
  });

  it('splits on a soft seventeen, which is the whole S17/H17 difference', () => {
    expect(dealerShouldHit([A, SIX], s17)).toBe(false);
    expect(dealerShouldHit([A, SIX], h17)).toBe(true);
  });

  it('stands on a soft eighteen either way', () => {
    expect(dealerShouldHit([A, SEVEN], h17)).toBe(false);
  });
});

describe('payouts', () => {
  const r = HOUSE_RULES;

  it('pays a blackjack three to two', () => {
    expect(settleHand(hand([A, KING]), [TEN, SEVEN], r))
      .toEqual({ outcome: 'blackjack', payout: 25 });
  });

  it('pushes two blackjacks', () => {
    expect(settleHand(hand([A, KING]), [A, QUEEN], r))
      .toEqual({ outcome: 'push', payout: 10 });
  });

  it('pays a win even money', () => {
    expect(settleHand(hand([TEN, NINE]), [TEN, SEVEN], r))
      .toEqual({ outcome: 'win', payout: 20 });
  });

  it('pays nothing on a loss', () => {
    expect(settleHand(hand([TEN, SIX]), [TEN, SEVEN], r))
      .toEqual({ outcome: 'lose', payout: 0 });
  });

  it('pushes equal totals', () => {
    expect(settleHand(hand([TEN, SEVEN]), [NINE, c(7)], r))
      .toEqual({ outcome: 'push', payout: 10 });
  });

  it('pays every standing hand when the dealer busts', () => {
    expect(settleHand(hand([TWO, THREE]), [TEN, SIX, KING], r).outcome).toBe('win');
  });

  it('takes a bust hand even when the dealer busts too', () => {
    expect(settleHand(hand([KING, QUEEN, TWO]), [TEN, SIX, KING], r))
      .toEqual({ outcome: 'bust', payout: 0 });
  });

  it('beats a plain 21 with a natural', () => {
    expect(settleHand(hand([SEVEN, SEVEN, SEVEN]), [A, KING], r))
      .toEqual({ outcome: 'lose', payout: 0 });
  });

  it('doubles the stake on a doubled hand', () => {
    const doubled = hand([FIVE, SIX, KING], { bet: 20, doubled: true });
    expect(settleHand(doubled, [TEN, SEVEN], r)).toEqual({ outcome: 'win', payout: 40 });
  });

  it('honours a six-to-five table', () => {
    const cheap: Rules = { ...HOUSE_RULES, blackjackPays: 1.2 };
    expect(settleHand(hand([A, KING]), [TEN, SEVEN], cheap).payout).toBe(22);
  });
});

// --- The table as a state machine ------------------------------------------

/** Force a table into an exact position, bypassing the shoe. */
function staged(dealer: Card[], player: Card[], bet = 10): Table {
  const table = createTable(1);
  table.phase = 'player';
  table.dealer = dealer.map((x) => ({ ...x }));
  table.dealer[1].faceUp = false;
  table.hands = [hand(player.map((x) => ({ ...x })), { bet })];
  table.active = 0;
  return table;
}

describe('a round', () => {
  it('deals two to the player and two to the dealer', () => {
    const table = createTable(42);
    expect(startRound(table, 10)).toBe(true);
    expect(table.hands[0].cards).toHaveLength(2);
    expect(table.dealer).toHaveLength(2);
  });

  it('keeps the dealer hole card face down', () => {
    const table = createTable(42);
    startRound(table, 10);
    if (table.phase !== 'payout') expect(table.dealer[1].faceUp).toBe(false);
  });

  it('clamps a bet to the table limits', () => {
    const table = createTable(42);
    startRound(table, 1);
    expect(table.hands[0].bet).toBe(HOUSE_RULES.minBet);
    nextRound(table);
    startRound(table, 100000);
    expect(table.hands[0].bet).toBe(HOUSE_RULES.maxBet);
  });

  it('will not deal twice without a reset', () => {
    const table = createTable(42);
    startRound(table, 10);
    expect(startRound(table, 10)).toBe(false);
  });

  it('ends immediately on a dealer blackjack', () => {
    const table = staged([A, KING], [TEN, NINE]);
    table.phase = 'insurance';
    resolveInsurance(table, false);
    expect(table.phase).toBe('payout');
    expect(table.results[0].outcome).toBe('lose');
  });
});

describe('hitting and standing', () => {
  it('takes a card', () => {
    const table = staged([TEN, SEVEN], [TWO, THREE]);
    expect(hit(table)).toBe(true);
    expect(table.hands[0].cards).toHaveLength(3);
  });

  it('stops the hand once it busts', () => {
    const table = staged([TEN, SEVEN], [KING, QUEEN]);
    table.hands[0].cards.push(c(8));       // 29
    expect(hit(table)).toBe(false);
  });

  it('passes to the dealer on a stand', () => {
    const table = staged([TEN, SEVEN], [TEN, NINE]);
    stand(table);
    expect(table.phase).toBe('dealer');
    expect(table.dealer[1].faceUp).toBe(true);
  });

  it('skips the dealer entirely when every hand is bust', () => {
    const table = staged([TEN, SEVEN], [KING, QUEEN, TWO]);
    stand(table);
    expect(table.phase).toBe('payout');
    expect(table.dealer).toHaveLength(2);
  });

  it('draws for the dealer one card at a time', () => {
    const table = staged([TWO, THREE], [TEN, NINE]);
    stand(table);
    let steps = 0;
    while (dealerStep(table)) steps++;
    expect(steps).toBeGreaterThan(0);
    expect(table.phase).toBe('payout');
    expect(total(table.dealer)).toBeGreaterThanOrEqual(17);
  });
});

describe('doubling', () => {
  it('is offered on any two cards', () => {
    expect(canDouble(staged([TEN, SEVEN], [FIVE, SIX]))).toBe(true);
  });

  it('is gone once a third card is out', () => {
    const table = staged([TEN, SEVEN], [FIVE, SIX]);
    hit(table);
    expect(canDouble(table)).toBe(false);
  });

  it('doubles the bet and takes exactly one card', () => {
    const table = staged([TEN, SEVEN], [FIVE, SIX]);
    double(table);
    expect(table.hands[0].bet).toBe(20);
    expect(table.hands[0].cards).toHaveLength(3);
    expect(table.phase).toBe('dealer');
  });

  it('can be switched off after a split', () => {
    const table = staged([TEN, SEVEN], [FIVE, SIX]);
    table.hands[0].fromSplit = true;
    table.rules = { ...HOUSE_RULES, doubleAfterSplit: false };
    expect(canDouble(table)).toBe(false);
  });
});

describe('splitting', () => {
  it('is offered on a pair', () => {
    expect(canSplit(staged([TEN, SEVEN], [SEVEN, c(6, 1)]))).toBe(true);
    expect(canSplit(staged([TEN, SEVEN], [KING, QUEEN]))).toBe(false);
  });

  it('makes two hands of two cards', () => {
    const table = staged([TEN, SEVEN], [SEVEN, c(6, 1)]);
    split(table);
    expect(table.hands).toHaveLength(2);
    expect(table.hands[0].cards).toHaveLength(2);
    expect(table.hands[1].cards).toHaveLength(2);
    expect(table.hands[1].bet).toBe(table.hands[0].bet);
  });

  it('marks both hands as split, so neither can be a blackjack', () => {
    const table = staged([TEN, SEVEN], [A, c(0, 1)]);
    split(table);
    expect(table.hands.every((h) => h.fromSplit)).toBe(true);
  });

  it('gives split aces one card each and no more', () => {
    const table = staged([TEN, SEVEN], [A, c(0, 1)]);
    split(table);
    expect(table.hands.every((h) => h.stood)).toBe(true);
    expect(table.phase).toBe('dealer');
  });

  it('stops at the table limit', () => {
    const table = staged([TEN, SEVEN], [SEVEN, c(6, 1)]);
    table.splits = HOUSE_RULES.maxSplits;
    expect(canSplit(table)).toBe(false);
  });

  it('plays the hands one after another', () => {
    const table = staged([TEN, SEVEN], [SEVEN, c(6, 1)]);
    split(table);
    expect(table.active).toBe(0);
    stand(table);
    expect(table.active).toBe(1);
    expect(table.phase).toBe('player');
    stand(table);
    expect(table.phase).toBe('dealer');
  });
});

describe('insurance', () => {
  it('is offered only against an ace', () => {
    const table = staged([A, KING], [TEN, NINE]);
    table.phase = 'insurance';
    expect(offersInsurance(table)).toBe(true);

    const noAce = staged([TEN, KING], [TEN, NINE]);
    noAce.phase = 'insurance';
    expect(offersInsurance(noAce)).toBe(false);
  });

  it('costs half the bet', () => {
    const table = staged([A, KING], [TEN, NINE], 20);
    table.phase = 'insurance';
    resolveInsurance(table, true);
    expect(table.insurance).toBe(10);
  });

  it('pays two to one when the dealer has it', () => {
    const table = staged([A, KING], [TEN, NINE], 20);
    table.phase = 'insurance';
    resolveInsurance(table, true);
    expect(insurancePayout(table)).toBe(30);
    // 10 staked returns 30: the stake plus twice it.
    expect(roundPayout(table)).toBe(30);
  });

  it('pays nothing when the dealer does not', () => {
    const table = staged([A, NINE], [TEN, NINE], 20);
    table.phase = 'insurance';
    resolveInsurance(table, true);
    expect(insurancePayout(table)).toBe(0);
  });

  it('is free to decline', () => {
    const table = staged([A, NINE], [TEN, NINE]);
    table.phase = 'insurance';
    resolveInsurance(table, false);
    expect(table.insurance).toBe(0);
    expect(table.phase).toBe('player');
  });
});

describe('a full shoe', () => {
  it('never deals a card the rules cannot value', () => {
    const table = createTable(2024);
    for (let round = 0; round < 400; round++) {
      startRound(table, 10);
      let guard = 0;
      while (table.phase === 'insurance' && guard++ < 4) resolveInsurance(table, false);
      guard = 0;
      while (table.phase === 'player' && guard++ < 30) {
        if (total(table.hands[table.active].cards) < 17 && canDouble(table) === false) hit(table);
        else stand(table);
      }
      guard = 0;
      while (table.phase === 'dealer' && guard++ < 30) dealerStep(table);
      expect(table.phase).toBe('payout');
      expect(table.results).toHaveLength(table.hands.length);
      for (const r of table.results) expect(r.payout).toBeGreaterThanOrEqual(0);
      nextRound(table);
    }
  });
});
