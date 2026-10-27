import React from "react";
import QRCode from "react-qr-code";

export interface ZcashPaymentGateProps {
  /** Recipient unified address */
  recipient: string;
  /** Amount in ZEC */
  amount: string;
  /** Optional memo */
  memo?: string;
  /** Called when payment is confirmed with txid */
  onPaid?: (txid: string) => void;
  /** Content to show after payment */
  children?: React.ReactNode;
  /** Network label */
  network?: "mainnet" | "testnet";
}

type Status = "waiting" | "paid";

interface State {
  status: Status;
  txid: string | null;
  inputTxid: string;
}

/**
 * A React component that gates content behind a ZEC shielded payment.
 *
 * Shows a QR code + address + amount. After the user pays and enters
 * the txid (or an automated system calls onPaid), reveals children.
 */
export function ZcashPaymentGate({
  recipient,
  amount,
  memo,
  onPaid,
  children,
  network = "mainnet",
}: ZcashPaymentGateProps): React.ReactElement {
  const [state, setState] = React.useReducer(
    (prev: State, next: Partial<State>): State => ({ ...prev, ...next }),
    { status: "waiting", txid: null, inputTxid: "" }
  );

  const zcashUri = `zcash:${recipient}?amount=${amount}${memo ? `&memo=${encodeURIComponent(memo)}` : ""}`;

  const handleConfirm = () => {
    const txid = state.inputTxid.trim();
    if (!txid) return;
    setState({ status: "paid", txid });
    onPaid?.(txid);
  };

  if (state.status === "paid") {
    return (
      <div style={{ fontFamily: "sans-serif" }}>
        <p style={{ color: "#22c55e" }}>Payment confirmed</p>
        <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>txid: {state.txid}</p>
        {children}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 360 }}>
      <p style={{ marginBottom: 8 }}>
        Send <strong>{amount} ZEC</strong>
        {network === "testnet" ? " (testnet)" : ""} to:
      </p>
      <QRCode value={zcashUri} size={200} />
      <p style={{ wordBreak: "break-all", fontSize: "0.75rem", marginTop: 8 }}>{recipient}</p>
      {memo && <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>Memo: {memo}</p>}
      <div style={{ marginTop: 16 }}>
        <input
          type="text"
          placeholder="Enter txid after paying"
          value={state.inputTxid}
          onChange={(e) => setState({ inputTxid: e.target.value })}
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <button onClick={handleConfirm} style={{ padding: "8px 16px" }}>
          Confirm payment
        </button>
      </div>
    </div>
  );
}
