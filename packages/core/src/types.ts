// zcash-toolkit/core — shared types

export interface WalletConfig {
  seed: string;
  network?: "mainnet" | "testnet";
  /** default: testnet.zec.rocks:443 */
  lightwalletd?: string;
  /** default: ~/.zcash-toolkit/<fingerprint> on Linux */
  dataDir?: string;
}

export interface SendParams {
  to: string;
  /** Decimal ZEC string, e.g. "0.001" */
  amount: string;
  memo?: string;
  fromPool?: "orchard" | "sapling" | "auto";
}

export interface Note {
  txid: string;
  amount: string;
  memo: string;
  pool: "orchard" | "sapling" | "transparent";
  confirmed: boolean;
  timestamp: number;
}

export interface PaymentProof {
  txid: string;
  to: string;
  amount: string;
  memo: string;
  /** base64-encoded viewing-key disclosure */
  viewingKeyProof: string;
}

export interface Balance {
  orchard: string;
  sapling: string;
  transparent: string;
  total: string;
}

export interface SyncProgress {
  scanned: number;
  total: number;
}

/** Adapter interface — implement to plug in different backends */
export interface WalletAdapter {
  newAddress(opts?: { pool?: "orchard" | "sapling" }): Promise<string>;
  send(params: SendParams): Promise<string>;
  balance(): Promise<Balance>;
  history(limit?: number): Promise<Note[]>;
  paymentProof(txid: string): Promise<PaymentProof>;
  close(): Promise<void>;
  onConfirmed(cb: (note: Note) => void): void;
  onSyncing(cb: (progress: SyncProgress) => void): void;
}
