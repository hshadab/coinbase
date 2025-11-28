# Jolt Atlas: Trust Layer for AgentKit

> **Every AI agent deserves a wallet. Every wallet deserves verifiable behavior.**

Built for [Coinbase AgentKit](https://github.com/coinbase/agentkit) | Extends [CDP Wallet](https://docs.cdp.coinbase.com/) | Integrates with [x402](https://github.com/coinbase/x402)

[![Built for AgentKit](https://img.shields.io/badge/Built%20for-AgentKit-0052FF.svg)](https://github.com/coinbase/agentkit)
[![x402 Compatible](https://img.shields.io/badge/x402-Compatible-00D632.svg)](https://github.com/coinbase/x402)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Jolt Atlas?

[AgentKit](https://docs.cdp.coinbase.com/agent-kit/welcome) gives agents wallets. **Jolt Atlas makes their actions verifiable.**

Coinbase is building the rails for [agentic commerce](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentkit)—AI agents that can transact autonomously. But as agents gain financial capability, a critical question emerges:

> *How do you trust an agent you didn't build?*

**Jolt Atlas answers this with cryptographic proof.** Using zero-knowledge machine learning (zkML), agents can prove they followed their stated policies without revealing sensitive data. No trust in operators required.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         AGENTIC COMMERCE STACK                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Your Agent (LangChain, OpenAI, Claude, etc.)                       │
│                            │                                          │
│                            ▼                                          │
│   ┌────────────────────────────────────────────┐                     │
│   │            JOLT ATLAS TRUST LAYER           │ ◀── You are here   │
│   │  ┌─────────┐ ┌─────────┐ ┌────────────────┐│                     │
│   │  │ zkML    │ │Identity │ │ Agent Memory   ││                     │
│   │  │ Proofs  │ │(ERC-721)│ │ (Kinic+Base)   ││                     │
│   │  └─────────┘ └─────────┘ └────────────────┘│                     │
│   └────────────────────────────────────────────┘                     │
│                            │                                          │
│                            ▼                                          │
│   ┌────────────────────────────────────────────┐                     │
│   │     AgentKit + CDP Wallet + x402           │                     │
│   │     Fast, free, global payments            │                     │
│   └────────────────────────────────────────────┘                     │
│                            │                                          │
│                            ▼                                          │
│                    Base / Ethereum                                    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## What You Get

| Feature | What It Does | Why It Matters for Agentic Commerce |
|---------|--------------|-------------------------------------|
| **zkML Guardrails** | Wrap any action with verifiable policy checks | Prove your agent followed rules without trusting you |
| **Agent Identity** | ERC-721 NFT per agent with reputation | Know who you're transacting with (ERC-8004 compliant) |
| **Trust Verification** | On-chain attestations of policy compliance | Agents can verify each other before transacting |
| **Agent Memory** | Kinic on-chain vector database | Verifiable agent knowledge with zkML proofs |
| **x402 Integration** | HTTP-native micropayments | Agents pay for APIs with 1 line of code (coming soon) |

## Quick Start

### 1. Wrap AgentKit Actions with zkML Guardrails

```typescript
import { withZkGuardrail } from '@jolt-atlas/agentkit-guardrails';
import { AgentKit } from '@coinbase/agentkit';

const agent = await AgentKit.from({ cdpApiKeyName: 'your-key' });

// Wrap any action with zkML verification
const safeTransfer = withZkGuardrail(
  agent.getAction('transfer'),
  {
    policyModel: './models/spending-policy.onnx',
    proofMode: 'always',  // Generate proof for every action
  }
);

// Execute with cryptographic proof of policy compliance
const result = await safeTransfer({
  to: '0x...',
  amount: '100',
  asset: 'USDC',
});

console.log(result.guardrail.decision);  // 'approve'
console.log(result.guardrail.proof);     // '0x...' zkML proof
```

### 2. Register Agent Identity (for A2A Commerce)

```typescript
import { AgentPaymentRails } from '@jolt-atlas/agentkit-guardrails';

const rails = new AgentPaymentRails(signer, {
  identityRegistryAddress: IDENTITY_REGISTRY,
  validationRegistryAddress: VALIDATION_REGISTRY,
});

// Mint ERC-721 identity NFT for your agent
const agentId = await rails.registerIdentity(
  modelCommitment,        // Hash of your policy model
  'ipfs://metadata...'    // Agent metadata
);
```

### 3. Pay Other Agents with Trust Verification

```typescript
// Only pay agents that meet trust requirements
const payment = await rails.payAgent({
  toAgentId: 42,
  amount: ethers.parseEther('10'),
  token: USDC_ADDRESS,
  trustRequirements: {
    minReputationScore: 70,     // Minimum reputation
    minZkmlApprovalRate: 80,    // 80%+ policy compliance
    requireZkmlProof: true,     // Fresh proof required
  },
});
```

### 4. Coming Soon: x402 Micropayments

```typescript
// Agent pays for API access using x402 protocol
// 1 line of code, no API keys, $0.001 minimum
const response = await x402Fetch('https://api.example.com/data', {
  paymentToken: USDC_ADDRESS,
  maxAmount: '0.01',
});
```

## Use Cases for Agentic Commerce

### Autonomous Shopping Agent
```typescript
const shopperAgent = withZkGuardrail(purchaseAction, {
  policyModel: './models/shopping-limits.onnx',
  // Trained on: budget, category, merchant reputation, time of day
});

// Every purchase generates cryptographic proof of policy compliance
// Users can verify their agent didn't overspend
```

### Multi-Agent Supply Chain
```typescript
// Warehouse agent pays delivery agent
// But only if delivery agent has verified credentials
await warehouseAgent.payAgent({
  toAgentId: deliveryAgentId,
  amount: deliveryFee,
  trustRequirements: {
    requiredCredentials: ['DeliveryLicense'],
    minZkmlApprovalRate: 90,
  },
});
```

### AI Data Marketplace
```typescript
// Escrow releases when zkML proves data quality
const escrow = await dataAgent.createEscrow({
  toAgentId: buyerAgentId,
  amount: dataPrice,
  releaseCondition: {
    type: 'zkml-attestation',
    modelCommitment: DATA_QUALITY_MODEL,
    minConfidence: 0.9,
  },
});
```

## Architecture

```
packages/agentkit-guardrails/    # TypeScript SDK
├── core/                        # withZkGuardrail wrapper
├── commerce/                    # AgentPaymentRails (A2A)
├── memory/                      # Kinic integration
└── proof/                       # zkML proof generation

contracts/src/erc8004/           # On-chain registries (Base Sepolia)
├── IdentityRegistry.sol         # ERC-721 agent NFTs
├── ReputationRegistry.sol       # Feedback scoring
├── ValidationRegistry.sol       # zkML attestations
└── MemoryRegistry.sol           # Knowledge commitments

services/kinic-service/          # On-chain vector database
prover-service/                  # Rust zkML prover (Jolt Atlas)
```

**Deployed on Base Sepolia:**
- IdentityRegistry: `0x9A27Efa5B8Da14D336317f2c1b8827654a5c384f`
- ValidationRegistry: `0x15957085f167f181B55Dc2cae3eE019D427C9778`
- MemoryRegistry: `0x525D0c8908939303CD7ebEEf5A350EC5b6764451`

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| zkML Proof Generation | ~2.4s | Real Jolt Atlas SNARK |
| Proof Verification | ~400ms | On-chain verifiable |
| A2A Payment (w/ proof) | ~3s | Includes trust check |

## Getting Started

```bash
# Install
npm install @jolt-atlas/agentkit-guardrails

# Or clone and build
git clone https://github.com/hshadab/coinbase
cd coinbase/packages/agentkit-guardrails
npm install && npm run build
```

### Running Services

```bash
# Prover service (zkML)
cd prover-service && cargo run

# Kinic memory service (requires Linux/WSL/Mac)
cd services/kinic-service && python main.py
```

See [`services/kinic-service/README.md`](services/kinic-service/README.md) for detailed setup including WSL instructions for Windows.

## Roadmap

- [x] zkML guardrails for AgentKit actions
- [x] ERC-8004 agent identity (ERC-721 NFTs)
- [x] Agent reputation and trust scoring
- [x] Kinic on-chain memory integration
- [ ] **x402 payment integration** ← Next
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

**The future is agentic. Give your agents wallets. Make their behavior verifiable.**

*An extension for [Coinbase AgentKit](https://github.com/coinbase/agentkit) | Powered by [Jolt Atlas zkML](https://github.com/ICME-Lab/jolt-atlas)*
