import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyPaymentProof, parsePaymentHeader } from "../src/verify.js";

const RECIPIENT = "u1testrecp000000000000000000000000000000000000000";
const AMOUNT = "0.001";

function makeProof(overrides: Record<string, string> = {}) {
  return {
    txid: "abc123",
    recipient: RECIPIENT,
    amount: AMOUNT,
    viewingKeyProof: "dGVzdA==",
    ...overrides,
  };
}

describe("verifyPaymentProof", () => {
  it("valid proof returns valid: true", () => {
    const result = verifyPaymentProof(makeProof(), RECIPIENT, AMOUNT);
    assert.strictEqual(result.valid, true);
  });

  it("wrong recipient returns invalid", () => {
    const result = verifyPaymentProof(makeProof({ recipient: "u1wrong" }), RECIPIENT, AMOUNT);
    assert.strictEqual(result.valid, false);
    assert.match(result.reason!, /recipient mismatch/);
  });

  it("amount too low returns invalid", () => {
    const result = verifyPaymentProof(makeProof({ amount: "0.0001" }), RECIPIENT, AMOUNT);
    assert.strictEqual(result.valid, false);
    assert.match(result.reason!, /amount too low/);
  });

  it("higher amount accepted", () => {
    const result = verifyPaymentProof(makeProof({ amount: "1.0" }), RECIPIENT, AMOUNT);
    assert.strictEqual(result.valid, true);
  });

  it("missing viewingKeyProof returns invalid", () => {
    const result = verifyPaymentProof(makeProof({ viewingKeyProof: "" }), RECIPIENT, AMOUNT);
    assert.strictEqual(result.valid, false);
    assert.match(result.reason!, /viewingKeyProof/);
  });
});

describe("parsePaymentHeader", () => {
  it("parses valid base64 JSON", () => {
    const proof = makeProof();
    const encoded = Buffer.from(JSON.stringify(proof)).toString("base64");
    const parsed = parsePaymentHeader(encoded);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed!.txid, "abc123");
  });

  it("returns null for invalid base64", () => {
    const parsed = parsePaymentHeader("not-valid-json!!!");
    assert.strictEqual(parsed, null);
  });
});
