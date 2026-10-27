import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ZcashWallet, createMockAdapter } from "@zcash-agent-kit/core";
import { SpendingPolicyEngine } from "../src/policy.js";
import { makeWalletTools } from "../src/tools.js";

describe("wallet tools", () => {
  let tools: ReturnType<typeof makeWalletTools>;

  before(async () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const wallet = await ZcashWallet.fromSeed(seed, { network: "testnet" }, createMockAdapter());
    const policy = new SpendingPolicyEngine({ maxPerTx: "1.0", dailyLimit: "10.0" });
    tools = makeWalletTools(wallet, policy);
  });

  it("get_address returns u-address", async () => {
    const result = await tools.get_address({});
    assert.ok(!result.isError);
    assert.match(result.content[0].text, /^u/);
  });

  it("get_balance returns JSON with orchard key", async () => {
    const result = await tools.get_balance();
    assert.ok(!result.isError);
    const bal = JSON.parse(result.content[0].text) as { orchard: string };
    assert.ok("orchard" in bal);
  });

  it("send_zec returns txid", async () => {
    const result = await tools.send_zec({ to: "u1receiver", amount: "0.001" });
    assert.ok(!result.isError);
    assert.match(result.content[0].text, /txid:/);
  });

  it("send_zec blocked by policy violation", async () => {
    const result = await tools.send_zec({ to: "u1receiver", amount: "999.0" });
    assert.ok(result.isError);
    assert.match(result.content[0].text, /Policy violation/);
  });

  it("payment_proof returns viewingKeyProof", async () => {
    const sendResult = await tools.send_zec({ to: "u1prooftest", amount: "0.001" });
    const txid = sendResult.content[0].text.replace("txid: ", "");
    const proofResult = await tools.payment_proof({ txid });
    assert.ok(!proofResult.isError);
    const proof = JSON.parse(proofResult.content[0].text) as { viewingKeyProof: string };
    assert.ok(proof.viewingKeyProof.length > 0);
  });
});
