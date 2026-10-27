import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requirePayment } from "../src/index.js";

const OPTS = {
  recipient: "u1testrecipient000000000000000000000000000000000000000000",
  amount: "0.001",
  network: "testnet" as const,
};

function makeApp() {
  const app = express();
  app.get("/api/data", requirePayment(OPTS), (_req, res) => {
    res.json({ data: "secret" });
  });
  return app;
}

function buildPaymentHeader(txid: string, amount: string): string {
  return Buffer.from(JSON.stringify({
    txid,
    recipient: OPTS.recipient,
    amount,
    viewingKeyProof: "dGVzdHZpZXdpbmdrZXlwcm9vZg==",
  })).toString("base64");
}

describe("requirePayment middleware", () => {
  it("returns 402 with payment details when no X-Payment header", async () => {
    const app = makeApp();
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        fetch(`http://localhost:${port}/api/data`)
          .then(async (r) => {
            const body = await r.text();
            server.close();
            resolve({ status: r.status, body });
          })
          .catch((e) => { server.close(); reject(e); });
      });
    });
    assert.strictEqual(res.status, 402);
    const parsed = JSON.parse(res.body) as { error: string; payment: { recipient: string } };
    assert.strictEqual(parsed.payment.recipient, OPTS.recipient);
  });

  it("passes through (200) when X-Payment header is valid", async () => {
    const app = makeApp();
    const payment = buildPaymentHeader("abc123txid", "0.001");
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        fetch(`http://localhost:${port}/api/data`, {
          headers: { "x-payment": payment },
        })
          .then(async (r) => {
            const body = await r.text();
            server.close();
            resolve({ status: r.status, body });
          })
          .catch((e) => { server.close(); reject(e); });
      });
    });
    assert.strictEqual(res.status, 200);
    const parsed = JSON.parse(res.body) as { data: string };
    assert.strictEqual(parsed.data, "secret");
  });

  it("returns 402 when payment amount is too low", async () => {
    const app = makeApp();
    const payment = buildPaymentHeader("abc123txid", "0.0001");
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        fetch(`http://localhost:${port}/api/data`, {
          headers: { "x-payment": payment },
        })
          .then((r) => { server.close(); resolve({ status: r.status }); })
          .catch((e) => { server.close(); reject(e); });
      });
    });
    assert.strictEqual(res.status, 402);
  });

  it("returns 402 when payment is for wrong recipient", async () => {
    const app = makeApp();
    const wrongPayment = Buffer.from(JSON.stringify({
      txid: "abc123",
      recipient: "u1wrongrecipient",
      amount: "0.001",
      viewingKeyProof: "proof",
    })).toString("base64");
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        fetch(`http://localhost:${port}/api/data`, {
          headers: { "x-payment": wrongPayment },
        })
          .then((r) => { server.close(); resolve({ status: r.status }); })
          .catch((e) => { server.close(); reject(e); });
      });
    });
    assert.strictEqual(res.status, 402);
  });
});
