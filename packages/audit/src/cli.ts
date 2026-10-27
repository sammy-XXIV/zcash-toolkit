#!/usr/bin/env node
import { ZcashWallet, createMockAdapter } from "@zcash-agent-kit/core";
import { runAudit } from "./tracer.js";

async function main() {
  const seed = process.env.ZCASH_SEED;
  const network = (process.env.ZCASH_NETWORK as "mainnet" | "testnet") ?? "testnet";

  if (!seed) {
    console.error("Error: ZCASH_SEED env var required");
    process.exit(1);
  }

  const wallet = await ZcashWallet.fromSeed(seed, { network });
  const report = await runAudit(wallet);

  console.log(JSON.stringify(report, null, 2));

  if (report.summary.critical > 0) {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
