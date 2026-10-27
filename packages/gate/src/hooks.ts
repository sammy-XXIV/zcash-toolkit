import { useState, useCallback } from "react";

export type PaymentStatus = "idle" | "pending" | "paid" | "error";

export interface UsePaymentGateState {
  status: PaymentStatus;
  txid: string | null;
  error: string | null;
  onPaid: (txid: string) => void;
  onError: (msg: string) => void;
  reset: () => void;
}

export function usePaymentGate(): UsePaymentGateState {
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [txid, setTxid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPaid = useCallback((id: string) => {
    setTxid(id);
    setStatus("paid");
    setError(null);
  }, []);

  const onError = useCallback((msg: string) => {
    setError(msg);
    setStatus("error");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setTxid(null);
    setError(null);
  }, []);

  return { status, txid, error, onPaid, onError, reset };
}
