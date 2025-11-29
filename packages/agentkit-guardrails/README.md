# @trustless-agentkit/sdk

> Make your AI agents trustless with verifiable compute and memory.

[![npm version](https://img.shields.io/npm/v/@trustless-agentkit/sdk.svg)](https://www.npmjs.com/package/@trustless-agentkit/sdk)
[![Built for AgentKit](https://img.shields.io/badge/Built%20for-AgentKit-0052FF.svg)](https://github.com/coinbase/agentkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Trustless AgentKit extends [Coinbase AgentKit](https://docs.cdp.coinbase.com/agent-kit/welcome) with cryptographic guarantees:

- **Verifiable Inference**: zkML proofs that your agent ran its policy correctly ([Jolt Atlas](https://github.com/ICME-Lab/jolt-atlas))
- **Verifiable Memory**: On-chain vector database with tamper-proof storage ([Kinic](https://github.com/ICME-Lab/kinic-cli))

## Install

```bash
npm install @trustless-agentkit/sdk
```

## Quick Start (5 minutes)

### 1. Wrap any action with zkML verification

```typescript
import { withZkGuardrail } from '@trustless-agentkit/sdk';

// Your existing AgentKit action
const transferAction = agent.getAction('transfer');

// Wrap it with zkML guardrails
const verifiableTransfer = withZkGuardrail(transferAction, {
  policyModel: './models/spending-policy.onnx',
  proofMode: 'always',
});

// Execute - now includes cryptographic proof
const result = await verifiableTransfer({
  to: '0x...',
  amount: '100',
  asset: 'USDC',
});

console.log(result.guardrail.decision); // 'approve' | 'reject'
console.log(result.guardrail.proof);    // '0x...' zkML SNARK proof
```

### 2. Add verifiable memory

```typescript
import { AgentMemory, StorageType } from '@trustless-agentkit/sdk';

const memory = new AgentMemory({
  stores: [{ type: StorageType.Kinic, config: { canisterId: '...' } }],
});

// Store with zkML-verified embeddings
await memory.insert({
  content: 'User prefers low-risk investments',
  metadata: { type: 'preference', confidence: 0.95 },
});

// Semantic search across agent knowledge
const results = await memory.search({
  query: 'investment preferences',
  limit: 5,
});
```

### 3. Full A2A marketplace

```typescript
import { createMarketplace } from '@trustless-agentkit/sdk';

const marketplace = createMarketplace(signer, {
  erc8004: {
    identityRegistryAddress: '0x...',
    reputationRegistryAddress: '0x...',
    validationRegistryAddress: '0x...',
  },
  x402: { network: 'base-sepolia' },
});

// Discover agents via semantic search
const providers = await marketplace.discoverAgents({
  query: 'sentiment analysis for crypto',
  minTrustScore: 70,
});

// Execute with payment + proof
const result = await marketplace.executeService(providers[0].agentId, {
  serviceType: 'data-analysis',
  payload: { symbol: 'ETH' },
}, { requireProof: true });
```

## Why Trustless?

Without verifiable inference, an agent can *claim* anything. With zkML, it can *prove* it.

| Without Trustless | With Trustless |
|-------------------|----------------|
| Agent claims to run AI model | Agent runs model in zkVM |
| Could return hardcoded data | SNARK proves exact execution |
| No way to detect fraud | Fraud cryptographically impossible |

## Base Sepolia Contracts

- IdentityRegistry: `0x9A27Efa5B8Da14D336317f2c1b8827654a5c384f`
- ReputationRegistry: `0xaEf4e79A1f51F48b5E5206cBCc32fFe6549edd7E`
- ValidationRegistry: `0x15957085f167f181B55Dc2cae3eE019D427C9778`
- MemoryRegistry: `0x525D0c8908939303CD7ebEEf5A350EC5b6764451`

## Resources

- [Full Documentation](https://github.com/hshadab/coinbase)
- [AgentKit Docs](https://docs.cdp.coinbase.com/agent-kit/welcome)
- [Jolt Atlas (zkML)](https://github.com/ICME-Lab/jolt-atlas)
- [Kinic CLI](https://github.com/ICME-Lab/kinic-cli)

## License

MIT
