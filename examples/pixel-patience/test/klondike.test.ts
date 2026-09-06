import { describe, expect, it } from 'vitest';
import {
  FOUNDATION_0, PILE_COUNT, STOCK, TABLEAU_0, WASTE,
  applyMove, autoFinishStep, canAutoFinish, canDrop, deal, drawFromStock,
  freshDeck, grab, isLegal, isRed, isWon, makeRng, runLength, shuffle,
  suggestDestination, top,
  type Card, type Game,
} from '../src/klondike';

const card = (suit: number, rank: number, faceUp = true): Card => ({ suit, rank, faceUp });

/** A game with empty piles, so a test can state exactly the position it means. */
function emptyGame(): Game {
  const g = deal(1);
  for (const pile of g.piles) pile.cards = [];
  g.moves = 0;
  return g;
}

describe('the deck', () => {
  it('holds 52 distinct cards', () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => `${c.suit}-${c.rank}`)).size).toBe(52);
  });

  it('shuffles without losing or duplicating a card', () => {
    const shuffled = shuffle(freshDeck(), makeRng(12345));
    expect(new Set(shuffled.map((c) => `${c.suit}-${c.rank}`)).size).toBe(52);
  });

  it('deals the same game for the same seed, and a different one otherwise', () => {
    const order = (g: Game) => g.piles.map((p) => p.cards.map((c) => `${c.suit}${c.rank}`).join()).join('|');
    expect(order(deal(7))).toBe(order(deal(7)));
    expect(order(deal(7))).not.toBe(order(deal(8)));
  });
});

describe('the deal', () => {
  const game = deal(42);

  it('gives column i exactly i+1 cards', () => {
    for (let col = 0; col < 7; col++) {
      expect(game.piles[TABLEAU_0 + col].cards).toHaveLength(col + 1);
    }
  });

  it('turns up only the last card of each column', () => {
    for (let col = 0; col < 7; col++) {
      const cards = game.piles[TABLEAU_0 + col].cards;
      expect(cards.filter((c) => c.faceUp)).toHaveLength(1);
      expect(cards[cards.length - 1].faceUp).toBe(true);
    }
  });

  it('leaves the remaining 24 cards face down in the stock', () => {
    expect(game.piles[STOCK].cards).toHaveLength(24);
    expect(game.piles[STOCK].cards.every((c) => !c.faceUp)).toBe(true);
    expect(game.piles[WASTE].cards).toHaveLength(0);
  });

  it('puts all 52 cards somewhere', () => {
    const total = game.piles.reduce((n, p) => n + p.cards.length, 0);
    expect(total).toBe(52);
  });
});

describe('dropping on a tableau', () => {
  it('accepts a card one lower and of the opposite colour', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 6)];              // 7 of spades (black)
    expect(canDrop(g.piles[TABLEAU_0], [card(3, 5)])).toBe(true);   // 6 of hearts (red)
    expect(canDrop(g.piles[TABLEAU_0], [card(1, 5)])).toBe(true);   // 6 of diamonds
  });

  it('refuses the same colour', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 6)];
    expect(canDrop(g.piles[TABLEAU_0], [card(2, 5)])).toBe(false);  // 6 of clubs
  });

  it('refuses the wrong rank', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 6)];
    expect(canDrop(g.piles[TABLEAU_0], [card(3, 4)])).toBe(false);
    expect(canDrop(g.piles[TABLEAU_0], [card(3, 6)])).toBe(false);
  });

  it('lets only a King into an empty column', () => {
    const g = emptyGame();
    expect(canDrop(g.piles[TABLEAU_0], [card(0, 12)])).toBe(true);
    expect(canDrop(g.piles[TABLEAU_0], [card(0, 11)])).toBe(false);
    expect(canDrop(g.piles[TABLEAU_0], [card(0, 0)])).toBe(false);
  });

  it('refuses to stack on a face-down card', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 6, false)];
    expect(canDrop(g.piles[TABLEAU_0], [card(3, 5)])).toBe(false);
  });
});

describe('dropping on a foundation', () => {
  it('starts with the Ace of its own suit and nothing else', () => {
    const g = emptyGame();
    const hearts = g.piles[FOUNDATION_0 + 3];
    expect(canDrop(hearts, [card(3, 0)])).toBe(true);
    expect(canDrop(hearts, [card(3, 1)])).toBe(false);
    expect(canDrop(hearts, [card(0, 0)])).toBe(false);
  });

  it('then climbs one rank at a time', () => {
    const g = emptyGame();
    const hearts = g.piles[FOUNDATION_0 + 3];
    hearts.cards = [card(3, 0), card(3, 1)];
    expect(canDrop(hearts, [card(3, 2)])).toBe(true);
    expect(canDrop(hearts, [card(3, 3)])).toBe(false);
  });

  it('never takes more than one card at a time', () => {
    const g = emptyGame();
    const hearts = g.piles[FOUNDATION_0 + 3];
    expect(canDrop(hearts, [card(3, 0), card(3, 1)])).toBe(false);
  });
});

describe('moveable runs', () => {
  it('counts a descending, alternating, face-up sequence', () => {
    const g = emptyGame();
    // 9♠ 8♥ 7♣ — all face up and alternating.
    g.piles[TABLEAU_0].cards = [card(0, 8), card(3, 7), card(2, 6)];
    expect(runLength(g.piles[TABLEAU_0])).toBe(3);
  });

  it('stops where the colours repeat', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 8), card(2, 7), card(3, 6)];
    expect(runLength(g.piles[TABLEAU_0])).toBe(2);
  });

  it('stops at a face-down card', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 8, false), card(3, 7), card(2, 6)];
    expect(runLength(g.piles[TABLEAU_0])).toBe(2);
  });

  it('is zero for an empty pile', () => {
    expect(runLength(emptyGame().piles[TABLEAU_0])).toBe(0);
  });

  it('never grabs more than the run allows', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 8, false), card(3, 7), card(2, 6)];
    expect(grab(g.piles[TABLEAU_0], 99)).toHaveLength(2);
    expect(grab(g.piles[TABLEAU_0], 1)).toHaveLength(1);
  });

  it('grabs only the top card of the waste', () => {
    const g = emptyGame();
    g.piles[WASTE].cards = [card(0, 4), card(1, 9)];
    expect(grab(g.piles[WASTE], 5)).toEqual([card(1, 9)]);
  });

  it('grabs nothing from the stock', () => {
    const g = emptyGame();
    g.piles[STOCK].cards = [card(0, 4, false)];
    expect(grab(g.piles[STOCK], 1)).toEqual([]);
  });
});

describe('applying a move', () => {
  it('turns over the card it exposes', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(1, 4, false), card(0, 6)];   // 5♦ down, 7♠ up
    g.piles[TABLEAU_0 + 1].cards = [card(3, 7)];                  // 8♥
    expect(applyMove(g, { from: TABLEAU_0, to: TABLEAU_0 + 1, count: 1 })).toBe(true);
    expect(top(g.piles[TABLEAU_0])!.faceUp).toBe(true);
  });

  it('moves a whole run at once', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 8), card(3, 7), card(2, 6)];  // 9♠ 8♥ 7♣
    g.piles[TABLEAU_0 + 1].cards = [card(1, 9)];                      // 10♦
    expect(applyMove(g, { from: TABLEAU_0, to: TABLEAU_0 + 1, count: 3 })).toBe(true);
    expect(g.piles[TABLEAU_0].cards).toHaveLength(0);
    expect(g.piles[TABLEAU_0 + 1].cards).toHaveLength(4);
  });

  it('refuses a run that is not really a run', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 8), card(2, 7), card(3, 6)];  // colours repeat
    g.piles[TABLEAU_0 + 1].cards = [card(1, 9)];
    expect(applyMove(g, { from: TABLEAU_0, to: TABLEAU_0 + 1, count: 3 })).toBe(false);
    expect(g.piles[TABLEAU_0].cards).toHaveLength(3);
  });

  it('changes nothing at all when the move is illegal', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 6)];
    g.piles[TABLEAU_0 + 1].cards = [card(2, 7)];   // same colour
    const before = JSON.stringify(g);
    expect(applyMove(g, { from: TABLEAU_0, to: TABLEAU_0 + 1, count: 1 })).toBe(false);
    expect(JSON.stringify(g)).toBe(before);
  });

  it('never moves out of the stock', () => {
    const g = emptyGame();
    g.piles[STOCK].cards = [card(0, 12)];
    expect(isLegal(g, { from: STOCK, to: TABLEAU_0, count: 1 })).toBe(false);
  });

  it('never moves a face-down card', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 12, false)];
    expect(isLegal(g, { from: TABLEAU_0, to: TABLEAU_0 + 1, count: 1 })).toBe(false);
  });

  it('counts every accepted move', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 6)];
    g.piles[TABLEAU_0 + 1].cards = [card(3, 7)];
    applyMove(g, { from: TABLEAU_0, to: TABLEAU_0 + 1, count: 1 });
    expect(g.moves).toBe(1);
  });
});

describe('the stock', () => {
  it('turns one card face up onto the waste', () => {
    const g = deal(3);
    expect(drawFromStock(g)).toBe(true);
    expect(g.piles[STOCK].cards).toHaveLength(23);
    expect(g.piles[WASTE].cards).toHaveLength(1);
    expect(top(g.piles[WASTE])!.faceUp).toBe(true);
  });

  it('recycles the waste, in order, once it runs out', () => {
    const g = deal(3);
    for (let i = 0; i < 24; i++) drawFromStock(g);
    expect(g.piles[STOCK].cards).toHaveLength(0);

    const wasteOrder = g.piles[WASTE].cards.map((c) => `${c.suit}${c.rank}`);
    expect(drawFromStock(g)).toBe(true);
    expect(g.recycles).toBe(1);
    expect(g.piles[WASTE].cards).toHaveLength(0);
    expect(g.piles[STOCK].cards.every((c) => !c.faceUp)).toBe(true);

    // Drawing them all again must give back the same order, not a reshuffle.
    for (let i = 0; i < 24; i++) drawFromStock(g);
    expect(g.piles[WASTE].cards.map((c) => `${c.suit}${c.rank}`)).toEqual(wasteOrder);
  });

  it('does nothing when both stock and waste are empty', () => {
    const g = emptyGame();
    expect(drawFromStock(g)).toBe(false);
  });
});

describe('finishing', () => {
  it('is not won until every foundation holds thirteen', () => {
    const g = emptyGame();
    for (let s = 0; s < 4; s++) {
      g.piles[FOUNDATION_0 + s].cards = Array.from({ length: 13 }, (_, r) => card(s, r));
    }
    expect(isWon(g)).toBe(true);

    g.piles[FOUNDATION_0].cards.pop();
    expect(isWon(g)).toBe(false);
  });

  it('offers to auto-finish only once nothing is hidden', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 0)];
    expect(canAutoFinish(g)).toBe(true);

    g.piles[TABLEAU_0].cards = [card(0, 1, false), card(0, 0)];
    expect(canAutoFinish(g)).toBe(false);

    g.piles[TABLEAU_0].cards = [card(0, 0)];
    g.piles[STOCK].cards = [card(1, 0, false)];
    expect(canAutoFinish(g)).toBe(false);
  });

  it('auto-finishes a solved-but-unstacked board completely', () => {
    const g = emptyGame();
    // Every card face up in the tableau, one suit per column.
    for (let s = 0; s < 4; s++) {
      g.piles[TABLEAU_0 + s].cards = Array.from({ length: 13 }, (_, r) => card(s, 12 - r));
    }
    expect(canAutoFinish(g)).toBe(true);

    let guard = 0;
    while (!g.won && guard++ < 200) {
      if (autoFinishStep(g) < 0) break;
    }
    expect(g.won).toBe(true);
  });

  it('stops stepping when nothing can be promoted', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 5)];   // a 6 with no Ace under it
    expect(autoFinishStep(g)).toBe(-1);
  });
});

describe('suggesting a destination', () => {
  it('prefers a foundation over a tableau', () => {
    const g = emptyGame();
    g.piles[WASTE].cards = [card(3, 0)];               // A♥
    g.piles[TABLEAU_0].cards = [card(0, 1)];           // 2♠ would also take it
    expect(suggestDestination(g, WASTE, 1)).toBe(FOUNDATION_0 + 3);
  });

  it('falls back to a legal tableau column', () => {
    const g = emptyGame();
    g.piles[WASTE].cards = [card(3, 5)];               // 6♥
    g.piles[TABLEAU_0 + 2].cards = [card(0, 6)];       // 7♠
    expect(suggestDestination(g, WASTE, 1)).toBe(TABLEAU_0 + 2);
  });

  it('reports nothing when the card has nowhere to go', () => {
    const g = emptyGame();
    g.piles[WASTE].cards = [card(3, 5)];
    expect(suggestDestination(g, WASTE, 1)).toBe(-1);
  });

  it('never suggests the pile the card is already on', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 6), card(3, 5)];   // 7♠ 6♥
    expect(suggestDestination(g, TABLEAU_0 + 0, 1)).toBe(-1);
  });

  it('does not offer to shuffle a lone King between empty columns', () => {
    // Legal, but it exposes nothing and frees nothing — offered as a hint it
    // just bounces the King back and forth.
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(0, 12)];
    expect(suggestDestination(g, TABLEAU_0, 1)).toBe(-1);
    expect(isLegal(g, { from: TABLEAU_0, to: TABLEAU_0 + 1, count: 1 })).toBe(true);
  });

  it('still offers an empty column to a King that is sitting on something', () => {
    const g = emptyGame();
    g.piles[TABLEAU_0].cards = [card(1, 3, false), card(0, 12)];   // K♠ over a face-down card
    expect(suggestDestination(g, TABLEAU_0, 1)).toBe(TABLEAU_0 + 1);
  });
});

describe('colours and piles', () => {
  it('knows which suits are red', () => {
    expect([0, 1, 2, 3].map(isRed)).toEqual([false, true, false, true]);
  });

  it('lays the table out as stock, waste, four foundations, seven columns', () => {
    const g = deal(1);
    expect(g.piles).toHaveLength(PILE_COUNT);
    expect(g.piles[STOCK].kind).toBe('stock');
    expect(g.piles[WASTE].kind).toBe('waste');
    expect(g.piles.filter((p) => p.kind === 'foundation')).toHaveLength(4);
    expect(g.piles.filter((p) => p.kind === 'tableau')).toHaveLength(7);
  });

  it('gives each foundation its own suit', () => {
    const g = deal(1);
    expect(g.piles.filter((p) => p.kind === 'foundation').map((p) => p.suit)).toEqual([0, 1, 2, 3]);
  });
});
