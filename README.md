# zcash-toolkit

TypeScript monorepo giving AI agents private money via Zcash shielded transactions.

Built for ZECATHON 2026 — Core & Tooling track.

## Packages

| Package | Description |
|---------|-------------|
| `@zcash-toolkit/core` | `ZcashWallet` SDK — shielded send, balance, payment proofs |
| `@zcash-toolkit/x402` | HTTP 402 pay-per-call middleware + auto-paying `fetchWithPayment` |
| `@zcash-toolkit/agent` | MCP wallet server with spending policy for AI agents |
| `@zcash-toolkit/audit` | Privacy audit CLI — flags transparent pool usage, missing memos, dust |
| `@zcash-toolkit/gate` | React `<ZcashPaymentGate>` component |

## Quick start

```bash
# Install
pnpm install

# Run demo API server (mock wallet on Windows/Node 24)
ZCASH_SEED="your 24-word seed" npx tsx demo/server.ts

# Run MCP agent server
ZCASH_SEED="your 24-word seed" npx tsx demo/agent.ts

# Run privacy audit
ZCASH_SEED="your 24-word seed" npx zcash-audit
```

## Usage

### ZcashWallet (core)

```ts
import { ZcashWallet } from "@zcash-toolkit/core";

const wallet = await ZcashWallet.fromSeed(mnemonic, { network: "testnet" });
const addr = await wallet.newAddress();           // always u1... (Orchard)
const txid = await wallet.send({ to: addr, amount: "0.001", memo: "hi" });
const proof = await wallet.paymentProof(txid);   // selective disclosure
```

### x402 middleware

```ts
import { requirePayment, fetchWithPayment } from "@zcash-toolkit/x402";

// Server
app.get("/api/data", requirePayment({ recipient: "u1...", amount: "0.001" }), handler);

// Client (AI agent auto-pays the 402)
const res = await fetchWithPayment("http://localhost:3000/api/data", wallet);
```

### MCP agent server

```ts
import { startAgentServer } from "@zcash-toolkit/agent";

await startAgentServer({ wallet, policy: { maxPerTx: "0.1", dailyLimit: "1.0" } });
```

### Privacy audit

```bash
ZCASH_SEED="..." npx zcash-audit
# exits 2 if critical findings (transparent pool usage)
```

## Architecture

```
core (ZcashWallet)
  ├─ adapter-zcashjs.ts   real @zcashlabs/zcash.js  (Linux + Node 22.23.4)
  └─ adapter-mock.ts      in-memory                  (all other platforms)

x402    uses core  →  requirePayment + fetchWithPayment
agent   uses core  →  MCP tools + SpendingPolicyEngine
audit   uses core  →  runAudit + rules
gate    uses core  →  React ZcashPaymentGate + verify helpers
```

## Platform notes

- **Real transactions**: Linux + Node 22.23.4 required (zcash.js constraint)
- **Mock mode**: automatic fallback on Windows/macOS/Node 24+ — all tests pass, no real ZEC sent
- **Integration tests** (real lightwalletd): `RUN_INTEGRATION_TESTS=1 pnpm test`

## Privacy properties

- All sends are **shielded** — t-address recipients are refused at the API level
- `newAddress()` enforces Orchard pool — never returns a t-address
- `paymentProof()` uses viewing keys for selective disclosure without full wallet access
- Audit CLI flags any transparent-pool leakage as **critical**

## License

MIT
