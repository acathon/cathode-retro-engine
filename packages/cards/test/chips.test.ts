import { describe, expect, it } from 'vitest';
import { Bankroll, chipStack, memoryStore } from '../src/chips';

describe('chipStack', () => {
  it('uses the fewest chips, largest first', () => {
    expect(chipStack(630)).toEqual([500, 100, 25, 5]);
  });

  it('is empty for nothing', () => {
    expect(chipStack(0)).toEqual([]);
    expect(chipStack(-5)).toEqual([]);
  });

  it('always adds back up to the amount', () => {
    for (const n of [1, 7, 39, 144, 999, 2500]) {
      expect(chipStack(n).reduce((a, b) => a + b, 0)).toBe(n);
    }
  });
});

describe('Bankroll', () => {
  it('starts on the opening stack', () => {
    expect(new Bankroll(500).chips).toBe(500);
  });

  it('moves a wager out of the stack and onto the table', () => {
    const b = new Bankroll(100);
    expect(b.wager(30)).toBe(30);
    expect(b.chips).toBe(70);
    expect(b.atStake).toBe(30);
    expect(b.total).toBe(100);
  });

  it('clamps an oversized wager to going all in', () => {
    const b = new Bankroll(40);
    expect(b.wager(100)).toBe(40);
    expect(b.chips).toBe(0);
    expect(b.atStake).toBe(40);
  });

  it('pays a loss as nothing back', () => {
    const b = new Bankroll(100);
    b.wager(25);
    b.settle(0);
    expect(b.chips).toBe(75);
    expect(b.atStake).toBe(0);
  });

  it('pays a push as the stake back', () => {
    const b = new Bankroll(100);
    b.wager(25);
    b.settle(25);
    expect(b.chips).toBe(100);
  });

  it('pays even money as twice the stake', () => {
    const b = new Bankroll(100);
    b.wager(25);
    b.settle(50);
    expect(b.chips).toBe(125);
  });

  it('gives back an unresolved wager', () => {
    const b = new Bankroll(100);
    b.wager(60);
    b.refund(60);
    expect(b.chips).toBe(100);
    expect(b.atStake).toBe(0);
  });

  it('will not refund more than is on the table', () => {
    const b = new Bankroll(100);
    b.wager(10);
    b.refund(999);
    expect(b.chips).toBe(100);
    expect(b.atStake).toBe(0);
  });

  it('counts chips on the table when asking if the player is broke', () => {
    const b = new Bankroll(10);
    b.wager(10);
    expect(b.chips).toBe(0);
    expect(b.broke(5)).toBe(false);   // still 10 at stake
    b.settle(0);
    expect(b.broke(5)).toBe(true);
  });

  it('remembers a balance across instances', () => {
    const store = memoryStore();
    const first = new Bankroll(200, store);
    first.wager(50);
    first.settle(0);
    expect(new Bankroll(200, store).chips).toBe(150);
  });

  it('ignores a corrupt saved balance', () => {
    const store = { load: () => Number.NaN, save: () => {} };
    expect(new Bankroll(200, store).chips).toBe(200);
  });

  it('resets to the opening stack', () => {
    const b = new Bankroll(200);
    b.wager(150);
    b.settle(0);
    b.reset();
    expect(b.chips).toBe(200);
  });
});
