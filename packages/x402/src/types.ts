export interface PaymentRequest {
  recipient: string;
  amount: string;
  memo?: string;
  network?: "mainnet" | "testnet";
  expiresAt?: number;
}

export interface PaymentProofHeader {
  txid: string;
  recipient: string;
  amount: string;
  viewingKeyProof: string;
}

export interface X402Options {
  recipient: string;
  amount: string;
  memo?: string;
  network?: "mainnet" | "testnet";
}
