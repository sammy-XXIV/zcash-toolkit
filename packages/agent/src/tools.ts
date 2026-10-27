import type { ZcashWallet } from "@zcash-agent-kit/core";
import type { SpendingPolicyEngine } from "./policy.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function err(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

export function makeWalletTools(wallet: ZcashWallet, policy: SpendingPolicyEngine) {
  return {
    async get_address(args: { pool?: "orchard" | "sapling" }): Promise<ToolResult> {
      try {
        const addr = await wallet.newAddress({ pool: args.pool ?? "orchard" });
        return ok(addr);
      } catch (e) {
        return err(String(e));
      }
    },

    async get_balance(): Promise<ToolResult> {
      try {
        const bal = await wallet.balance();
        return ok(JSON.stringify(bal, null, 2));
      } catch (e) {
        return err(String(e));
      }
    },

    async send_zec(args: { to: string; amount: string; memo?: string }): Promise<ToolResult> {
      const violation = policy.check(args.to, args.amount);
      if (violation) {
        return err(`Policy violation: ${violation.reason}`);
      }
      try {
        const txid = await wallet.send({ to: args.to, amount: args.amount, memo: args.memo });
        policy.record(args.amount);
        return ok(`txid: ${txid}`);
      } catch (e) {
        return err(String(e));
      }
    },

    async payment_proof(args: { txid: string }): Promise<ToolResult> {
      try {
        const proof = await wallet.paymentProof(args.txid);
        return ok(JSON.stringify(proof, null, 2));
      } catch (e) {
        return err(String(e));
      }
    },

    async get_history(args: { limit?: number }): Promise<ToolResult> {
      try {
        const notes = await wallet.history(args.limit ?? 10);
        return ok(JSON.stringify(notes, null, 2));
      } catch (e) {
        return err(String(e));
      }
    },
  };
}
