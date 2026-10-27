import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZcashWallet, createMockAdapter } from "@zcash-agent-kit/core";
import type { Note } from "@zcash-agent-kit/core";
import { noTransparentPool, memoPresence, dustThreshold, runAudit } from "../src/index.js";

const SEED = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("audit rules", () => {
  it("noTransparentPool flags transparent notes", () => {
    const notes: Note[] = [
      { txid: "abc1", amount: "0.1", memo: "test", pool: "transparent", confirmed: true, timestamp: 0 },
    ];
    const findings = noTransparentPool(notes);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, "critical");
    assert.match(findings[0].rule, /transparent/);
  });

  it("noTransparentPool passes orchard notes", () => {
    const notes: Note[] = [
      { txid: "abc2", amount: "0.1", memo: "test", pool: "orchard", confirmed: true, timestamp: 0 },
    ];
    assert.strictEqual(noTransparentPool(notes).length, 0);
  });

  it("memoPresence warns on empty memo", () => {
    const notes: Note[] = [
      { txid: "abc3", amount: "0.1", memo: "", pool: "orchard", confirmed: true, timestamp: 0 },
    ];
    const findings = memoPresence(notes);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, "warn");
  });

  it("dustThreshold warns on tiny amounts", () => {
    const notes: Note[] = [
      { txid: "abc4", amount: "0.000001", memo: "x", pool: "orchard", confirmed: true, timestamp: 0 },
    ];
    const findings = dustThreshold(notes);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, "warn");
  });
});

describe("runAudit", () => {
  it("returns a report with notesScanned and summary", async () => {
    const wallet = await ZcashWallet.fromSeed(SEED, { network: "testnet" }, createMockAdapter());
    const report = await runAudit(wallet);
    assert.ok(typeof report.notesScanned === "number");
    assert.ok("critical" in report.summary);
    assert.ok("warn" in report.summary);
    assert.ok(report.walletAddress.startsWith("u"));
  });
});
