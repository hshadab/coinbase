# Jolt Atlas AgentKit Guardrails

> **The cryptographic trust layer for AgentKit agents**: Prove your agent ran the policy it claimed, before it moves money onchain.

[![npm version](https://img.shields.io/npm/v/@jolt-atlas/agentkit-guardrails)](https://www.npmjs.com/package/@jolt-atlas/agentkit-guardrails)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

Jolt Atlas AgentKit Guardrails adds **zkML (zero-knowledge machine learning) guardrails** to [Coinbase AgentKit](https://github.com/coinbase/agentkit) agents. Every action your agent takes can be verified against a policy model with cryptographic proofs.

```
Agent Action → Policy Model → ZK Proof → Attestation → Execute (or Block)
```

### Why This Matters

As AI agents gain the ability to move money autonomously (via AgentKit), you need more than rate limits. You need **cryptographic proof** that your agent followed the policy it was supposed to follow.

- **Auditability**: Every decision is provable and attestable
- **Trust**: Users can verify agent behavior without trusting the operator
- **Compliance**: Generate verifiable evidence of policy enforcement
- **Safety**: Block unauthorized actions before they hit the chain

## Installation

```bash
npm install @jolt-atlas/agentkit-guardrails
```

## Quick Start

```typescript
import { withZkGuardrail } from '@jolt-atlas/agentkit-guardrails';
import { AgentKit } from '@coinbase/agentkit';

// Initialize AgentKit
const agent = await AgentKit.from({ walletProvider: cdpWallet });

// Wrap any action with zkML guardrails
const guardrailedTransfer = withZkGuardrail(
  agent.getAction('transfer'),
  {
    policyModel: './models/tx-authorization.onnx',
    proofMode: 'always',
    onModelReject: 'block',
  }
);

// Action is now protected - no proof, no tx
const result = await guardrailedTransfer({
  to: '0x...',
  amount: '100',
  asset: 'USDC',
});

console.log(result.guardrail.decision);    // 'approve'
console.log(result.guardrail.proof);       // '0x...'
console.log(result.guardrail.attestation); // Signed attestation
```

## Core Concepts

### Policy Models

Policy models are ONNX neural networks that evaluate whether an action should be allowed. They take features extracted from the action context and output a decision (approve/reject/review).

```typescript
const config = {
  policyModel: {
    path: './models/tx-authorization.onnx',
    threshold: 0.7,  // Confidence threshold
    name: 'Transaction Authorization v1',
  },
  // ...
};
```

### Proof Modes

Control when ZK proofs are generated:

| Mode | Description |
|------|-------------|
| `always` | Generate proof for every action |
| `on-reject` | Only generate proof when action is rejected |
| `on-approve` | Only generate proof when action is approved |
| `never` | Disable proof generation (attestation only) |

### Attestations

EIP-712 signed attestations create an audit trail of guardrail decisions:

```typescript
const config = {
  // ...
  attestation: {
    enabled: true,
    signer: walletClient,  // viem wallet client
    chainId: 8453,         // Base
  },
};
```

Attestations can be posted onchain for permanent record:

```typescript
import { encodeAttestationForOnchain } from '@jolt-atlas/agentkit-guardrails';

// Post to GuardrailAttestationRegistry contract
const calldata = encodeAttestationForOnchain(result.guardrail.attestation);
await registry.postAttestation(calldata);
```

## Configuration

### Full Configuration Options

```typescript
interface GuardrailConfig {
  // Policy model (path or config object)
  policyModel: string | {
    path: string;
    threshold?: number;
    name?: string;
  };

  // When to generate proofs
  proofMode: 'always' | 'on-reject' | 'on-approve' | 'never';

  // What to do if proof generation fails
  onProofFail: 'reject' | 'allow' | 'review';

  // What to do if model rejects action
  onModelReject: 'block' | 'warn' | 'log';

  // Custom feature extraction
  featureExtractor?: (action, wallet) => FeatureVector;

  // Attestation settings
  attestation?: {
    enabled: boolean;
    signer?: WalletClient;
    postOnchain?: boolean;
    registryAddress?: string;
    chainId?: number;
  };
}
```

### Feature Extractors

Customize how action context is converted to model inputs:

```typescript
const customExtractor = async (action, wallet) => ({
  amount: parseFloat(action.params.amount),
  is_stablecoin: action.params.asset === 'USDC' ? 1 : 0,
  daily_spend_ratio: wallet.dailySpend / wallet.spendLimit,
  hour_of_day: new Date().getUTCHours(),
  // ... more features
});

const config = {
  policyModel: './models/custom-policy.onnx',
  featureExtractor: customExtractor,
  // ...
};
```

## Integration Examples

### LangChain + AgentKit

```typescript
import { AgentKitToolkit } from '@coinbase/agentkit-langchain';
import { withZkGuardrail } from '@jolt-atlas/agentkit-guardrails';

// Wrap AgentKit tools with guardrails
const toolkit = new AgentKitToolkit(agentKit);
const guardrailedTools = toolkit.getTools().map(tool => ({
  ...tool,
  invoke: withZkGuardrail(tool.invoke, config),
}));
```

### OpenAI Agents SDK

```typescript
import { Agent } from 'openai/agents';

const agent = new Agent({
  tools: [
    {
      type: 'function',
      function: {
        name: 'transfer',
        // ...
      },
      execute: withZkGuardrail(executeTransfer, config),
    },
  ],
});
```

### Standalone Check

```typescript
import { checkAction } from '@jolt-atlas/agentkit-guardrails';

const result = await checkAction(
  {
    actionType: 'transfer',
    params: { to: '0x...', amount: '1000', asset: 'USDC' },
    timestamp: Date.now(),
  },
  config
);

if (result.decision === 'approve') {
  // Proceed with action
}
```

## Smart Contract

The `GuardrailAttestationRegistry` contract provides onchain attestation storage:

```solidity
// Post attestation
registry.postAttestation(
  attestationHash,
  modelCommitment,
  inputHash,
  outputHash,
  decision,
  confidence,
  signature
);

// Verify attestation exists
bool exists = registry.attestationExists(attestationHash);

// Get attestation data
Attestation memory att = registry.getAttestation(attestationHash);
```

Deploy to Base:
```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url base --broadcast
```

## Project Structure

```
├── packages/
│   └── agentkit-guardrails/     # Main SDK
│       ├── src/
│       │   ├── core/            # Types, guardrail wrapper
│       │   ├── models/          # ONNX model loading
│       │   ├── proof/           # Proof generation
│       │   ├── attestation/     # EIP-712 signing
│       │   └── utils/           # Feature extractors
│       └── tests/
├── contracts/
│   └── src/
│       └── GuardrailAttestationRegistry.sol
├── examples/
│   ├── basic/                   # Simple usage
│   ├── langchain/               # LangChain integration
│   └── openai-agents/           # OpenAI Agents integration
└── docs/
```

## Roadmap

### Phase 1 (Current)
- [x] Core SDK with `withZkGuardrail` wrapper
- [x] ONNX model inference
- [x] Mock proof generation
- [x] EIP-712 attestations
- [x] Lightweight attestation registry contract
- [x] Integration examples

### Phase 2
- [ ] Full Jolt Atlas ZK proof generation
- [ ] Onchain proof verification
- [ ] ERC-8004 validation provider
- [ ] Model marketplace

### Phase 3
- [ ] x402 payment proof integration
- [ ] Cross-chain attestations
- [ ] Reputation system

## Contributing

Contributions welcome! Please read our contributing guidelines first.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built for the agentic commerce future. Every agent deserves a wallet. Every wallet deserves guardrails.**
