/**
 * Blackjack, as rules rather than as pixels.
 *
 * Like the solitaire next door, nothing here touches the engine: a round is a
 * value you push actions into, and every question the table can be asked —
 * may I split, what is the dealer holding, what does this hand pay — is a
 * function of that value. That is what lets the dealer policy and the payout
 * table be tested exhaustively instead of played by hand.
 */
import { Shoe, blackjackValues, type Card } from '@cathode/cards';

export interface Rules {
  decks: number;
  /** 3:2 is 1.5. Some houses pay 6:5; the arithmetic does not care. */
  blackjackPays: number;
  /** H17 tables hit a soft 17, S17 tables stand on it. */
  dealerHitsSoft17: boolean;
  /** How many times a hand may be split. 3 allows four hands. */
  maxSplits: number;
  doubleAfterSplit: boolean;
  minBet: number;
  maxBet: number;
}

export const HOUSE_RULES: Rules = {
  decks: 6,
  blackjackPays: 1.5,
  dealerHitsSoft17: false,
  maxSplits: 3,
  doubleAfterSplit: true,
  minBet: 5,
  maxBet: 500,
};

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  stood: boolean;
  /**
   * A hand made by splitting cannot be a blackjack, however it adds up. That
   * is a house rule rather than arithmetic, so it has to be remembered.
   */
  fromSplit: boolean;
}

export type Phase = 'betting' | 'insurance' | 'player' | 'dealer' | 'payout';

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface HandResult {
  outcome: Outcome;
  /** What comes back to the player: 0 on a loss, the stake on a push. */
  payout: number;
}

export interface Table {
  shoe: Shoe;
  dealer: Card[];
  hands: Hand[];
  /** Which hand the player is acting on. */
  active: number;
  phase: Phase;
  /** The insurance side bet, or 0. */
  insurance: number;
  splits: number;
  results: HandResult[];
  rules: Rules;
}

// --- Hand arithmetic -------------------------------------------------------

/**
 * The best total this hand can make without busting, and whether it got there
 * by counting an ace as eleven.
 *
 * "Soft" is the only reason this returns a pair rather than a number: a soft
 * 17 can be hit without risk and a hard 17 cannot, and the dealer policy turns
 * on exactly that.
 */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const values = blackjackValues(card);
    if (values.length === 2) {
      aces++;
      total += 1;
    } else {
      total += values[0];
    }
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

export const total = (cards: Card[]): number => handValue(cards).total;

export const isBust = (cards: Card[]): boolean => handValue(cards).total > 21;

/** Twenty-one on the first two cards, and not out of a split. */
export function isBlackjack(hand: Hand): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && total(hand.cards) === 21;
}

/** A pair, by rank. Ten-value cards of different ranks do not pair here. */
export const isPair = (hand: Hand): boolean =>
  hand.cards.length === 2 && hand.cards[0].rank === hand.cards[1].rank;

// --- Dealer ----------------------------------------------------------------

/** Whether the dealer must take another card, under this table's rules. */
export function dealerShouldHit(cards: Card[], rules: Rules): boolean {
  const { total: t, soft } = handValue(cards);
  if (t < 17) return true;
  return t === 17 && soft && rules.dealerHitsSoft17;
}

// --- Table -----------------------------------------------------------------

export function createTable(seed: number, rules: Rules = HOUSE_RULES): Table {
  return {
    shoe: new Shoe(seed, rules.decks),
    dealer: [],
    hands: [],
    active: 0,
    phase: 'betting',
    insurance: 0,
    splits: 0,
    results: [],
    rules,
  };
}

const newHand = (bet: number, fromSplit = false): Hand => ({
  cards: [], bet, doubled: false, stood: false, fromSplit,
});

/** The dealer's face-up card, which is all the player gets to see. */
export const upcard = (table: Table): Card | null => table.dealer[0] ?? null;

/** True when the dealer is showing an ace, so insurance is on offer. */
export const offersInsurance = (table: Table): boolean =>
  table.phase === 'insurance' && table.dealer.length === 2 && table.dealer[0].rank === 0;

/**
 * Deal a round. The dealer's second card goes down, which is the only hidden
 * information in the game and therefore the whole of its tension.
 */
export function startRound(table: Table, bet: number): boolean {
  if (table.phase !== 'betting') return false;
  const wager = Math.max(table.rules.minBet, Math.min(Math.floor(bet), table.rules.maxBet));

  table.dealer = [];
  table.hands = [newHand(wager)];
  table.active = 0;
  table.insurance = 0;
  table.splits = 0;
  table.results = [];

  table.hands[0].cards.push(table.shoe.draw());
  table.dealer.push(table.shoe.draw());
  table.hands[0].cards.push(table.shoe.draw());
  table.dealer.push(table.shoe.draw(false));

  table.phase = table.dealer[0].rank === 0 ? 'insurance' : 'player';
  if (table.phase === 'player') settleNaturals(table);
  return true;
}

/**
 * Take or decline insurance, then resolve it immediately: the dealer peeks at
 * a hole card worth ten, and the round is over before the player acts if it
 * is there.
 */
export function resolveInsurance(table: Table, take: boolean): boolean {
  if (table.phase !== 'insurance') return false;
  table.insurance = take ? Math.floor(table.hands[0].bet / 2) : 0;
  table.phase = 'player';
  settleNaturals(table);
  return true;
}

/**
 * A dealer blackjack ends the round at once; so does the player's, unless the
 * dealer might match it. Everything else is played out.
 */
function settleNaturals(table: Table): void {
  const dealerNatural = total(table.dealer) === 21 && table.dealer.length === 2;
  const playerNatural = isBlackjack(table.hands[0]);
  if (!dealerNatural && !playerNatural) return;

  table.dealer[1].faceUp = true;
  table.phase = 'payout';
  payout(table);
}

// --- Player actions --------------------------------------------------------

const current = (table: Table): Hand | null =>
  table.phase === 'player' ? (table.hands[table.active] ?? null) : null;

export function canHit(table: Table): boolean {
  const hand = current(table);
  return !!hand && !hand.stood && !hand.doubled && !isBust(hand.cards)
    && total(hand.cards) < 21;
}

export function canDouble(table: Table): boolean {
  const hand = current(table);
  if (!hand || hand.cards.length !== 2 || hand.doubled) return false;
  if (hand.fromSplit && !table.rules.doubleAfterSplit) return false;
  return true;
}

export function canSplit(table: Table): boolean {
  const hand = current(table);
  if (!hand || !isPair(hand)) return false;
  return table.splits < table.rules.maxSplits;
}

export function hit(table: Table): boolean {
  const hand = current(table);
  if (!hand || !canHit(table)) return false;
  hand.cards.push(table.shoe.draw());
  if (isBust(hand.cards) || total(hand.cards) === 21) advance(table);
  return true;
}

export function stand(table: Table): boolean {
  const hand = current(table);
  if (!hand) return false;
  hand.stood = true;
  advance(table);
  return true;
}

/** Double the bet, take exactly one card, and the hand is over. */
export function double(table: Table): boolean {
  const hand = current(table);
  if (!hand || !canDouble(table)) return false;
  hand.bet *= 2;
  hand.doubled = true;
  hand.cards.push(table.shoe.draw());
  advance(table);
  return true;
}

/**
 * Split a pair into two hands, each taking one new card.
 *
 * Split aces are dealt one card and then stand, which is why the new hands
 * are marked `fromSplit`: it is the same flag that stops them being called
 * blackjacks.
 */
export function split(table: Table): boolean {
  const hand = current(table);
  if (!hand || !canSplit(table)) return false;

  const moved = hand.cards.pop()!;
  const second = newHand(hand.bet, true);
  second.cards.push(moved);
  hand.fromSplit = true;

  hand.cards.push(table.shoe.draw());
  second.cards.push(table.shoe.draw());
  table.hands.splice(table.active + 1, 0, second);
  table.splits++;

  if (moved.rank === 0) {
    // Split aces get one card each and no more.
    hand.stood = true;
    second.stood = true;
    advance(table);
  }
  return true;
}

/** Move to the next unfinished hand, or hand over to the dealer. */
function advance(table: Table): void {
  for (let i = table.active + 1; i < table.hands.length; i++) {
    const hand = table.hands[i];
    if (!hand.stood && !isBust(hand.cards)) {
      table.active = i;
      return;
    }
  }
  table.active = table.hands.length - 1;
  table.phase = 'dealer';
  table.dealer[1].faceUp = true;

  // With every hand bust the dealer has nothing to beat, so no card is drawn.
  if (table.hands.every((h) => isBust(h.cards))) {
    table.phase = 'payout';
    payout(table);
  }
}

// --- Dealer play and payout ------------------------------------------------

/**
 * One dealer card. Returns false once the dealer is done, so the caller can
 * drive this from a timer and have the hand appear a card at a time.
 */
export function dealerStep(table: Table): boolean {
  if (table.phase !== 'dealer') return false;
  if (dealerShouldHit(table.dealer, table.rules)) {
    table.dealer.push(table.shoe.draw());
    return true;
  }
  table.phase = 'payout';
  payout(table);
  return false;
}

/** What one hand is worth against a finished dealer hand. */
export function settleHand(hand: Hand, dealer: Card[], rules: Rules): HandResult {
  const player = total(hand.cards);
  const house = total(dealer);
  const dealerNatural = house === 21 && dealer.length === 2;

  if (isBust(hand.cards)) return { outcome: 'bust', payout: 0 };

  if (isBlackjack(hand)) {
    if (dealerNatural) return { outcome: 'push', payout: hand.bet };
    return { outcome: 'blackjack', payout: Math.round(hand.bet * (1 + rules.blackjackPays)) };
  }

  if (dealerNatural) return { outcome: 'lose', payout: 0 };
  if (house > 21) return { outcome: 'win', payout: hand.bet * 2 };
  if (player > house) return { outcome: 'win', payout: hand.bet * 2 };
  if (player === house) return { outcome: 'push', payout: hand.bet };
  return { outcome: 'lose', payout: 0 };
}

function payout(table: Table): void {
  table.results = table.hands.map((h) => settleHand(h, table.dealer, table.rules));
}

/** Insurance pays 2:1 when the hole card completes a dealer blackjack. */
export function insurancePayout(table: Table): number {
  if (!table.insurance) return 0;
  const dealerNatural = total(table.dealer) === 21 && table.dealer.length === 2;
  return dealerNatural ? table.insurance * 3 : 0;
}

/** Everything coming back to the player this round, insurance included. */
export const roundPayout = (table: Table): number =>
  table.results.reduce((n, r) => n + r.payout, 0) + insurancePayout(table);

/** Everything the player put up this round. */
export const roundStake = (table: Table): number =>
  table.hands.reduce((n, h) => n + h.bet, 0) + table.insurance;

export function nextRound(table: Table): void {
  table.phase = 'betting';
  table.hands = [];
  table.dealer = [];
  table.results = [];
  table.insurance = 0;
  table.splits = 0;
  table.active = 0;
}
