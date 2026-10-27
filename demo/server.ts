/**
 * Demo: Express server with x402 ZEC payment gating.
 *
 * GET /free       — no payment required
 * GET /api/secret — requires 0.001 ZEC (testnet)
 *
 * Run: ZCASH_SEED="your seed" npx tsx server.ts
 */
import express from "express";
import { ZcashWallet, createMockAdapter } from "@zcash-agent-kit/core";
import { requirePayment } from "@zcash-agent-kit/x402";

const seed = process.env.ZCASH_SEED ?? "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const network = (process.env.ZCASH_NETWORK ?? "testnet") as "mainnet" | "testnet";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function main() {
  // On Windows/Node24 falls back to mock adapter automatically
  const wallet = await ZcashWallet.fromSeed(seed, { network }, createMockAdapter());
  const recipient = await wallet.newAddress({ pool: "orchard" });

  console.log(`Recipient address: ${recipient}`);

  const app = express();

  app.get("/free", (_req, res) => {
    res.json({ message: "No payment needed here!" });
  });

  app.get(
    "/api/secret",
    requirePayment({ recipient, amount: "0.001", network }),
    (_req, res) => {
      res.json({
        secret: "The Zcash shielded pool uses zk-SNARKs to prove validity without revealing sender, recipient, or amount.",
        source: "zcash-agent-kit demo",
      });
    }
  );

  app.listen(PORT, () => {
    console.log(`Demo server running at http://localhost:${PORT}`);
    console.log(`  GET /free       — open access`);
    console.log(`  GET /api/secret — requires 0.001 ZEC payment`);
  });
}

main().catch(console.error);
