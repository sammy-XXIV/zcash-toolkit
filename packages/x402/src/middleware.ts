import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { X402Options, PaymentProofHeader } from "./types.js";

const PAYMENT_REQUIRED = 402;
const HEADER_PAYMENT_REQUIRED = "X-Payment-Required";
const HEADER_PAYMENT = "X-Payment";

function parsePaymentHeader(raw: string): PaymentProofHeader | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as PaymentProofHeader;
  } catch {
    return null;
  }
}

function verifyPayment(proof: PaymentProofHeader, opts: X402Options): boolean {
  if (proof.recipient !== opts.recipient) return false;
  if (parseFloat(proof.amount) < parseFloat(opts.amount)) return false;
  if (!proof.txid || !proof.viewingKeyProof) return false;
  return true;
}

/**
 * Express middleware that gates a route behind a ZEC payment.
 *
 * Returns 402 with a JSON payment request if no valid X-Payment header.
 * Passes through (calls next()) when payment is verified.
 */
export function requirePayment(opts: X402Options): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const paymentHeader = req.headers[HEADER_PAYMENT.toLowerCase()];

    if (paymentHeader && typeof paymentHeader === "string") {
      const proof = parsePaymentHeader(paymentHeader);
      if (proof && verifyPayment(proof, opts)) {
        // Attach proof to request for downstream use
        (req as Request & { paymentProof: PaymentProofHeader }).paymentProof = proof;
        next();
        return;
      }
    }

    const paymentRequest = {
      type: "zcash",
      recipient: opts.recipient,
      amount: opts.amount,
      memo: opts.memo,
      network: opts.network ?? "mainnet",
    };

    res.setHeader(HEADER_PAYMENT_REQUIRED, Buffer.from(JSON.stringify(paymentRequest)).toString("base64"));
    res.status(PAYMENT_REQUIRED).json({
      error: "Payment required",
      payment: paymentRequest,
    });
  };
}
