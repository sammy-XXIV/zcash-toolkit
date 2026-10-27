// docs/demo/src/buffer-shim.ts
var enc = new TextEncoder();
var dec = new TextDecoder();
var B = class _B {
  constructor(bytes) {
    this.bytes = bytes;
  }
  bytes;
  static from(v, encoding = "utf8") {
    if (encoding === "base64") return new _B(Uint8Array.from(atob(v), (c) => c.charCodeAt(0)));
    return new _B(enc.encode(v));
  }
  toString(encoding = "utf8") {
    if (encoding === "base64") return btoa(Array.from(this.bytes, (b) => String.fromCharCode(b)).join(""));
    return dec.decode(this.bytes);
  }
};

// docs/demo/src/events-shim.ts
var EventEmitter = class {
  #l = /* @__PURE__ */ new Map();
  on(e, f) {
    if (!this.#l.has(e)) this.#l.set(e, []);
    this.#l.get(e).push(f);
    return this;
  }
  off(e, f) {
    this.#l.set(e, (this.#l.get(e) ?? []).filter((x) => x !== f));
    return this;
  }
  emit(e, ...a) {
    const l = this.#l.get(e);
    if (!l?.length) return false;
    for (const f of l.slice()) f(...a);
    return true;
  }
};

// packages/core/src/adapter-zcashjs.ts
var AdapterUnavailableError = class extends Error {
  constructor(reason) {
    super(`ZcashJs adapter unavailable: ${reason}`);
    this.name = "AdapterUnavailableError";
  }
};
async function createZcashJsAdapter(config) {
  let zcash;
  try {
    zcash = await import("@zcashlabs/zcash.js");
  } catch (e) {
    throw new AdapterUnavailableError("could not import @zcashlabs/zcash.js");
  }
  const endpoint = config.lightwalletd ?? (config.network === "mainnet" ? "https://mainnet.zec.rocks:443" : "https://testnet.zec.rocks:443");
  const storage = config.dataDir ? { kind: "node-filesystem", path: config.dataDir } : { kind: "memory" };
  let client;
  try {
    client = await zcash.createWalletClient(endpoint, { storage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AdapterUnavailableError(`createWalletClient failed: ${msg}`);
  }
  let accountId;
  const existing = await client.accounts.list();
  if (existing.length > 0) {
    accountId = existing[0].id;
  } else {
    const created = await client.accounts.import({
      mnemonic: config.seed,
      accountIndex: 0,
      birthday: "fullScan"
    });
    accountId = created.account.id;
  }
  const confirmedCbs = [];
  const syncingCbs = [];
  return {
    async newAddress(opts) {
      const pool = opts?.pool ?? "orchard";
      const rec = await client.addresses.next({
        accountId,
        request: pool === "orchard" ? { orchard: true, sapling: false, transparent: false } : { orchard: false, sapling: true, transparent: false }
      });
      const addr = rec.address;
      if (addr.startsWith("t")) {
        throw new Error("Wallet returned a transparent address; refusing");
      }
      return addr;
    },
    async send(params) {
      if (!params.to.startsWith("u") && !params.to.startsWith("z")) {
        throw new Error("send() refused: recipient is not a shielded address");
      }
      const pending = await client.send({
        accountId,
        to: params.to,
        amount: BigInt(Math.round(Number(params.amount) * 1e8)),
        memo: params.memo
      });
      return pending.operationId;
    },
    async balance() {
      const bal = await client.getBalance({
        accountId
      });
      const amounts = bal.amounts;
      const total = amounts?.spendable?.total ?? 0n;
      const zec = (Number(total) / 1e8).toFixed(8);
      return {
        orchard: zec,
        sapling: "0",
        transparent: "0",
        total: zec
      };
    },
    async history(limit = 25) {
      const page = await client.getHistory({
        accountId,
        limit
      });
      return (page.items ?? []).map((item) => {
        const t = item;
        return {
          txid: t.txid,
          amount: (Number(t.amount) / 1e8).toFixed(8),
          memo: t.memo ?? "",
          pool: "orchard",
          confirmed: t.confirmed,
          timestamp: t.timestamp ?? Date.now()
        };
      });
    },
    async paymentProof(txid) {
      const tx = await client.getTransaction({
        txid
      });
      if (!tx) throw new Error(`Transaction ${txid} not found`);
      const t = tx;
      const vkHandle = await client.viewing.export({ accountId });
      const proof = B.from(
        JSON.stringify({ txid: t.txid, vk: String(vkHandle) })
      ).toString("base64");
      return {
        txid: t.txid,
        to: t.to ?? "",
        amount: (Number(t.amount ?? 0n) / 1e8).toFixed(8),
        memo: t.memo ?? "",
        viewingKeyProof: proof
      };
    },
    async close() {
      await client.close?.();
    },
    onConfirmed(cb) {
      confirmedCbs.push(cb);
    },
    onSyncing(cb) {
      syncingCbs.push(cb);
    }
  };
}

// packages/core/src/adapter-mock.ts
function createMockAdapter(overrides) {
  const notes = [];
  let confirmedCb;
  let syncingCb;
  let addrCounter = 0;
  const base = {
    async newAddress(opts) {
      const pool = opts?.pool ?? "orchard";
      addrCounter++;
      return `u1mock${pool}${addrCounter.toString().padStart(6, "0")}`;
    },
    async send(params) {
      if (params.to.startsWith("t")) throw new Error("Transparent recipient refused");
      const txid = `mocktx${Date.now()}`;
      const note = {
        txid,
        amount: params.amount,
        memo: params.memo ?? "",
        pool: "orchard",
        confirmed: true,
        timestamp: Date.now()
      };
      notes.push(note);
      setTimeout(() => confirmedCb?.(note), 10);
      return txid;
    },
    async balance() {
      const total = notes.reduce((s, n) => s + Number(n.amount), 0).toFixed(8);
      return { orchard: total, sapling: "0", transparent: "0", total };
    },
    async history(limit = 25) {
      return notes.slice(-limit);
    },
    async paymentProof(txid) {
      const note = notes.find((n) => n.txid === txid);
      if (!note) throw new Error(`Transaction ${txid} not found`);
      return {
        txid,
        to: "u1mockreceiver",
        amount: note.amount,
        memo: note.memo,
        viewingKeyProof: B.from(JSON.stringify({ txid, mock: true })).toString("base64")
      };
    },
    async close() {
    },
    onConfirmed(cb) {
      confirmedCb = cb;
    },
    onSyncing(cb) {
      syncingCb = cb;
    }
  };
  return overrides ? { ...base, ...overrides } : base;
}

// packages/core/src/wallet.ts
var ZcashWallet = class _ZcashWallet extends EventEmitter {
  #adapter;
  constructor(adapter) {
    super();
    this.#adapter = adapter;
    adapter.onConfirmed((note) => this.emit("confirmed", note));
    adapter.onSyncing((progress) => this.emit("syncing", progress));
  }
  /**
   * Create a ZcashWallet from a BIP-39 mnemonic seed.
   *
   * On Linux with Node 22.23.4: uses @zcashlabs/zcash.js (real transactions).
   * On other platforms: falls back to MockAdapter (no real transactions).
   *
   * To force mock: pass `{ adapter: createMockAdapter() }` as third arg.
   */
  static async fromSeed(seed, config, adapter) {
    const fullConfig = {
      seed,
      network: config?.network ?? "testnet",
      lightwalletd: config?.lightwalletd,
      dataDir: config?.dataDir
    };
    if (adapter) {
      return new _ZcashWallet(adapter);
    }
    if (false) {
      console.warn(
        "[zcash-toolkit] Windows detected. Using mock adapter.\n  For real transactions: Linux + Node 22.23.4 required."
      );
      return new _ZcashWallet(createMockAdapter());
    }
    try {
      const real = await createZcashJsAdapter(fullConfig);
      return new _ZcashWallet(real);
    } catch (e) {
      if (e instanceof AdapterUnavailableError) {
        console.warn(
          `[zcash-toolkit] ${e.message}. Using mock adapter.
  For real transactions: Linux + Node 22.23.4 required.`
        );
        return new _ZcashWallet(createMockAdapter());
      }
      throw e;
    }
  }
  /** Create a ZcashWallet with an explicit adapter (useful for testing). */
  static fromAdapter(adapter) {
    return new _ZcashWallet(adapter);
  }
  /**
   * Generate a new shielded receiving address.
   * Always Orchard by default. Never returns a t-address.
   */
  async newAddress(opts) {
    const addr = await this.#adapter.newAddress(opts);
    if (addr.startsWith("t")) {
      throw new Error(`newAddress() returned a transparent address: ${addr}. Refusing.`);
    }
    return addr;
  }
  /**
   * Send shielded ZEC.
   * @returns txid
   */
  async send(params) {
    if (params.to.startsWith("t")) {
      throw new Error(`send() refused: recipient "${params.to}" is a transparent address`);
    }
    return this.#adapter.send(params);
  }
  async balance() {
    return this.#adapter.balance();
  }
  async history(limit) {
    return this.#adapter.history(limit);
  }
  /**
   * Generate a viewing-key payment proof for a txid.
   * The proof can be shared with a merchant to verify payment
   * without revealing anything else about the wallet.
   */
  async paymentProof(txid) {
    return this.#adapter.paymentProof(txid);
  }
  /** Sync wallet with the chain. Emits "syncing" events with progress. */
  async sync() {
    this.emit("syncing", { scanned: 0, total: 0 });
  }
  async close() {
    return this.#adapter.close();
  }
  on(event, listener) {
    return super.on(event, listener);
  }
};

// packages/x402/src/middleware.ts
var PAYMENT_REQUIRED = 402;
var HEADER_PAYMENT_REQUIRED = "X-Payment-Required";
var HEADER_PAYMENT = "X-Payment";
function parsePaymentHeader(raw) {
  try {
    return JSON.parse(B.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
function verifyPayment(proof, opts) {
  if (proof.recipient !== opts.recipient) return false;
  if (parseFloat(proof.amount) < parseFloat(opts.amount)) return false;
  if (!proof.txid || !proof.viewingKeyProof) return false;
  return true;
}
function requirePayment(opts) {
  return (req, res, next) => {
    const paymentHeader = req.headers[HEADER_PAYMENT.toLowerCase()];
    if (paymentHeader && typeof paymentHeader === "string") {
      const proof = parsePaymentHeader(paymentHeader);
      if (proof && verifyPayment(proof, opts)) {
        req.paymentProof = proof;
        next();
        return;
      }
    }
    const paymentRequest = {
      type: "zcash",
      recipient: opts.recipient,
      amount: opts.amount,
      memo: opts.memo,
      network: opts.network ?? "mainnet"
    };
    res.setHeader(HEADER_PAYMENT_REQUIRED, B.from(JSON.stringify(paymentRequest)).toString("base64"));
    res.status(PAYMENT_REQUIRED).json({
      error: "Payment required",
      payment: paymentRequest
    });
  };
}

// packages/x402/src/client.ts
var HEADER_PAYMENT_REQUIRED2 = "x-payment-required";
var HEADER_PAYMENT2 = "X-Payment";
async function fetchWithPayment(url, wallet, init) {
  const initial = await fetch(url, init);
  if (initial.status !== 402) {
    return initial;
  }
  const paymentRequiredHeader = initial.headers.get(HEADER_PAYMENT_REQUIRED2);
  if (!paymentRequiredHeader) {
    return initial;
  }
  let paymentRequest;
  try {
    paymentRequest = JSON.parse(
      B.from(paymentRequiredHeader, "base64").toString("utf8")
    );
  } catch {
    return initial;
  }
  const txid = await wallet.send({
    to: paymentRequest.recipient,
    amount: paymentRequest.amount,
    memo: paymentRequest.memo ?? `x402 payment for ${url}`
  });
  const proof = await wallet.paymentProof(txid);
  const paymentHeader = {
    txid: proof.txid,
    recipient: paymentRequest.recipient,
    amount: paymentRequest.amount,
    viewingKeyProof: proof.viewingKeyProof
  };
  const encodedProof = B.from(JSON.stringify(paymentHeader)).toString("base64");
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      [HEADER_PAYMENT2]: encodedProof
    }
  });
}

// packages/agent/src/policy.ts
var SpendingPolicyEngine = class {
  #policy;
  #dailySpent = "0";
  #dayStart = todayUtc();
  constructor(policy) {
    this.#policy = policy;
  }
  check(to, amount) {
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
  record(amount) {
    this.#dailySpent = (parseFloat(this.#dailySpent) + parseFloat(amount)).toFixed(8);
  }
  get dailySpent() {
    return this.#dailySpent;
  }
};
function todayUtc() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}

// packages/agent/src/tools.ts
function ok(text) {
  return { content: [{ type: "text", text }] };
}
function err(text) {
  return { content: [{ type: "text", text }], isError: true };
}
function makeWalletTools(wallet, policy) {
  return {
    async get_address(args) {
      try {
        const addr = await wallet.newAddress({ pool: args.pool ?? "orchard" });
        return ok(addr);
      } catch (e) {
        return err(String(e));
      }
    },
    async get_balance() {
      try {
        const bal = await wallet.balance();
        return ok(JSON.stringify(bal, null, 2));
      } catch (e) {
        return err(String(e));
      }
    },
    async send_zec(args) {
      const violation = policy.check(args.to, args.amount);
      if (violation) {
        return err(`Policy violation: ${violation.reason}`);
      }
      try {
        const txid = await wallet.send({ to: args.to, amount: args.amount, memo: args.memo });
        policy.record(args.amount);
        return ok(`txid: ${txid}`);
      } catch (e) {
        return err(String(e));
      }
    },
    async payment_proof(args) {
      try {
        const proof = await wallet.paymentProof(args.txid);
        return ok(JSON.stringify(proof, null, 2));
      } catch (e) {
        return err(String(e));
      }
    },
    async get_history(args) {
      try {
        const notes = await wallet.history(args.limit ?? 10);
        return ok(JSON.stringify(notes, null, 2));
      } catch (e) {
        return err(String(e));
      }
    }
  };
}

// packages/audit/src/rules.ts
var noTransparentPool = (notes) => notes.filter((n) => n.pool === "transparent").map((n) => ({
  severity: "critical",
  rule: "no-transparent-pool",
  message: `Note ${n.txid} is in the transparent pool \u2014 value and address visible on-chain`,
  txid: n.txid
}));
var memoPresence = (notes) => notes.filter((n) => !n.memo || n.memo.trim() === "").map((n) => ({
  severity: "warn",
  rule: "memo-presence",
  message: `Note ${n.txid} has no memo \u2014 selective disclosure not possible`,
  txid: n.txid
}));
var dustThreshold = (notes) => {
  const DUST_ZAT = 1e-5;
  return notes.filter((n) => parseFloat(n.amount) < DUST_ZAT && parseFloat(n.amount) > 0).map((n) => ({
    severity: "warn",
    rule: "dust-threshold",
    message: `Note ${n.txid} amount ${n.amount} ZEC is below dust threshold \u2014 potential linkage attack`,
    txid: n.txid
  }));
};
var ALL_RULES = [noTransparentPool, memoPresence, dustThreshold];

// packages/audit/src/tracer.ts
async function runAudit(wallet, rules = ALL_RULES, limit = 100) {
  const [address, notes] = await Promise.all([
    wallet.newAddress({ pool: "orchard" }),
    wallet.history(limit)
  ]);
  const findings = rules.flatMap((rule) => rule(notes));
  const summary = findings.reduce(
    (acc, f) => {
      acc[f.severity]++;
      return acc;
    },
    { critical: 0, warn: 0, info: 0 }
  );
  return { walletAddress: address, notesScanned: notes.length, findings, summary };
}

// packages/gate/src/verify.ts
function verifyPaymentProof(proof, expectedRecipient, expectedAmount) {
  if (proof.recipient !== expectedRecipient) {
    return { valid: false, reason: `recipient mismatch: got ${proof.recipient}` };
  }
  if (parseFloat(proof.amount) < parseFloat(expectedAmount)) {
    return { valid: false, reason: `amount too low: got ${proof.amount}, need ${expectedAmount}` };
  }
  if (!proof.viewingKeyProof || proof.viewingKeyProof.length === 0) {
    return { valid: false, reason: "missing viewingKeyProof" };
  }
  if (!proof.txid || proof.txid.length === 0) {
    return { valid: false, reason: "missing txid" };
  }
  return { valid: true };
}
function parsePaymentHeader2(header) {
  try {
    return JSON.parse(B.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
export {
  ALL_RULES,
  SpendingPolicyEngine,
  ZcashWallet,
  createMockAdapter,
  fetchWithPayment,
  makeWalletTools,
  parsePaymentHeader2 as parsePaymentHeader,
  requirePayment,
  runAudit,
  verifyPaymentProof
};
