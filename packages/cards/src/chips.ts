/**
 * Money, for the games that bet.
 *
 * Kept deliberately small and engine-free: a bankroll is an integer, a bet is
 * an integer taken out of it, and settling puts an integer back. Persistence
 * is a pair of callbacks so this module never learns that the engine has a
 * save API.
 */

/** Chip denominations, largest last. Used to break an amount into a stack. */
export const DENOMINATIONS = [1, 5, 25, 100, 500] as const;

/**
 * The fewest chips that add up to `amount`, largest denomination first.
 * Returns the denomination of each chip, so the caller can draw a stack.
 */
export function chipStack(amount: number): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (let i = DENOMINATIONS.length - 1; i >= 0; i--) {
    const d = DENOMINATIONS[i];
    while (left >= d) {
      out.push(d);
      left -= d;
    }
  }
  return out;
}

export interface BankrollStore {
  load(): number | null;
  save(balance: number): void;
}

/** A store that forgets, for tests and for games that do not persist. */
export const memoryStore = (): BankrollStore => {
  let held: number | null = null;
  return { load: () => held, save: (b) => { held = b; } };
};

export class Bankroll {
  private balance: number;
  /** Chips currently committed to the table across all wagers. */
  private committed = 0;

  constructor(
    readonly startingStack: number,
    private readonly store: BankrollStore = memoryStore(),
  ) {
    const saved = store.load();
    this.balance = saved === null || !Number.isFinite(saved) ? startingStack : saved;
  }

  get chips(): number {
    return this.balance;
  }

  get atStake(): number {
    return this.committed;
  }

  /** Everything the player owns, wagered or not. */
  get total(): number {
    return this.balance + this.committed;
  }

  /** True when the player cannot cover the table minimum any more. */
  broke(minimum = 1): boolean {
    return this.total < minimum;
  }

  /**
   * Move `amount` from the stack to the table.
   *
   * Betting more than you hold is not an error the caller has to pre-check:
   * the wager is clamped to the stack, which is what going all in means, and
   * the amount actually committed is returned.
   */
  wager(amount: number): number {
    const n = Math.max(0, Math.min(Math.floor(amount), this.balance));
    this.balance -= n;
    this.committed += n;
    return n;
  }

  /** Take back a wager that was never resolved — a fold before any action. */
  refund(amount: number): void {
    const n = Math.max(0, Math.min(Math.floor(amount), this.committed));
    this.committed -= n;
    this.balance += n;
  }

  /**
   * Resolve the committed chips: `payout` is what comes back, so 0 is a loss,
   * the stake is a push, and twice the stake is an even-money win.
   */
  settle(payout: number): void {
    this.committed = 0;
    this.balance += Math.max(0, Math.round(payout));
    this.persist();
  }

  /** Add chips outside a wager — a top-up, or a pot won without a showdown. */
  credit(amount: number): void {
    this.balance += Math.max(0, Math.floor(amount));
    this.persist();
  }

  reset(): void {
    this.balance = this.startingStack;
    this.committed = 0;
    this.persist();
  }

  private persist(): void {
    this.store.save(this.balance);
  }
}
