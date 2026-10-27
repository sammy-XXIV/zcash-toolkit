/**
 * Demo: MCP wallet agent with spending policy.
 *
 * Starts an MCP server on stdio. Claude Desktop or any MCP client
 * can connect to get zcash_get_address, zcash_send, etc.
 *
 * Run: ZCASH_SEED="your seed" npx tsx agent.ts
 */
import { ZcashWallet, createMockAdapter } from "@zcash-agent-kit/core";
import { startAgentServer } from "@zcash-agent-kit/agent";

const seed = process.env.ZCASH_SEED ?? "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const network = (process.env.ZCASH_NETWORK ?? "testnet") as "mainnet" | "testnet";

async function main() {
  const wallet = await ZcashWallet.fromSeed(seed, { network }, createMockAdapter());

  await startAgentServer({
    wallet,
    policy: {
      maxPerTx: "0.1",
      dailyLimit: "1.0",
    },
  });
}

main().catch(console.error);
