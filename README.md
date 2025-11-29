# Trustless AgentKit

> **Every AI agent deserves a wallet. Every wallet deserves verifiable behavior.**

Built for [Coinbase AgentKit](https://github.com/coinbase/agentkit) | Extends [CDP Wallet](https://docs.cdp.coinbase.com/) | Integrates with [x402](https://github.com/coinbase/x402)

[![Built for AgentKit](https://img.shields.io/badge/Built%20for-AgentKit-0052FF.svg)](https://github.com/coinbase/agentkit)
[![x402 Compatible](https://img.shields.io/badge/x402-Compatible-00D632.svg)](https://github.com/coinbase/x402)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Trustless AgentKit?

[AgentKit](https://docs.cdp.coinbase.com/agent-kit/welcome) gives agents wallets. **Trustless AgentKit makes their behavior verifiable.**

Coinbase is building the rails for [agentic commerce](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentkit)—AI agents that can transact autonomously. But as agents gain financial capability, a critical question emerges:

> *How do you trust an agent you didn't build?*

**Trustless AgentKit answers this with two pillars:**

| Pillar | Technology | What It Provides |
|--------|------------|------------------|
| **Verifiable Inference** | zkML (Jolt Atlas) | Cryptographic proof that AI model inference ran correctly |
| **Verifiable Memory** | Kinic + Base | On-chain vector DB (Kinic) with Merkle commitments (Base) |

**Why both?** Verifiable inference alone proves the model ran correctly *now*, but says nothing about the context it used. Verifiable memory alone proves data wasn't tampered with, but says nothing about how it was processed. Together, they're mutually reinforcing: verified memories feed into verified inference, creating an end-to-end auditable chain from stored knowledge to final decision.

Together, they enable **trustless** agent-to-agent commerce—no trust in operators required.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                            TRUSTLESS AGENTKIT                                  │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   Your Agent (LangChain, OpenAI, Claude, etc.)                                │
│                            │                                                   │
│                            ▼                                                   │
│   ┌────────────────────────────────────────────────────────────────────────┐  │
│   │                    TRUSTLESS AGENTKIT LAYER                            │  │
│   │                                                                        │  │
│   │  ┌─────────────────────────┐    ┌─────────────────────────────────┐   │  │
│   │  │  VERIFIABLE INFERENCE   │    │       VERIFIABLE MEMORY         │   │  │
│   │  │      (zkML/Jolt)        │    │        (Kinic + Base)           │   │  │
│   │  ├─────────────────────────┤    ├─────────────────────────────────┤   │  │
│   │  │ • AI model runs in zkVM │    │ KINIC (Internet Computer)       │   │  │
│   │  │ • SNARK proves correct  │    │ • Actual memory storage         │   │  │
│   │  │   inference execution   │    │ • Vector embeddings (zkML)      │   │  │
│   │  │ • Policy model: ONNX    │    │ • Semantic search               │   │  │
│   │  │ • Proof: ~2.4s generate │    │                                 │   │  │
│   │  │                         │    │ BASE (Ethereum L2)              │   │  │
│   │  │ Proves: "This decision  │    │ • Merkle root commitments       │   │  │
│   │  │  came from THIS model   │    │ • Inclusion proofs              │   │  │
│   │  │  with THESE inputs"     │    │ • Attestations & credentials    │   │  │
│   │  │                         │    │                                 │   │  │
│   │  │                         │    │ Proves: "This memory existed    │   │  │
│   │  │                         │    │  at this time, unmodified"      │   │  │
│   │  └─────────────────────────┘    └─────────────────────────────────┘   │  │
│   │                      │                        │                       │  │
│   │                      └──────────┬─────────────┘                       │  │
│   │                                 ▼                                     │  │
│   │              ERC-8004 On-Chain Registries (Base)                      │  │
│   │     ┌─────────────┬─────────────────────┬──────────────────┐          │  │
│   │     │  Identity   │    Reputation       │   Validation     │          │  │
│   │     │  (ERC-721)  │  (Feedback scores)  │  (zkML proofs)   │          │  │
│   │     └─────────────┴─────────────────────┴──────────────────┘          │  │
│   └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                          │
│                                    ▼                                          │
│   ┌────────────────────────────────────────────────────────────────────────┐  │
│   │              AgentKit + CDP Wallet + x402 Payments                     │  │
│   │                    Fast, free, global transactions                     │  │
│   └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                          │
│                                    ▼                                          │
│                             Base / Ethereum                                   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Why Verifiability Matters

Without verifiable inference, agent commerce has a fatal flaw:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          THE ATTACK TRUSTLESS PREVENTS                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  WITHOUT Trustless AgentKit:              WITH Trustless AgentKit:              │
│  ─────────────────────────────            ───────────────────────               │
│  ✗ Agent claims to run AI model           ✓ Agent runs model in zkVM           │
│  ✗ Actually returns hardcoded data        ✓ SNARK proves exact execution       │
│  ✗ Buyer pays for fake analysis           ✓ Proof verified before payment      │
│  ✗ No way to detect fraud                 ✓ Fraud cryptographically impossible │
│  ✗ No recourse after payment              ✓ Full audit trail on Base           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

> **The core insight:** An agent can *claim* anything. With zkML, it can *prove* it.

## Base: The Trust Layer for the Agent Economy

As AgentKit scales to millions of agents, **Base becomes the trust infrastructure**:

| Component | Role | Why Base |
|-----------|------|----------|
| **Agent Identity** | ERC-721 NFT per agent | Portable across all Base apps |
| **Reputation Scores** | On-chain feedback history | Composable with DeFi/lending |
| **Validation Proofs** | zkML attestations stored | Permanent, verifiable record |
| **Memory Commitments** | Merkle roots for agent knowledge | Efficient, tamper-proof |

Every agent transaction builds on-chain reputation. Every zkML proof adds to the trust graph. **Base becomes the source of truth for agent trustworthiness.**

## Interactive Demo

See the full A2A transaction flow in action:

```bash
# Run the interactive web demo
cd demo && npx serve . -p 3000

# Then open http://localhost:3000
```

The demo shows:
- Agent discovery via Kinic semantic search
- Trust verification via ERC-8004 registries
- x402 micropayment flow
- zkML proof generation and verification
- Memory commitment updates on Base

## What You Get

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| **Verifiable Inference** | Wrap any action with zkML policy checks | Prove AI model ran correctly (Jolt Atlas SNARKs) |
| **Verifiable Memory** | Kinic storage + Base commitments | Kinic stores data, Base stores Merkle proofs |
| **Agent Identity** | ERC-721 NFT per agent with reputation | Know who you're transacting with (ERC-8004) |
| **Trust Verification** | On-chain attestations of policy compliance | Agents verify each other before transacting |
| **x402 Payments** | HTTP-native micropayments | Agents pay for services with 402 Payment Required |
| **Trustless Marketplace** | Full A2A commerce integration | Discover → Verify → Pay → Execute → Record |

## Quick Start

### The Full Trustless Example (zkML + Kinic)

```typescript
import {
  createMarketplace,
  withZkGuardrail,
  AgentMemory,
  StorageType,
} from '@trustless-agentkit/sdk';

// 1. Create marketplace with both verifiable compute and memory
const marketplace = createMarketplace(signer, {
  erc8004: {
    identityRegistryAddress: '0x...',
    reputationRegistryAddress: '0x...',
    validationRegistryAddress: '0x...',
  },
  x402: { network: 'base-sepolia' },
});

// 2. Initialize (registers agent identity on-chain)
await marketplace.initialize();

// 3. Register a service (stored in Kinic with zkML embeddings)
await marketplace.registerService({
  serviceType: 'data-analysis',
  description: 'AI-powered market analysis with ML',
  basePrice: '1000000', // 1 USDC
  endpoint: 'https://myagent.example/api/analyze',
  tags: ['analysis', 'ml', 'markets'],
});

// 4. Discover agents via Kinic semantic search
const providers = await marketplace.discoverAgents({
  query: 'sentiment analysis for crypto markets',
  minTrustScore: 70,
});

// 5. Execute service with x402 payment + zkML proof
const result = await marketplace.executeService(providers[0].agentId, {
  serviceType: 'data-analysis',
  payload: { symbol: 'ETH', timeframe: '24h' },
}, {
  requireProof: true,      // Require zkML proof
  postAttestation: true,   // Record on-chain
});

console.log(result.result);          // { sentiment: 'bullish', confidence: 0.87 }
console.log(result.proof);           // '0x...' zkML SNARK
console.log(result.attestationHash); // On-chain record
```

### Wrap AgentKit Actions with zkML + Kinic

```typescript
import { withZkGuardrail, AgentMemory, StorageType } from '@trustless-agentkit/sdk';
import { AgentKit } from '@coinbase/agentkit';

// Setup verifiable memory
const memory = new AgentMemory({
  stores: [{ type: StorageType.Kinic, config: { canisterId: '...' } }],
});
await memory.initialize();

// Wrap action with zkML guardrails
const safeTransfer = withZkGuardrail(
  agent.getAction('transfer'),
  {
    policyModel: './models/spending-policy.onnx',
    proofMode: 'always',
  }
);

// Execute with proof
const result = await safeTransfer({
  to: '0x...',
  amount: '100',
  asset: 'USDC',
});

// Store interaction in Kinic (verifiable memory)
await memory.insert({
  content: JSON.stringify({
    action: 'transfer',
    decision: result.guardrail.decision,
    proof: result.guardrail.proof,
  }),
  metadata: { type: 'transaction', timestamp: Date.now() },
});

// Later: semantic search across all interactions
const history = await memory.search({
  query: 'transfers over 100 USDC',
  limit: 10,
});
```

## Use Cases (All Include zkML + Kinic)

### 1. Autonomous Shopping Agent
```typescript
// Verifiable compute: zkML proves spending policy compliance
const guardrailedPurchase = withZkGuardrail(purchaseAction, {
  policyModel: './models/shopping-limits.onnx',
  proofMode: 'always',
});

// Verifiable memory: Kinic stores purchase history
await memory.insert({
  content: `Purchased ${item} for $${price}`,
  metadata: { type: 'purchase', category, merchant },
});

// User can verify: "Did my agent overspend?"
// - Check zkML proofs for each transaction
// - Search Kinic: "purchases over $100 this month"
```

### 2. Multi-Agent Supply Chain
```typescript
// Agent discovery via Kinic semantic search
const deliveryAgents = await marketplace.discoverAgents({
  query: 'licensed delivery service in NYC',
  minTrustScore: 90,
});

// Trust verification via ERC-8004
// - Identity: Is this a registered agent?
// - Reputation: What's their feedback score?
// - Validation: How many verified deliveries?

// Payment with proof
const payment = await marketplace.executeService(deliveryAgents[0].agentId, {
  serviceType: 'delivery',
  payload: { pickup: '...', dropoff: '...' },
}, { requireProof: true });

// Interaction stored in Kinic for future trust building
```

### 3. AI Data Marketplace
```typescript
// Data provider registers in marketplace (stored in Kinic)
await marketplace.registerService({
  serviceType: 'market-data',
  description: 'Real-time crypto market data with ML signals',
  basePrice: '500000', // 0.50 USDC per query
  tags: ['crypto', 'data', 'signals'],
});

// Buyer discovers via semantic search
const dataProviders = await marketplace.discoverAgents({
  query: 'crypto market signals with high accuracy',
});

// Execute with escrow released on zkML proof of data quality
const data = await marketplace.executeService(dataProviders[0].agentId, {
  serviceType: 'market-data',
  payload: { symbols: ['BTC', 'ETH'] },
}, {
  requireProof: true,  // zkML proves data quality model ran
});
```

## Architecture

```
packages/agentkit-guardrails/    # TypeScript SDK (@trustless-agentkit/sdk)
├── core/                        # withZkGuardrail - verifiable compute
├── memory/                      # AgentMemory - Kinic integration
├── commerce/                    # TrustlessMarketplace - A2A commerce
│   ├── agent-payment-rails.ts   # ERC-8004 registries
│   ├── x402-client.ts           # HTTP micropayments
│   └── trustless-marketplace.ts # Full integration
└── proof/                       # zkML proof generation

contracts/src/erc8004/           # On-chain registries (Base Sepolia)
├── IdentityRegistry.sol         # ERC-721 agent NFTs
├── ReputationRegistry.sol       # Feedback scoring
├── ValidationRegistry.sol       # zkML attestations
└── MemoryRegistry.sol           # Knowledge commitments

services/kinic-service/          # On-chain vector database (IC)
prover-service/                  # Rust zkML prover (Jolt Atlas)

demo/                            # Interactive web UI demo
└── index.html                   # Full A2A transaction visualization

examples/agentkit-demo/          # CLI demos
├── index.ts                     # Basic guardrails demo (zkML + Kinic)
├── marketplace-demo.ts          # Full A2A marketplace demo
├── memory-test.ts               # Kinic + Base integration test
└── merkle-test.ts               # Merkle proof step-by-step demo
```

**Deployed on Base Sepolia:**
- IdentityRegistry: `0x9A27Efa5B8Da14D336317f2c1b8827654a5c384f`
- ReputationRegistry: `0xaEf4e79A1f51F48b5E5206cBCc32fFe6549edd7E`
- ValidationRegistry: `0x15957085f167f181B55Dc2cae3eE019D427C9778`
- MemoryRegistry: `0x525D0c8908939303CD7ebEEf5A350EC5b6764451`

## Memory Integrity (Merkle Proofs)

Base stores **memory commitments** (Merkle roots), not actual data. This allows efficient verification that a memory exists without storing all memories on-chain.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MERKLE TREE FOR AGENT MEMORY                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                            [ROOT]                                           │
│                     0x73bd706f4ebc...                                       │
│                    ↙                 ↘                                      │
│              [BRANCH]              [BRANCH]                                 │
│         0x58a4dc78023f...     0x8e406bf0b6b5...                             │
│           ↙        ↘            ↙         ↘                                 │
│       [LEAF]    [LEAF]     [LEAF]      [LEAF]                              │
│     Memory 1   Memory 2   Memory 3   Memory 4                              │
│                                                                             │
│  • ROOT stored on Base (MemoryRegistry)                                    │
│  • LEAVES (memories) stored in Kinic                                       │
│  • PROOF = sibling hashes from leaf to root                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow

1. **Memory Insert (Kinic)**: Store content + embedding in IC canister
2. **Compute Hash**: `contentHash = keccak256(memory content)`
3. **Update Merkle Tree**: Add hash as leaf, recompute root
4. **Store Root on Base**: `MemoryRegistry.updateCommitment(agentId, newRoot, count, zkProof)`
5. **Prove Memory Exists**: Generate proof (sibling hashes), verify against stored root

### Security Properties

| Property | Guarantee |
|----------|-----------|
| **Can't fake a memory** | Would need to find hash collision (cryptographically impossible) |
| **Can't modify memory** | Root would change, detected on verification |
| **Can't delete memory** | Root would change, detected on verification |
| **Efficient proofs** | O(log n) size - only ~20 hashes needed for 1M memories |

### Test Merkle Proofs

```bash
# Run the step-by-step Merkle proof test
pnpm --filter trustless-agentkit-demo merkle
```

This demonstrates:
- Building a Merkle tree from memory hashes
- Generating inclusion proofs
- Verifying proofs match stored root
- Detecting tampered content
- Updating root when adding new memories

## Running the Demos

```bash
# Clone and install
git clone https://github.com/hshadab/coinbase
cd coinbase && pnpm install

# Build SDK
pnpm --filter @trustless-agentkit/sdk build

# Run basic demo (zkML + Kinic)
pnpm --filter trustless-agentkit-demo demo

# Run marketplace demo (full A2A with zkML + Kinic + x402)
pnpm --filter trustless-agentkit-demo marketplace

# Run memory test (Kinic + Base integration)
pnpm --filter trustless-agentkit-demo memory

# Run Merkle proof demo (step-by-step)
pnpm --filter trustless-agentkit-demo merkle
```

### Running Services

```bash
# Prover service (zkML - Jolt Atlas)
cd prover-service && cargo run

# Kinic memory service (requires Linux/WSL/Mac)
cd services/kinic-service && python main.py
```

See [`services/kinic-service/README.md`](services/kinic-service/README.md) for detailed setup.

## Performance

| Operation | Time | Component |
|-----------|------|-----------|
| zkML Proof Generation | ~2.4s | Jolt Atlas SNARK |
| Kinic Embedding + Insert | ~800ms | On-chain vector DB |
| Kinic Semantic Search | ~200ms | Vector similarity |
| Full A2A Transaction | ~4s | Discovery → Pay → Execute → Record |

## Roadmap

- [x] Verifiable inference (zkML) for AgentKit actions
- [x] Verifiable memory (Kinic + Base Merkle proofs)
- [x] ERC-8004 agent identity (ERC-721 NFTs)
- [x] Agent reputation and trust scoring
- [x] x402 payment integration
- [x] Trustless Marketplace (full A2A)
- [ ] On-chain zkML verification
- [ ] Cross-chain agent identity

## Resources

- [AgentKit Documentation](https://docs.cdp.coinbase.com/agent-kit/welcome)
- [x402 Payment Protocol](https://github.com/coinbase/x402)
- [ERC-8004 Trustless Agents](https://8004.org)
- [Kinic AI Memory](https://kinic.io)

## Contributing

Building the trust layer for the agent economy. PRs welcome!

## License

MIT

---

**The future is agentic. Make your agents trustless.**

*Verifiable Inference (zkML) + Verifiable Memory (Kinic + Base) = Trustless AgentKit*
