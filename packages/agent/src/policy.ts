export interface SpendingPolicy {
  maxPerTx: string;
  dailyLimit: string;
  allowedRecipients?: string[];
}

export interface PolicyViolation {
  reason: string;
}

export class SpendingPolicyEngine {
  readonly #policy: SpendingPolicy;
  #dailySpent = "0";
  #dayStart = todayUtc();

  constructor(policy: SpendingPolicy) {
    this.#policy = policy;
  }

  check(to: string, amount: string): PolicyViolation | null {
    // Reset daily counter if new day
    if (todayUtc() !== this.#dayStart) {
      this.#dailySpent = "0";
      this.#dayStart = todayUtc();
    }

    if (parseFloat(amount) > parseFloat(this.#policy.maxPerTx)) {
      return { reason: `amount ${amount} exceeds per-tx limit ${this.#policy.maxPerTx}` };
    }

    const projectedDaily = parseFloat(this.#dailySpent) + parseFloat(amount);
    if (projectedDaily > parseFloat(this.#policy.dailyLimit)) {
      return { reason: `would exceed daily limit ${this.#policy.dailyLimit} (spent ${this.#dailySpent})` };
    }

    if (this.#policy.allowedRecipients && !this.#policy.allowedRecipients.includes(to)) {
      return { reason: `recipient ${to} not in allowlist` };
    }

    return null;
  }

  record(amount: string): void {
    this.#dailySpent = (parseFloat(this.#dailySpent) + parseFloat(amount)).toFixed(8);
  }

  get dailySpent(): string {
    return this.#dailySpent;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
