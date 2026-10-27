import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpendingPolicyEngine } from "../src/policy.js";

describe("SpendingPolicyEngine", () => {
  it("allows spend within limits", () => {
    const engine = new SpendingPolicyEngine({ maxPerTx: "1.0", dailyLimit: "5.0" });
    assert.strictEqual(engine.check("u1addr", "0.5"), null);
  });

  it("blocks spend over per-tx limit", () => {
    const engine = new SpendingPolicyEngine({ maxPerTx: "1.0", dailyLimit: "5.0" });
    const v = engine.check("u1addr", "1.5");
    assert.ok(v !== null);
    assert.match(v.reason, /per-tx limit/);
  });

  it("blocks spend that would exceed daily limit", () => {
    const engine = new SpendingPolicyEngine({ maxPerTx: "3.0", dailyLimit: "5.0" });
    engine.record("4.0");
    const v = engine.check("u1addr", "2.0");
    assert.ok(v !== null);
    assert.match(v.reason, /daily limit/);
  });

  it("blocks recipient not in allowlist", () => {
    const engine = new SpendingPolicyEngine({
      maxPerTx: "1.0",
      dailyLimit: "5.0",
      allowedRecipients: ["u1allowed"],
    });
    const v = engine.check("u1blocked", "0.5");
    assert.ok(v !== null);
    assert.match(v.reason, /allowlist/);
  });

  it("allows recipient in allowlist", () => {
    const engine = new SpendingPolicyEngine({
      maxPerTx: "1.0",
      dailyLimit: "5.0",
      allowedRecipients: ["u1allowed"],
    });
    assert.strictEqual(engine.check("u1allowed", "0.5"), null);
  });

  it("tracks daily spending after record()", () => {
    const engine = new SpendingPolicyEngine({ maxPerTx: "1.0", dailyLimit: "5.0" });
    engine.record("0.5");
    assert.strictEqual(engine.dailySpent, "0.50000000");
  });
});
