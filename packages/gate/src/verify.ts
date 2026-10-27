export interface PaymentVerification {
  txid: string;
  recipient: string;
  amount: string;
  viewingKeyProof: string;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify a payment proof from an X-Payment header.
 * Checks that recipient matches, amount is sufficient, and proof is non-empty.
 */
export function verifyPaymentProof(
  proof: PaymentVerification,
  expectedRecipient: string,
  expectedAmount: string
): VerifyResult {
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

export function parsePaymentHeader(header: string): PaymentVerification | null {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentVerification;
  } catch {
    return null;
  }
}
