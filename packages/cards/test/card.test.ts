import { describe, expect, it } from 'vitest';
import {
  DECK_SIZE, Shoe, blackjackValues, cardId, cardName, freshDeck, isRed,
  makeRng, pokerRank, shuffle,
} from '../src/card';

describe('deck', () => {
  it('has 52 distinct cards', () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map(cardId)).size).toBe(DECK_SIZE);
  });

  it('deals face down unless asked otherwise', () => {
    expect(freshDeck().every((c) => !c.faceUp)).toBe(true);
    expect(freshDeck(true).every((c) => c.faceUp)).toBe(true);
  });

  it('calls diamonds and hearts red', () => {
    expect([0, 1, 2, 3].map(isRed)).toEqual([false, true, false, true]);
  });

  it('names cards readably', () => {
    expect(cardName({ suit: 0, rank: 0, faceUp: true })).toBe('AS');
    expect(cardName({ suit: 3, rank: 9, faceUp: true })).toBe('10H');
    expect(cardName({ suit: 2, rank: 12, faceUp: true })).toBe('KC');
  });
});

describe('shuffle', () => {
  it('keeps every card', () => {
    const deck = freshDeck();
    const mixed = shuffle(deck, makeRng(7));
    expect(mixed).toHaveLength(DECK_SIZE);
    expect(new Set(mixed.map(cardId)).size).toBe(DECK_SIZE);
  });

  it('does not mutate its input', () => {
    const deck = freshDeck();
    const before = deck.map(cardId);
    shuffle(deck, makeRng(7));
    expect(deck.map(cardId)).toEqual(before);
  });

  it('is deterministic for a seed', () => {
    const a = shuffle(freshDeck(), makeRng(99)).map(cardId);
    const b = shuffle(freshDeck(), makeRng(99)).map(cardId);
    expect(a).toEqual(b);
  });

  it('gives different seeds different orders', () => {
    const a = shuffle(freshDeck(), makeRng(1)).map(cardId);
    const b = shuffle(freshDeck(), makeRng(2)).map(cardId);
    expect(a).not.toEqual(b);
  });
});

describe('ranking', () => {
  it('ranks aces high for poker and kings below them', () => {
    expect(pokerRank({ suit: 0, rank: 0, faceUp: true })).toBe(14);
    expect(pokerRank({ suit: 0, rank: 12, faceUp: true })).toBe(13);
    expect(pokerRank({ suit: 0, rank: 1, faceUp: true })).toBe(2);
  });

  it('gives an ace both blackjack values', () => {
    expect(blackjackValues({ suit: 0, rank: 0, faceUp: true })).toEqual([1, 11]);
  });

  it('counts every court card as ten', () => {
    for (const rank of [9, 10, 11, 12]) {
      expect(blackjackValues({ suit: 0, rank, faceUp: true })).toEqual([10]);
    }
  });

  it('counts pips at face value', () => {
    expect(blackjackValues({ suit: 0, rank: 6, faceUp: true })).toEqual([7]);
  });
});

describe('shoe', () => {
  it('holds as many cards as it has decks', () => {
    expect(new Shoe(1, 1).remaining).toBe(52);
    expect(new Shoe(1, 6).remaining).toBe(312);
  });

  it('counts down as it deals', () => {
    const shoe = new Shoe(3);
    shoe.drawMany(5);
    expect(shoe.remaining).toBe(47);
    expect(shoe.dealt).toBe(5);
  });

  it('reshuffles once it runs past its penetration', () => {
    const shoe = new Shoe(5, 1, 0.25);   // reshuffles with 13 left
    shoe.drawMany(39);
    expect(shoe.remaining).toBe(13);
    shoe.draw();
    // The refill happens before the draw, so 52 minus the one just taken.
    expect(shoe.remaining).toBe(51);
    expect(shoe.dealt).toBe(1);
  });

  it('never deals the same card twice within one pass', () => {
    const shoe = new Shoe(11, 1, 0);
    const ids = shoe.drawMany(52).map(cardId);
    expect(new Set(ids).size).toBe(52);
  });

  it('deals face up by default and face down on request', () => {
    const shoe = new Shoe(13);
    expect(shoe.draw().faceUp).toBe(true);
    expect(shoe.draw(false).faceUp).toBe(false);
  });
});
