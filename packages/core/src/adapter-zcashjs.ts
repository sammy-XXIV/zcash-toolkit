/**
 * ZcashJs adapter — wraps @zcashlabs/zcash.js.
 *
 * REQUIREMENTS:
 *   - Linux (not Windows) for persistent storage
 *   - Node 22.23.4 (see .nvmrc in zcash.js repo)
 *
 * On other platforms the constructor throws AdapterUnavailableError.
 * The ZcashWallet class falls back to FallbackAdapter in that case.
 */
import type {
  WalletAdapter,
  WalletConfig,
  SendParams,
  Balance,
  Note,
  PaymentProof,
  SyncProgress,
} from "./types.js";

export class AdapterUnavailableError extends Error {
  constructor(reason: string) {
    super(`ZcashJs adapter unavailable: ${reason}`);
    this.name = "AdapterUnavailableError";
  }
}

export async function createZcashJsAdapter(
  config: WalletConfig
): Promise<WalletAdapter> {
  // Dynamic import — fails gracefully on unsupported platforms
  let zcash: typeof import("@zcashlabs/zcash.js");
  try {
    zcash = await import("@zcashlabs/zcash.js");
  } catch (e) {
    throw new AdapterUnavailableError("could not import @zcashlabs/zcash.js");
  }

  const endpoint =
    config.lightwalletd ??
    (config.network === "mainnet"
      ? "https://mainnet.zec.rocks:443"
      : "https://testnet.zec.rocks:443");

  const storage: { kind: "node-filesystem"; path: string } | { kind: "memory" } =
    config.dataDir
      ? { kind: "node-filesystem", path: config.dataDir }
      : { kind: "memory" };

  let client: Awaited<ReturnType<typeof zcash.createWalletClient>>;
  try {
    client = await zcash.createWalletClient(endpoint, { storage });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AdapterUnavailableError(`createWalletClient failed: ${msg}`);
  }

  // Create or load account from seed
  let accountId: string;
  const existing = await client.accounts.list();
  if (existing.length > 0) {
    accountId = existing[0]!.id as string;
  } else {
    const created = await (client.accounts.import as unknown as (args: {
      mnemonic: unknown;
      accountIndex: number;
      birthday: string;
    }) => Promise<{ account: { id: string } }>)({
      mnemonic: config.seed,
      accountIndex: 0,
      birthday: "fullScan",
    });
    accountId = created.account.id;
  }

  const confirmedCbs: Array<(note: Note) => void> = [];
  const syncingCbs: Array<(p: SyncProgress) => void> = [];

  return {
    async newAddress(opts) {
      const pool = opts?.pool ?? "orchard";
      // Request a Unified Address — pool selection via receiver type
      const rec = await client.addresses.next({
        accountId: accountId as unknown as Parameters<typeof client.addresses.next>[0]["accountId"],
        request: pool === "orchard"
          ? { orchard: true, sapling: false, transparent: false }
          : { orchard: false, sapling: true, transparent: false },
      } as unknown as Parameters<typeof client.addresses.next>[0]);
      const addr = (rec as { address: string }).address;
      if (addr.startsWith("t")) {
        throw new Error("Wallet returned a transparent address; refusing");
      }
      return addr;
    },

    async send(params: SendParams) {
      if (!params.to.startsWith("u") && !params.to.startsWith("z")) {
        throw new Error("send() refused: recipient is not a shielded address");
      }
      const pending = await client.send({
        accountId: accountId as unknown as Parameters<typeof client.send>[0]["accountId"],
        to: params.to,
        amount: BigInt(Math.round(Number(params.amount) * 1e8)),
        memo: params.memo,
      } as unknown as Parameters<typeof client.send>[0]);
      return (pending as { operationId: string }).operationId;
    },

    async balance() {
      const bal = await client.getBalance({
        accountId: accountId as unknown as Parameters<typeof client.getBalance>[0]["accountId"],
      });
      const amounts = (bal as { amounts?: { spendable?: { total?: bigint } } | null }).amounts;
      const total = amounts?.spendable?.total ?? 0n;
      const zec = (Number(total) / 1e8).toFixed(8);
      return {
        orchard: zec,
        sapling: "0",
        transparent: "0",
        total: zec,
      };
    },

    async history(limit = 25) {
      const page = await client.getHistory({
        accountId: accountId as unknown as Parameters<typeof client.getHistory>[0]["accountId"],
        limit,
      } as unknown as Parameters<typeof client.getHistory>[0]);
      return ((page as unknown as { items: unknown[] }).items ?? []).map((item) => {
        const t = item as {
          txid: string;
          amount: bigint;
          memo?: string;
          confirmed: boolean;
          timestamp?: number;
        };
        return {
          txid: t.txid,
          amount: (Number(t.amount) / 1e8).toFixed(8),
          memo: t.memo ?? "",
          pool: "orchard" as const,
          confirmed: t.confirmed,
          timestamp: t.timestamp ?? Date.now(),
        };
      });
    },

    async paymentProof(txid: string): Promise<PaymentProof> {
      const tx = await client.getTransaction({
        txid: txid as unknown as Parameters<typeof client.getTransaction>[0]["txid"],
      });
      if (!tx) throw new Error(`Transaction ${txid} not found`);
      const t = tx as {
        txid: string;
        amount?: bigint;
        memo?: string;
        to?: string;
      };
      // Export viewing key and sign a disclosure
      const vkHandle = await (client as unknown as {
        viewing: { export: (args: { accountId: unknown }) => Promise<unknown> };
      }).viewing.export({ accountId });
      const proof = Buffer.from(
        JSON.stringify({ txid: t.txid, vk: String(vkHandle) })
      ).toString("base64");
      return {
        txid: t.txid,
        to: t.to ?? "",
        amount: (Number(t.amount ?? 0n) / 1e8).toFixed(8),
        memo: t.memo ?? "",
        viewingKeyProof: proof,
      };
    },

    async close() {
      await (client as unknown as { close?: () => Promise<void> }).close?.();
    },

    onConfirmed(cb) {
      confirmedCbs.push(cb);
    },
    onSyncing(cb) {
      syncingCbs.push(cb);
    },
  };
}
