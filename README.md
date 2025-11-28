# Jolt Atlas: The Trust Layer for Agentic Commerce

> **Crypto rails for autonomous AI agents** - Identity, payments, and verifiable behavior for the agent economy.

[![ERC-8004](https://img.shields.io/badge/ERC-8004-blue.svg)](https://eips.ethereum.org/EIPS/eip-8004)
[![npm version](https://img.shields.io/npm/v/@jolt-atlas/agentkit-guardrails)](https://www.npmjs.com/package/@jolt-atlas/agentkit-guardrails)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**First ERC-8004 implementation with zkML extensions** - Built on the [Trustless Agents standard](https://8004.org) with real zero-knowledge machine learning proofs.

## The Problem

As AI systems move from screens into the physical world, they need to:
- **Pay** - Execute financial transactions autonomously
- **Verify** - Prove they followed policies and acted correctly
- **Identify** - Have verifiable on-chain identity and reputation
- **Coordinate** - Interact with other agents in trustless ways

Current solutions require trusting the agent operator. **Jolt Atlas makes agent behavior cryptographically verifiable.**

## The Solution

Jolt Atlas provides the infrastructure for **agentic commerce** on Coinbase:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        JOLT ATLAS TRUST LAYER                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│   │ IDENTITY │  │  VERIFY  │  │   PAY    │  │  MEMORY  │              │
│   │ ERC-721  │  │   zkML   │  │  Rails   │  │  Kinic   │              │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│        │             │             │             │                      │
│        └─────────────┴─────────────┴─────────────┘                      │
│                           │                                             │
│              ┌────────────▼────────────┐                               │
│              │  AgentKit / CDP Wallet  │                               │
│              └─────────────────────────┘                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Four Pillars

| Pillar | What It Does | Why It Matters |
|--------|--------------|----------------|
| **Identity** | ERC-721 agent NFTs with reputation | Know who you're transacting with |
| **Verify** | zkML proofs of policy compliance | Trust the math, not the operator |
| **Pay** | Agent-to-agent payment rails | Enable autonomous commerce |
| **Memory** | Kinic AI Memory + Base commitments | Verifiable agent knowledge |

## Quick Start

### 1. Guardrailed Actions (Basic)

Wrap any AgentKit action with zkML verification:

```typescript
import { withZkGuardrail } from '@jolt-atlas/agentkit-guardrails';
import { AgentKit } from '@coinbase/agentkit';

const agent = await AgentKit.from({ walletProvider: cdpWallet });

// Wrap transfer with zkML guardrails
const safeTransfer = withZkGuardrail(
  agent.getAction('transfer'),
  {
    policyModel: './models/tx-authorization.onnx',
    proofMode: 'always',
    onModelReject: 'block',
  }
);

// Action is now protected - no proof, no tx
const result = await safeTransfer({
  to: '0x...',
  amount: '100',
  asset: 'USDC',
});

console.log(result.guardrail.decision);  // 'approve'
console.log(result.guardrail.proof);     // '0x...' (zkML proof)
```

### 2. Agent Identity (ERC-8004)

Register your agent as an NFT with zkML model commitment:

```typescript
import { AgentPaymentRails } from '@jolt-atlas/agentkit-guardrails';

const rails = new AgentPaymentRails(signer, {
  identityRegistryAddress: IDENTITY_REGISTRY,
  reputationRegistryAddress: REPUTATION_REGISTRY,
  validationRegistryAddress: VALIDATION_REGISTRY,
  proverServiceUrl: 'http://localhost:3001',
});

// Register agent identity (mints ERC-721 NFT)
const agentId = await rails.registerIdentity(
  modelCommitment,
  'ipfs://agent-metadata...'
);

console.log(agentId); // 42 (NFT token ID)
```

### 3. Agent-to-Agent Payments (ERC-8004)

Pay other agents with reputation + zkML trust verification:

```typescript
// Pay another agent with ERC-8004 trust requirements
const payment = await rails.payAgent({
  toAgentId: 42,  // NFT ID of recipient agent
  amount: ethers.parseEther('100'),
  token: USDC_ADDRESS,
  trustRequirements: {
    minReputationScore: 70,      // ReputationRegistry score
    minReputationCount: 5,       // Minimum feedback count
    minZkmlApprovalRate: 80,     // ValidationRegistry approval %
    minZkmlAttestations: 3,      // Minimum attestations
    requireZkmlProof: true,      // Generate fresh proof
  },
});

console.log(payment.status);              // 'completed'
console.log(payment.txHash);              // Transaction hash
console.log(payment.zkmlAttestationHash); // On-chain attestation
```

### 4. Agent Memory (Kinic AI Memory)

Store verifiable agent knowledge in an on-chain vector database:

```typescript
import { AgentMemory, StorageType } from '@jolt-atlas/agentkit-guardrails';

const memory = new AgentMemory(signer, {
  identityRegistryAddress: IDENTITY_REGISTRY,
  memoryRegistryAddress: MEMORY_REGISTRY,
  kinicServiceUrl: 'http://localhost:3002',
  agentId: 42,
});

// Create on-chain vector database for agent
await memory.createStore({
  name: 'trading-knowledge',
  description: 'Market analysis and strategies',
  storageType: StorageType.OnChainVector,
  useKinic: true,
});

// Insert memory with zkML embedding proof
const result = await memory.insert('strategy', 'DeFi yield optimization...');
console.log(result.zkProof);         // Kinic embedding proof
console.log(result.attestationHash); // Base on-chain attestation

// Sync commitment to Base
const merkleRoot = await memory.syncCommitment();
```

## Architecture

### On-Chain Contracts (ERC-8004 Compliant)

```
contracts/src/
├── erc8004/
│   ├── IdentityRegistry.sol      # ERC-721 agent NFTs + zkML model commitments
│   ├── ReputationRegistry.sol    # Feedback scoring (0-100) with authorization
│   ├── ValidationRegistry.sol    # zkML proof attestations + trust scores
│   └── MemoryRegistry.sol        # On-chain vector DB commitments + knowledge credentials
├── GuardrailAttestationRegistry.sol  # Legacy attestation storage
└── (coming) AgentEscrow.sol      # zkML-gated escrow
```

**ERC-8004 Four Registry Architecture:**

| Registry | Standard | zkML Extension |
|----------|----------|----------------|
| **IdentityRegistry** | ERC-721 NFT per agent | Model commitment tracking |
| **ReputationRegistry** | Score 0-100 + tags | Feedback aggregation |
| **ValidationRegistry** | Request/response flow | `postZkmlAttestation()`, `getZkmlTrustScore()` |
| **MemoryRegistry** | Merkle commitments | Knowledge credentials, on-chain vector DB |

The four registries enable:
- **Discovery** - Find agents by NFT ID or wallet address
- **Reputation** - Feedback-based scoring with cryptographic authorization
- **Validation** - zkML-verified trust with on-chain attestations
- **Memory** - Verifiable agent knowledge with Merkle proofs

### TypeScript SDK

```
packages/agentkit-guardrails/src/
├── core/           # withZkGuardrail wrapper
├── commerce/       # AgentPaymentRails for A2A
├── memory/         # AgentMemory for Kinic + Base
├── proof/          # zkML proof generation
├── attestation/    # EIP-712 signing
└── models/         # ONNX policy models
```

### Services

```
services/
├── kinic-service/  # Kinic AI Memory - On-chain vector database
│   ├── main.py     # FastAPI endpoints (port 3002)
│   └── Dockerfile
```

### Rust Prover Service

```
prover-service/
├── src/
│   ├── main.rs         # HTTP API (port 3001)
│   ├── jolt_atlas.rs   # Real zkML proof generation
│   └── prover.rs       # Model management
└── jolt-atlas/
    └── bin/            # Jolt Atlas binary (400MB)
```

**Prover endpoints:**
- `POST /prove` - Generate zkML proof (~2.5s)
- `POST /verify` - Verify proof (~400ms)
- `POST /models` - Register ONNX model
- `GET /health` - Service health

## Use Cases

### 1. Autonomous Shopping Agent

```typescript
// Agent shops on behalf of user with spending guardrails
const shopperAgent = withZkGuardrail(purchaseAction, {
  policyModel: './models/shopping-policy.onnx',
  // Model trained on: budget, category, merchant trust, time
});

// Every purchase generates proof of policy compliance
const result = await shopperAgent({
  item: 'laptop',
  price: 1200,
  merchant: '0x...',
});
```

### 2. Multi-Agent Supply Chain

```typescript
// Warehouse robot pays delivery robot
const warehouseAgent = new AgentPaymentRails(warehouseSigner, config);
const deliveryAgentDid = 'did:coinbase:agent:0x...';

// Payment requires delivery agent to have valid credentials
await warehouseAgent.payAgent({
  toAgent: deliveryAgentDid,
  amount: deliveryFee,
  trustRequirements: {
    requiredCredentials: ['DeliveryLicense', 'InsuranceProof'],
    minReputation: 300,
  },
});
```

### 3. Data Marketplace

```typescript
// Agent sells verified sensor data
const dataProviderAgent = new AgentPaymentRails(signer, config);

// Create escrow - funds release when zkML proves data quality
const escrow = await dataProviderAgent.createEscrow({
  toAgent: buyerAgentDid,
  amount: dataPrice,
  config: {
    releaseCondition: 'zkml-attestation',
    zkmlModelCommitment: DATA_QUALITY_MODEL,
    requiredConfidence: 0.9,
  },
});
```

### 4. DAO Treasury Agent

```typescript
// DAO agent executes approved proposals with proof
const treasuryAgent = withZkGuardrail(executeProposal, {
  policyModel: './models/governance-policy.onnx',
  onModelReject: 'block',
  attestation: {
    enabled: true,
    postOnchain: true, // Permanent proof on-chain
  },
});
```

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| zkML Proof Generation | ~2.4s | Real Jolt Atlas SNARK |
| Proof Verification | ~400ms | On-chain verifiable |
| Identity Lookup | ~50ms | Cached after first call |
| A2A Payment (w/ proof) | ~3s | Includes trust verification |

## Roadmap

### Phase 1 ✅ Complete
- [x] `withZkGuardrail` wrapper
- [x] ONNX policy model inference
- [x] EIP-712 attestations
- [x] GuardrailAttestationRegistry contract

### Phase 1.5 ✅ Complete
- [x] Real Jolt Atlas zkML proofs (2.4s proving)
- [x] Rust prover service with HTTP API
- [x] TypeScript prover client

### Phase 2 ✅ Complete
- [x] ERC-8004 IdentityRegistry (ERC-721 agent NFTs)
- [x] ERC-8004 ReputationRegistry (feedback scoring)
- [x] ERC-8004 ValidationRegistry (zkML attestations)
- [x] AgentPaymentRails with three-registry architecture
- [x] zkML trust score aggregation

### Phase 2.5 ✅ Complete
- [x] MemoryRegistry for on-chain commitments
- [x] Kinic AI Memory integration (on-chain vector database)
- [x] AgentMemory TypeScript SDK
- [x] Knowledge credentials system
- [x] Memory integrity scoring

### Phase 3 (Next)
- [ ] On-chain zkML verification
- [ ] AgentEscrow with zkML release conditions
- [ ] Data provenance module
- [ ] Multi-agent coordination protocols

### Phase 4 (Future)
- [ ] IoT/robotics sensor attestation
- [ ] Cross-chain agent identity
- [ ] Agent reputation marketplace
- [ ] Physical world verification

## Getting Started

### Prerequisites

- Node.js 18+
- Rust (for prover service)
- Foundry (for contracts)
- For Kinic Memory: Linux environment (native, WSL, or VM)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-org/jolt-atlas-agentkit
cd jolt-atlas-agentkit

# Install SDK
cd packages/agentkit-guardrails
npm install

# Build prover service
cd ../../prover-service
cargo build --release --features real-prover

# Deploy contracts
cd ../contracts
forge build
```

### Windows Setup (for Kinic AI Memory)

Kinic requires a Linux environment. On Windows, use WSL2 (recommended):

```bash
# In WSL Ubuntu terminal:

# Install dependencies
sudo apt update && sudo apt install -y python3-pip python3-venv curl gnome-keyring dbus-x11 libsecret-tools xxd

# Install Rust and dfx
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
curl -fsSL https://internetcomputer.org/install.sh | sh
source ~/.bashrc

# Create identity with plaintext storage
dfx identity new jolt-atlas --storage-mode=plaintext
dfx identity use jolt-atlas
dfx identity get-principal  # Fund this address with KINIC tokens

# Create venv and install kinic-py
python3 -m venv ~/kinic-venv
source ~/kinic-venv/bin/activate
pip install git+https://github.com/ICME-Lab/kinic-cli.git
pip install fastapi uvicorn pydantic python-dotenv httpx

# Store identity in keyring (required for kinic-py)
eval $(dbus-launch --sh-syntax)
echo "" | gnome-keyring-daemon --unlock --components=secrets
cat ~/.config/dfx/identity/jolt-atlas/identity.pem | xxd -p | tr -d '\n' | \
  secret-tool store --label="ic:jolt-atlas" \
    service internet_computer_identities \
    username internet_computer_identity_jolt-atlas

# Test
python3 -c "from kinic_py import KinicMemories; km = KinicMemories('jolt-atlas', ic=True); print(km.list())"
```

See `services/kinic-service/README.md` for complete setup instructions and troubleshooting.

### Run the Prover Service

```bash
cd prover-service

# Copy the Jolt Atlas binary (built separately)
mkdir -p jolt-atlas/bin
cp /path/to/authorization_json jolt-atlas/bin/

# Start the service
RUST_LOG=info ./target/release/jolt-atlas-prover-service
```

### Deploy Contracts

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url base --broadcast
```

## API Reference

### TypeScript SDK

```typescript
// Core guardrail
withZkGuardrail(action, config) → GuardrailedAction
checkAction(context, config) → GuardrailResult

// Commerce
AgentPaymentRails.registerIdentity(model, metadata) → agentDid
AgentPaymentRails.payAgent(params) → AgentPayment
AgentPaymentRails.createEscrow(params) → Escrow
AgentPaymentRails.verifyAgentTrust(did, requirements) → TrustResult

// Attestation
signAttestation(data, signer) → SignedAttestation
encodeAttestationForOnchain(attestation) → bytes
```

### Solidity Contracts (ERC-8004)

```solidity
// IdentityRegistry (ERC-721)
register(tokenUri) → agentId
registerWithModel(tokenUri, modelCommitment, wallet) → agentId
setMetadata(agentId, key, value)
modelCommitments(agentId) → bytes32
agentWallets(agentId) → address

// ReputationRegistry
giveFeedback(agentId, score, tag1, tag2, uri, hash, auth)
giveOpenFeedback(agentId, score, tag1, tag2, uri, hash)
getSummary(agentId, clients, tag1, tag2) → (count, avgScore)

// ValidationRegistry (with zkML extensions)
postZkmlAttestation(agentId, model, input, output, proof, decision, confidence) → hash
getZkmlTrustScore(agentId, model) → (count, approvalRate, avgConfidence)
meetsZkmlTrustRequirements(agentId, minAttestations, minApprovalRate, model) → bool
```

## Contributing

We're building the infrastructure for the agent economy. Contributions welcome!

1. Fork the repo
2. Create your feature branch
3. Submit a PR

## License

MIT License

---

**The future is agentic. Every agent needs identity. Every transaction needs proof.**

*Built for [Coinbase AgentKit](https://github.com/coinbase/agentkit) | Powered by [Jolt Atlas zkML](https://github.com/ICME-Lab/jolt-atlas)*
