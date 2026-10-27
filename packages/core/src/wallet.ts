import { EventEmitter } from "events";
import type { WalletAdapter, WalletConfig, SendParams, Balance, Note, PaymentProof, SyncProgress } from "./types.js";
import { createZcashJsAdapter, AdapterUnavailableError } from "./adapter-zcashjs.js";
import { createMockAdapter } from "./adapter-mock.js";

export class ZcashWallet extends EventEmitter {
  readonly #adapter: WalletAdapter;

  private constructor(adapter: WalletAdapter) {
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
  static async fromSeed(
    seed: string,
    config?: Partial<WalletConfig>,
    /** Override adapter — useful for tests */
    adapter?: WalletAdapter
  ): Promise<ZcashWallet> {
    const fullConfig: WalletConfig = {
      seed,
      network: config?.network ?? "testnet",
      lightwalletd: config?.lightwalletd,
      dataDir: config?.dataDir,
    };

    if (adapter) {
      return new ZcashWallet(adapter);
    }

    // zcash.js requires Linux + Node 22.23.4 — skip on Windows to avoid worker crash
    if (process.platform === "win32") {
      console.warn(
        "[zcash-agent-kit] Windows detected. Using mock adapter.\n" +
        "  For real transactions: Linux + Node 22.23.4 required."
      );
      return new ZcashWallet(createMockAdapter());
    }

    try {
      const real = await createZcashJsAdapter(fullConfig);
      return new ZcashWallet(real);
    } catch (e) {
      if (e instanceof AdapterUnavailableError) {
        console.warn(
          `[zcash-agent-kit] ${e.message}. Using mock adapter.\n` +
          `  For real transactions: Linux + Node 22.23.4 required.`
        );
        return new ZcashWallet(createMockAdapter());
      }
      throw e;
    }
  }

  /** Create a ZcashWallet with an explicit adapter (useful for testing). */
  static fromAdapter(adapter: WalletAdapter): ZcashWallet {
    return new ZcashWallet(adapter);
  }

  /**
   * Generate a new shielded receiving address.
   * Always Orchard by default. Never returns a t-address.
   */
  async newAddress(opts?: { pool?: "orchard" | "sapling"; label?: string }): Promise<string> {
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
  async send(params: SendParams): Promise<string> {
    if (params.to.startsWith("t")) {
      throw new Error(`send() refused: recipient "${params.to}" is a transparent address`);
    }
    return this.#adapter.send(params);
  }

  async balance(): Promise<Balance> {
    return this.#adapter.balance();
  }

  async history(limit?: number): Promise<Note[]> {
    return this.#adapter.history(limit);
  }

  /**
   * Generate a viewing-key payment proof for a txid.
   * The proof can be shared with a merchant to verify payment
   * without revealing anything else about the wallet.
   */
  async paymentProof(txid: string): Promise<PaymentProof> {
    return this.#adapter.paymentProof(txid);
  }

  /** Sync wallet with the chain. Emits "syncing" events with progress. */
  async sync(): Promise<void> {
    // Sync is handled internally by the adapter on startup.
    // For explicit re-sync, emit a syncing event and return.
    this.emit("syncing", { scanned: 0, total: 0 } satisfies SyncProgress);
  }

  async close(): Promise<void> {
    return this.#adapter.close();
  }

  // EventEmitter overloads for type safety
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override on(event: "confirmed", listener: (note: Note) => void): this;
  override on(event: "syncing", listener: (progress: SyncProgress) => void): this;
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}
