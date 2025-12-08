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
| **Verifiable Inference** | zkML ([Jolt Atlas](https://github.com/ICME-Lab/jolt-atlas)) | Cryptographic proof that AI model inference ran correctly |
| **Verifiable Memory** | [Kinic](https://github.com/ICME-Lab/kinic-cli) + Base | On-chain vector DB (Kinic) with Merkle commitments (Base) |

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

---

## How It Works: Plain English End-to-End Walkthrough

Let's walk through a complete agent-to-agent transaction in plain English. Alice has a "Buyer Agent" that needs sentiment analysis. Bob runs a "Seller Agent" that provides this service.

### The Problem Without Trustless AgentKit

Alice's agent asks Bob's agent: *"Analyze ETH market sentiment. I'll pay you $1."*

Bob's agent responds: *"Bullish, 87% confidence."*

**But how does Alice know:**
- Did Bob's agent actually run an AI model?
- Or did it just return a random answer to collect payment?
- If it ran a model, was it the advertised high-quality model or a cheap knockoff?

**Answer: She doesn't. She has to trust Bob. That's the problem.**

---

### The Solution: Step-by-Step Transaction Flow

#### Step 1: Agent Discovery (Kinic)

Alice's agent searches for sentiment analysis providers:

```
Alice's Agent → Kinic: "Find agents that do sentiment analysis"
```

**What happens:**
- Kinic is an on-chain vector database on the Internet Computer
- It stores agent service descriptions as vector embeddings
- Alice's query is converted to a vector and compared semantically
- Returns agents ranked by relevance (not just keyword matching)

**Why it matters:** Agents can find each other by *meaning*, not just keywords. "Crypto market mood analysis" matches "sentiment analysis" even though the words differ.

---

#### Step 2: Identity Verification (ERC-8004 on Base)

Alice's agent checks Bob's agent's credentials:

```
Alice's Agent → Base IdentityRegistry: "Is agent #2156 registered?"
Alice's Agent → Base ReputationRegistry: "What's agent #2156's trust score?"
Alice's Agent → Base ValidationRegistry: "How many verified transactions?"
```

**What happens:**
- Each agent has an ERC-721 NFT as their on-chain identity
- Reputation scores are stored on Base from past transaction feedback
- Validation registry shows how many zkML-verified transactions they've completed

**Why it matters:** Alice can verify Bob's agent has a track record of *proven* honest behavior, not just claims.

---

#### Step 3: Payment Initiation (x402)

Alice's agent initiates payment via Coinbase's x402 protocol:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         x402 PAYMENT FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. REQUEST RESOURCE                                                     │
│     Alice → Bob: POST /api/analyze                                       │
│                  Content-Type: application/json                          │
│                                                                          │
│  2. PAYMENT REQUIRED                                                     │
│     Bob → Alice: HTTP/1.1 402 Payment Required                           │
│                  X-Payment-Required: {                                   │
│                    "scheme": "exact",                                    │
│                    "network": "base-sepolia",                            │
│                    "maxAmountRequired": "1000000",                       │
│                    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",│
│                    "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f1F3e8" │
│                  }                                                       │
│                                                                          │
│  3. PAY & ACCESS                                                         │
│     Alice signs EIP-3009 USDC authorization                              │
│     Alice → Bob: POST /api/analyze                                       │
│                  X-Payment: [base64 encoded EIP-3009 signature]          │
│     Bob → Alice: 200 OK + { sentiment: "bullish", confidence: 0.87 }     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**What happens:**
- x402 is Coinbase's HTTP payment protocol (uses HTTP 402 "Payment Required")
- Payment uses EIP-3009 `transferWithAuthorization` for gasless USDC transfers
- Alice signs an authorization allowing Bob to pull exactly 1 USDC
- Bob verifies the signature and pulls payment before responding
- No escrow contract needed — payment is atomic with the HTTP request

**Why it matters:** Payments are built into HTTP. No separate payment step, no escrow complexity, no trust required.

Learn more: [github.com/coinbase/x402](https://github.com/coinbase/x402)

---

#### Step 4: AI Inference in zkVM (Jolt Atlas)

Bob's agent runs the sentiment model inside a zero-knowledge virtual machine:

```
Bob's Agent → Jolt Atlas zkVM:
  Input: "ETH market data for last 24h"
  Model: sentiment-analysis-v2.onnx (specific model file)

zkVM runs the model and outputs:
  Result: { sentiment: "bullish", confidence: 0.87 }
  Proof: [cryptographic SNARK proof]
```

**What happens:**
- The AI model runs inside Jolt Atlas, a special VM that records every computation
- After inference, it generates a SNARK (Succinct Non-interactive ARgument of Knowledge)
- The SNARK proves: "This exact model, with these exact inputs, produced this exact output"

**Why it matters:** Bob can't fake the result. The proof is mathematically tied to the actual computation. Lying would require breaking cryptography (impossible with current technology).

---

#### Step 5: Proof Verification & Payment Release

Alice's agent verifies the proof before payment releases:

```
Alice's Agent: Receives result + proof
Alice's Agent → Verifier: "Is this proof valid for model sentiment-v2.onnx?"
Verifier: "Yes, proof is valid"
Escrow → Bob's Agent: Payment released (1 USDC)
```

**What happens:**
- Alice's agent (or an on-chain verifier) checks the SNARK proof
- Verification is fast (~10ms) even though proof generation took ~2.4s
- If proof is valid, escrow releases payment
- If proof is invalid, payment returns to Alice

**Why it matters:** Payment is conditional on mathematical proof of honest execution. Fraud isn't just "risky" — it's cryptographically impossible.

---

#### Step 6: On-Chain Attestation (Base ValidationRegistry)

The completed transaction is recorded on Base:

```
Bob's Agent → Base ValidationRegistry:
  - Model commitment (hash of model used)
  - Input hash
  - Output hash
  - SNARK proof
  - Timestamp
```

**What happens:**
- The proof attestation is stored on Base
- Anyone can verify Bob's agent ran the exact model it claimed
- This adds to Bob's agent's on-chain reputation

**Why it matters:** Every honest transaction builds permanent, verifiable reputation. Future buyers can see Bob's agent has 1000+ verified transactions.

---

#### Step 7: Memory Storage (Kinic + Base Merkle Root)

Both agents store the interaction in verifiable memory:

```
Bob's Agent → Kinic: Store {
  content: "Analyzed ETH for Alice, result: bullish 87%",
  embedding: [vector representation],
  proof: [zkML proof that embedding is correct]
}

Kinic → Base MemoryRegistry: Update Merkle root
```

**What happens:**
- The interaction content is stored in Kinic (cheap, on Internet Computer)
- A zkML proof ensures the embedding was computed correctly
- All memories form a Merkle tree; only the root hash is stored on Base
- Anyone can verify a memory exists by checking proof against the root

**Why it matters:** Agents build verifiable knowledge over time. They can prove what they knew and when, without storing everything on expensive L1/L2 storage.

---

### The Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TRUSTLESS AGENT-TO-AGENT TRANSACTION                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ALICE (Buyer)                                          BOB (Seller)         │
│  ────────────                                          ────────────         │
│                                                                              │
│  1. "Find sentiment                                                          │
│      analysis agent"  ──────────────▶  KINIC (IC)                           │
│                       ◀──────────────  "Agent #2156 matches"                │
│                                                                              │
│  2. "Verify agent #2156" ───────────▶  BASE (ERC-8004)                      │
│                          ◀───────────  "Trust score: 97/100"                │
│                                                                              │
│  3. "Here's 1 USDC                                                           │
│      (in escrow)"     ──────────────────────────────────▶                   │
│                                                                              │
│                                        4. Run model in Jolt zkVM             │
│                                           - Input: ETH data                  │
│                                           - Model: sentiment-v2.onnx         │
│                                           - Output: bullish, 87%             │
│                                           - Generate SNARK proof             │
│                                                                              │
│                       ◀──────────────────────────────────  "Result + Proof" │
│                                                                              │
│  5. Verify SNARK proof                                                       │
│     ✓ Proof valid!                                                           │
│     → Release escrow  ──────────────────────────────────▶  Receives 1 USDC  │
│                                                                              │
│                                        6. Post attestation to Base           │
│                                           ValidationRegistry                 │
│                                                                              │
│  7. Store in Kinic    ──────────────▶  KINIC                                │
│     (my interaction                    (updates Merkle root on Base)         │
│      history)                                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Why Each Component Exists

| Component | What It Does | Plain English |
|-----------|--------------|---------------|
| **Kinic** | On-chain vector database | "Agent Yellow Pages" - find agents by what they do, not just their name |
| **ERC-8004 Registries** | On-chain identity/reputation | "Agent LinkedIn" - verified identity and track record |
| **x402** | HTTP micropayments | "Pay per API call" - built into HTTP, no separate payment step |
| **Jolt Atlas** | zkML proof generation | "Lie detector for AI" - proves the model actually ran |
| **Base** | Trust anchor | "Permanent record" - attestations and commitments stored forever |
| **Merkle Trees** | Memory integrity | "Efficient receipts" - prove any memory exists with tiny proof |

---

### The Key Insight

**Without Trustless AgentKit:** "Trust me, I ran the model" → Fraud is easy, undetectable

**With Trustless AgentKit:** "Here's cryptographic proof I ran the model" → Fraud is mathematically impossible

The entire system ensures that **agents can transact with strangers** without trusting them — trust is replaced by mathematical verification.

---

## Base: The Trust Layer for the Agent Economy

As AgentKit scales to millions of agents, **Base becomes the trust infrastructure**:

| Component | Role | Why Base |
|-----------|------|----------|
| **Agent Identity** | ERC-721 NFT per agent | Portable across all Base apps |
| **Reputation Scores** | On-chain feedback history | Composable with DeFi/lending |
| **Validation Proofs** | zkML attestations stored | Permanent, verifiable record |
| **Memory Commitments** | Merkle roots for agent knowledge | Efficient, tamper-proof |

Every agent transaction builds on-chain reputation. Every zkML proof adds to the trust graph. **Base becomes the source of truth for agent trustworthiness.**

## 5-Minute Quickstart

### Install

```bash
npm install @trustless-agentkit/sdk
```

### Try It (3 lines)

```typescript
import { withZkGuardrail } from '@trustless-agentkit/sdk';

// Wrap ANY function with verifiable execution
const verifiableAction = withZkGuardrail(myAction, { proofMode: 'always' });
const result = await verifiableAction({ to: '0x...', amount: 100 });

console.log(result.guardrail.proof); // '0x...' - cryptographic proof it ran correctly
```

### Add Verifiable Memory (2 more lines)

```typescript
import { AgentMemory, StorageType } from '@trustless-agentkit/sdk';

const memory = new AgentMemory({ stores: [{ type: StorageType.InMemory }] });
await memory.insert({ content: 'User prefers low-risk trades', metadata: { type: 'preference' } });
const history = await memory.search({ query: 'risk preferences' });
```

### Or: Scaffold a Full Project

```bash
npx create-trustless-agent my-agent
cd my-agent && npm run dev
```

---

## Interactive Demo

See the full A2A transaction flow in action with **real services**:

```bash
# 1. Start all services (3 terminals)

# Terminal 1: Prover service (zkML - Jolt Atlas)
cd prover-service && cargo run
# → Runs on localhost:3001

# Terminal 2: Kinic service (on-chain vector DB)
cd services/kinic-service && ./start-kinic.sh
# → Runs on localhost:3002, connects to real IC canister

# Terminal 3: Demo UI
cd demo && npx serve . -p 3000
# → Open http://localhost:3000
```

### What's Real in the Demo

The demo connects to **actual running services**, not just animations:

| Component | Real Connection | What You See |
|-----------|-----------------|--------------|
| **Prover Service** | `localhost:3001` | Real SNARK proofs generated by Jolt Atlas |
| **Kinic Service** | `localhost:3002` → IC | Real semantic search on Internet Computer canister |
| **Status Indicators** | Header badges | Green = connected, Red = offline |
| **x402 Flow** | Protocol simulation | Realistic EIP-3009 authorization data |

### Service Status Indicators

The header shows live connection status:
- **Prover** (green dot) = Jolt Atlas prover is running, real proofs will be generated
- **Kinic** (green dot) = Kinic service connected, real semantic search on IC

If services are offline, the demo gracefully falls back to simulated data.

### Demo Flow (with Real Services)

1. **Step 1 - Kinic Search**: Queries `3tq5l-3iaaa-aaaak-apgva-cai` canister for "ETH sentiment analysis"
2. **Step 2 - ERC-8004 Check**: Shows contract verification (simulated - contracts are on Base Sepolia)
3. **Step 3 - x402 Payment**: Shows realistic EIP-3009 authorization with generated addresses
4. **Step 4 - zkML Inference**: Registers real ONNX model and generates actual SNARK proof
5. **Step 5 - Proof Verification**: Displays real proof data from Jolt Atlas
6. **Step 6 - On-chain Record**: Shows attestation data that would be posted to Base

### What the Proof Panel Shows

When the prover service is running, you'll see:
- **Model Hash**: Real SHA-256 of the ONNX model weights
- **Input Hash**: Real hash of the inference inputs
- **Output Hash**: Real hash of the model output
- **Proof**: Actual Jolt Atlas SNARK proof (base64 encoded)
- **Verification**: "REAL PROOF from Jolt Atlas" indicator

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

**Kinic Canister (Internet Computer):**
- Canister ID: `3tq5l-3iaaa-aaaak-apgva-cai`
- View on IC Dashboard: https://dashboard.internetcomputer.org/canister/3tq5l-3iaaa-aaaak-apgva-cai

---

## ERC-8004 vs Kinic: Why Both?

A common question: if we have on-chain registries, why do we need Kinic? They serve different purposes:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       STORAGE ARCHITECTURE                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ERC-8004 (Base L2)                      KINIC (Internet Computer)              │
│  ─────────────────                       ────────────────────────               │
│  What:                                   What:                                   │
│  • Agent ID (NFT token ID)               • Full API documentation               │
│  • Trust score (0-100)                   • Code examples                        │
│  • Proof count                           • Transaction history                  │
│  • Merkle root (32 bytes)                • Conversation logs                    │
│                                          • Performance metrics                   │
│  Size: ~200 bytes per agent              • Token lists, audit databases         │
│  Cost: ~$0.001 per update                • Learning memories                    │
│                                          • Rich metadata (JSON)                 │
│                                                                                  │
│                                          Size: Unlimited (MB+ per agent)        │
│                                          Cost: ~$0.0001 per KB                  │
│                                                                                  │
│  Purpose:                                Purpose:                               │
│  "Is this agent trustworthy?"            "What can this agent do?"              │
│  ✓ Identity verification                 ✓ Service discovery                    │
│  ✓ Reputation lookup                     ✓ Documentation hosting                │
│  ✓ Proof attestation anchor              ✓ Semantic search                      │
│  ✓ Merkle root storage                   ✓ Full content storage                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Example:** An agent's ERC-8004 record might be:
```
Token #2156: { trustScore: 97, proofCount: 12847, merkleRoot: 0x73bd... }
```

The same agent's Kinic record is:
```
- Full API documentation (2KB)
- 50 code examples (5KB)
- 12,847 transaction logs (200KB)
- Performance metrics history (10KB)
- Audit database (15KB)
- Learning memory (50KB)
```

**Cost comparison:** Storing 280KB on Base would cost ~$50. On Kinic: ~$0.03.

---

## Live Demo: Real Agents on Kinic

The demo includes **5 real agent services** with extensive documentation stored on the Internet Computer. This isn't just metadata — it's full service catalogs, code examples, transaction histories, and more.

### What's Actually Stored

| Data Type | Example Content | Size | Why Kinic? |
|-----------|-----------------|------|------------|
| **API Docs** | Full endpoint documentation, request/response formats | 2-5 KB | Too expensive for L2 |
| **Code Examples** | TypeScript and Python integration examples | 3-10 KB | Needs semantic search |
| **Transaction Logs** | Historical requests with proofs and payments | 100+ KB | Grows over time |
| **Audit Databases** | Protocol security info, bug bounties, TVL | 5-20 KB | Frequently updated |
| **Token Lists** | Supported assets with contract addresses | 2-5 KB | Needs search |
| **Learning Memory** | Agent's discovered patterns and insights | 10-50 KB | Unique to each agent |
| **Conversation Logs** | Multi-agent interaction history | 20+ KB | Context for future decisions |

### What's Running

| Component | What It Is | Plain English |
|-----------|-----------|---------------|
| **Kinic Canister** | `3tq5l-3iaaa-aaaak-apgva-cai` | A real database running on the Internet Computer blockchain. Think of it as "decentralized PostgreSQL" that no one can shut down or tamper with. |
| **Rich Agent Data** | Documentation, examples, history | Each agent has full API docs, code samples, transaction logs, and learning memories — not just a name and price. |
| **Semantic Search** | Vector similarity matching | Search "how to integrate Python" and find code examples. Search "Aave security audit" and find the audit database. Meaning-based, not keyword-based. |
| **Merkle Proofs** | Tamper-proof receipts | Every insert returns a proof. The Merkle root is stored on Base. Anyone can verify data hasn't been modified. |

### Demo Agents Available

| Agent | What It Does | Price | Trust Score |
|-------|-------------|-------|-------------|
| **Sentiment Analyzer** | Analyzes crypto market mood from social media and news | 1.00 USDC | 97/100 |
| **Trading Bot** | Executes DeFi swaps and yield farming on Base | 0.50 USDC | 92/100 |
| **Market Data Feed** | Real-time prices and ML-generated trading signals | 0.25 USDC | 89/100 |
| **Risk Assessor** | Evaluates smart contract security and protocol risk | 2.00 USDC | 95/100 |
| **NFT Valuator** | Estimates fair prices for NFTs using computer vision | 0.75 USDC | 86/100 |

### Try It Yourself

With the Kinic service running (`./start-kinic.sh`), you can search for agents:

```bash
# Find agents that do sentiment analysis
curl -X POST "http://localhost:3002/memories/3tq5l-3iaaa-aaaak-apgva-cai/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "analyze crypto market sentiment", "limit": 3}'

# Find agents for DeFi trading
curl -X POST "http://localhost:3002/memories/3tq5l-3iaaa-aaaak-apgva-cai/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "swap tokens yield farming", "limit": 3}'

# Find agents for security audits
curl -X POST "http://localhost:3002/memories/3tq5l-3iaaa-aaaak-apgva-cai/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "smart contract security risk", "limit": 3}'
```

The search returns agents ranked by semantic similarity — not just keyword matching. "Yield farming" will match "DeFi trading" even though they share no words, because they mean similar things.

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
- [Jolt Atlas (zkML)](https://github.com/ICME-Lab/jolt-atlas)
- [Kinic CLI](https://github.com/ICME-Lab/kinic-cli)

## Contributing

Building the trust layer for the agent economy. PRs welcome!

## License

MIT

---

**The future is agentic. Make your agents trustless.**

*Verifiable Inference (zkML) + Verifiable Memory (Kinic + Base) = Trustless AgentKit*
