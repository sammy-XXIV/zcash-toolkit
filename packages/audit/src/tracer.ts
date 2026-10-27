import type { ZcashWallet, Note } from "@zcash-toolkit/core";
import { ALL_RULES, type AuditFinding, type AuditRule } from "./rules.js";

export interface AuditReport {
  walletAddress: string;
  notesScanned: number;
  findings: AuditFinding[];
  summary: { critical: number; warn: number; info: number };
}

export async function runAudit(
  wallet: ZcashWallet,
  rules: AuditRule[] = ALL_RULES,
  limit = 100
): Promise<AuditReport> {
  const [address, notes] = await Promise.all([
    wallet.newAddress({ pool: "orchard" }),
    wallet.history(limit),
  ]);

  const findings = rules.flatMap((rule) => rule(notes as Note[]));

  const summary = findings.reduce(
    (acc, f) => { acc[f.severity]++; return acc; },
    { critical: 0, warn: 0, info: 0 }
  );

  return { walletAddress: address, notesScanned: notes.length, findings, summary };
}
