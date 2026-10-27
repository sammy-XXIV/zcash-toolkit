import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ZcashWallet, createMockAdapter } from "../src/index.js";

const TEST_SEED =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("ZcashWallet (mock adapter)", () => {
  let wallet: ZcashWallet;

  before(async () => {
    wallet = await ZcashWallet.fromSeed(TEST_SEED, { network: "testnet" }, createMockAdapter());
  });

  after(() => wallet?.close());

  it("returns an address starting with 'u' from newAddress()", async () => {
    const addr = await wallet.newAddress({ pool: "orchard" });
    assert.match(addr, /^u/);
  });

  it("returns balance with orchard/sapling/transparent/total keys", async () => {
    const bal = await wallet.balance();
    assert.ok("orchard" in bal);
    assert.ok("sapling" in bal);
    assert.ok("transparent" in bal);
    assert.ok("total" in bal);
  });

  it("never produces a transparent address from newAddress()", async () => {
    const addr = await wallet.newAddress();
    assert.doesNotMatch(addr, /^t/);
  });

  it("sends to a shielded address and returns a txid", async () => {
    const txid = await wallet.send({ to: "u1testreceiver", amount: "0.001", memo: "test" });
    assert.strictEqual(typeof txid, "string");
    assert.ok(txid.length > 0);
  });

  it("refuses to send to a transparent address", async () => {
    await assert.rejects(
      wallet.send({ to: "t1transparentaddress", amount: "0.001" }),
      /transparent/i
    );
  });

  it("throws if newAddress() adapter returns a t-address", async () => {
    const badAdapter = createMockAdapter({
      newAddress: async () => "t1leaked_transparent_address",
    });
    const w = ZcashWallet.fromAdapter(badAdapter);
    await assert.rejects(w.newAddress(), /transparent/i);
  });

  it("returns a payment proof with viewingKeyProof for a sent txid", async () => {
    const txid = await wallet.send({ to: "u1testreceiver", amount: "0.002", memo: "proof-test" });
    const proof = await wallet.paymentProof(txid);
    assert.strictEqual(proof.txid, txid);
    assert.strictEqual(typeof proof.viewingKeyProof, "string");
    assert.ok(proof.viewingKeyProof.length > 0);
  });

  it("emits 'confirmed' event after a send", async () => {
    const notes: unknown[] = [];
    wallet.on("confirmed", (n) => notes.push(n));
    await wallet.send({ to: "u1eventtest", amount: "0.001", memo: "event" });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(notes.length > 0);
  });
});

describe("ZcashWallet.fromSeed fallback", () => {
  it("creates a wallet with mock adapter when no explicit adapter given (falls back on this platform)", async () => {
    const wallet = await ZcashWallet.fromSeed(TEST_SEED, { network: "testnet" });
    const addr = await wallet.newAddress();
    assert.match(addr, /^u/);
    await wallet.close();
  });
});
