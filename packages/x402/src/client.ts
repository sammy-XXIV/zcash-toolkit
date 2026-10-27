import type { ZcashWallet } from "@zcash-toolkit/core";
import type { PaymentProofHeader } from "./types.js";

const HEADER_PAYMENT_REQUIRED = "x-payment-required";
const HEADER_PAYMENT = "X-Payment";

interface PaymentRequestPayload {
  type: string;
  recipient: string;
  amount: string;
  memo?: string;
  network?: string;
}

/**
 * Fetch a URL, automatically paying any 402 response using the provided wallet.
 *
 * Flow:
 *   1. Make initial request.
 *   2. If 402, parse X-Payment-Required header to get payment details.
 *   3. Pay with wallet, get txid + proof.
 *   4. Retry with X-Payment header containing the proof.
 *   5. Return final response.
 */
export async function fetchWithPayment(
  url: string,
  wallet: ZcashWallet,
  init?: RequestInit
): Promise<Response> {
  const initial = await fetch(url, init);

  if (initial.status !== 402) {
    return initial;
  }

  const paymentRequiredHeader = initial.headers.get(HEADER_PAYMENT_REQUIRED);
  if (!paymentRequiredHeader) {
    return initial;
  }

  let paymentRequest: PaymentRequestPayload;
  try {
    paymentRequest = JSON.parse(
      Buffer.from(paymentRequiredHeader, "base64").toString("utf8")
    ) as PaymentRequestPayload;
  } catch {
    return initial;
  }

  // Pay
  const txid = await wallet.send({
    to: paymentRequest.recipient,
    amount: paymentRequest.amount,
    memo: paymentRequest.memo ?? `x402 payment for ${url}`,
  });

  // Get viewing-key proof
  const proof = await wallet.paymentProof(txid);

  const paymentHeader: PaymentProofHeader = {
    txid: proof.txid,
    recipient: paymentRequest.recipient,
    amount: paymentRequest.amount,
    viewingKeyProof: proof.viewingKeyProof,
  };

  const encodedProof = Buffer.from(JSON.stringify(paymentHeader)).toString("base64");

  // Retry with payment
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      [HEADER_PAYMENT]: encodedProof,
    },
  });
}
