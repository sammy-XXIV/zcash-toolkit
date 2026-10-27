/**
 * In-memory mock adapter for unit tests and demos.
 * Does NOT make real network requests or sign real transactions.
 */
import type { WalletAdapter, SendParams, Balance, Note, PaymentProof, SyncProgress } from "./types.js";

export function createMockAdapter(overrides?: Partial<WalletAdapter>): WalletAdapter {
  const notes: Note[] = [];
  let confirmedCb: ((n: Note) => void) | undefined;
  let syncingCb: ((p: SyncProgress) => void) | undefined;
  let addrCounter = 0;

  const base: WalletAdapter = {
    async newAddress(opts) {
      const pool = opts?.pool ?? "orchard";
      addrCounter++;
      // Unified addresses start with "u"; mock prefix keeps type check honest
      return `u1mock${pool}${addrCounter.toString().padStart(6, "0")}`;
    },
    async send(params: SendParams) {
      if (params.to.startsWith("t")) throw new Error("Transparent recipient refused");
      const txid = `mocktx${Date.now()}`;
      const note: Note = {
        txid,
        amount: params.amount,
        memo: params.memo ?? "",
        pool: "orchard",
        confirmed: true,
        timestamp: Date.now(),
      };
      notes.push(note);
      setTimeout(() => confirmedCb?.(note), 10);
      return txid;
    },
    async balance(): Promise<Balance> {
      const total = notes
        .reduce((s, n) => s + Number(n.amount), 0)
        .toFixed(8);
      return { orchard: total, sapling: "0", transparent: "0", total };
    },
    async history(limit = 25) {
      return notes.slice(-limit);
    },
    async paymentProof(txid: string): Promise<PaymentProof> {
      const note = notes.find((n) => n.txid === txid);
      if (!note) throw new Error(`Transaction ${txid} not found`);
      return {
        txid,
        to: "u1mockreceiver",
        amount: note.amount,
        memo: note.memo,
        viewingKeyProof: Buffer.from(JSON.stringify({ txid, mock: true })).toString("base64"),
      };
    },
    async close() {},
    onConfirmed(cb) { confirmedCb = cb; },
    onSyncing(cb) { syncingCb = cb; },
  };

  return overrides ? { ...base, ...overrides } : base;
}
