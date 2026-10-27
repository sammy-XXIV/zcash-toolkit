import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ZcashWallet } from "@zcash-agent-kit/core";
import { SpendingPolicyEngine, type SpendingPolicy } from "./policy.js";
import { makeWalletTools } from "./tools.js";

export interface AgentServerOptions {
  wallet: ZcashWallet;
  policy?: SpendingPolicy;
}

const DEFAULT_POLICY: SpendingPolicy = {
  maxPerTx: "1.0",
  dailyLimit: "10.0",
};

export async function startAgentServer(opts: AgentServerOptions): Promise<void> {
  const policy = new SpendingPolicyEngine(opts.policy ?? DEFAULT_POLICY);
  const tools = makeWalletTools(opts.wallet, policy);

  const server = new Server(
    { name: "zcash-agent-kit", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_address",
        description: "Generate a new shielded ZEC receiving address",
        inputSchema: {
          type: "object",
          properties: {
            pool: { type: "string", enum: ["orchard", "sapling"], description: "Pool type (default: orchard)" },
          },
        },
      },
      {
        name: "get_balance",
        description: "Get wallet balance across all pools",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "send_zec",
        description: "Send ZEC to a shielded address (enforces spending policy)",
        inputSchema: {
          type: "object",
          required: ["to", "amount"],
          properties: {
            to: { type: "string", description: "Recipient shielded address (u1... or z...)" },
            amount: { type: "string", description: "Amount in ZEC (e.g. '0.001')" },
            memo: { type: "string", description: "Optional encrypted memo" },
          },
        },
      },
      {
        name: "payment_proof",
        description: "Generate a viewing-key payment proof for a transaction",
        inputSchema: {
          type: "object",
          required: ["txid"],
          properties: {
            txid: { type: "string", description: "Transaction ID" },
          },
        },
      },
      {
        name: "get_history",
        description: "Get recent transaction history",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max results (default: 10)" },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;
    let result: { content: Array<{ type: "text"; text: string }>; isError?: boolean };
    switch (name) {
      case "get_address":
        result = await tools.get_address(a as { pool?: "orchard" | "sapling" });
        break;
      case "get_balance":
        result = await tools.get_balance();
        break;
      case "send_zec":
        result = await tools.send_zec(a as { to: string; amount: string; memo?: string });
        break;
      case "payment_proof":
        result = await tools.payment_proof(a as { txid: string });
        break;
      case "get_history":
        result = await tools.get_history(a as { limit?: number });
        break;
      default:
        result = { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    return result as unknown as { content: Array<{ type: "text"; text: string }>; isError?: boolean };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
