import type { Note } from "@zcash-agent-kit/core";

export interface AuditFinding {
  severity: "critical" | "warn" | "info";
  rule: string;
  message: string;
  txid?: string;
}

export type AuditRule = (notes: Note[]) => AuditFinding[];

/** Flag any note landing in the transparent pool */
export const noTransparentPool: AuditRule = (notes) =>
  notes
    .filter((n) => n.pool === "transparent")
    .map((n) => ({
      severity: "critical",
      rule: "no-transparent-pool",
      message: `Note ${n.txid} is in the transparent pool — value and address visible on-chain`,
      txid: n.txid,
    }));

/** Warn on notes without a memo (missed opportunity for selective disclosure) */
export const memoPresence: AuditRule = (notes) =>
  notes
    .filter((n) => !n.memo || n.memo.trim() === "")
    .map((n) => ({
      severity: "warn",
      rule: "memo-presence",
      message: `Note ${n.txid} has no memo — selective disclosure not possible`,
      txid: n.txid,
    }));

/** Warn on very small amounts that may be used as dust-linkage attacks */
export const dustThreshold: AuditRule = (notes) => {
  const DUST_ZAT = 0.00001;
  return notes
    .filter((n) => parseFloat(n.amount) < DUST_ZAT && parseFloat(n.amount) > 0)
    .map((n) => ({
      severity: "warn",
      rule: "dust-threshold",
      message: `Note ${n.txid} amount ${n.amount} ZEC is below dust threshold — potential linkage attack`,
      txid: n.txid,
    }));
};

export const ALL_RULES: AuditRule[] = [noTransparentPool, memoPresence, dustThreshold];
