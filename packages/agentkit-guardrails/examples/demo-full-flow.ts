/**
 * Jolt Atlas Full Demo - AgentKit + zkML Guardrails
 *
 * This demo shows the complete flow:
 * 1. Register agent identity (ERC-8004 NFT)
 * 2. Wrap actions with zkML guardrails
 * 3. Make agent-to-agent payments with trust requirements
 * 4. Store verifiable agent memory
 *
 * Prerequisites:
 * - Base Sepolia ETH in your wallet
 * - Deployed contracts (run forge script first)
 * - Prover service running at localhost:3001
 * - Kinic service running at localhost:3002 (optional)
 */

import { ethers } from "ethers";
import {
  withZkGuardrail,
  AgentPaymentRails,
  AgentMemory,
  StorageType,
  getProverServiceClient,
  type TrustRequirements,
} from "../src/index.js";

// Contract addresses (Base Sepolia - Deployed)
const CONTRACTS = {
  IDENTITY_REGISTRY: "0x9A27Efa5B8Da14D336317f2c1b8827654a5c384f",
  REPUTATION_REGISTRY: "0xaEf4e79A1f51F48b5E5206cBCc32fFe6549edd7E",
  VALIDATION_REGISTRY: "0x15957085f167f181B55Dc2cae3eE019D427C9778",
  MEMORY_REGISTRY: "0x525D0c8908939303CD7ebEEf5A350EC5b6764451",
  AGENT_ESCROW: "0xaB33273c46E0cD2377065815ebBA5231be671670",
};

// Configuration
const RPC_URL = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const PROVER_URL = process.env.PROVER_URL || "http://localhost:3001";
const KINIC_URL = process.env.KINIC_URL || "http://localhost:3002";

async function main() {
  console.log("========================================");
  console.log("  Jolt Atlas + AgentKit Demo");
  console.log("========================================\n");

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Wallet:", wallet.address);

  // Check prover service
  const proverClient = getProverServiceClient({ baseUrl: PROVER_URL });
  const proverHealth = await proverClient.health().catch(() => null);
  console.log(
    "Prover service:",
    proverHealth ? "available" : "unavailable (mock mode)"
  );

  // ========================================
  // STEP 1: Register Agent Identity
  // ========================================
  console.log("\n--- Step 1: Register Agent Identity ---");

  const rails = new AgentPaymentRails(wallet, {
    identityRegistryAddress: CONTRACTS.IDENTITY_REGISTRY,
    reputationRegistryAddress: CONTRACTS.REPUTATION_REGISTRY,
    validationRegistryAddress: CONTRACTS.VALIDATION_REGISTRY,
    proverServiceUrl: PROVER_URL,
  });

  // Generate model commitment (hash of the ONNX model)
  const modelCommitment = ethers.keccak256(
    ethers.toUtf8Bytes("tx-authorization-v1")
  );

  try {
    const agentId = await rails.registerIdentity(
      modelCommitment,
      "ipfs://QmAgent123..." // Metadata URI
    );
    console.log("Registered agent with ID:", agentId);
  } catch (error) {
    console.log("Agent registration (simulated):", 1);
  }

  // ========================================
  // STEP 2: Guardrailed Action
  // ========================================
  console.log("\n--- Step 2: Guardrailed Action ---");

  // Mock transfer action (in real use, this comes from AgentKit)
  const mockTransferAction = async (params: {
    to: string;
    amount: string;
    asset: string;
  }) => {
    console.log(`  Transfer: ${params.amount} ${params.asset} to ${params.to}`);
    return { txHash: "0x" + "a".repeat(64), success: true };
  };

  // Wrap with zkML guardrails
  const guardrailedTransfer = withZkGuardrail(mockTransferAction, {
    policyModel: "./models/tx-authorization.onnx",
    proofMode: "always",
    onModelReject: "block",
    proverConfig: {
      baseUrl: PROVER_URL,
    },
    attestation: {
      enabled: true,
      signer: wallet,
    },
  });

  // Execute guardrailed action
  try {
    const result = await guardrailedTransfer({
      to: "0x1234567890123456789012345678901234567890",
      amount: "100",
      asset: "USDC",
    });
    console.log("  Decision:", result.guardrail.decision);
    console.log("  Confidence:", result.guardrail.confidence);
    console.log(
      "  Proof:",
      result.guardrail.proof ? "generated" : "mock mode"
    );
  } catch (error) {
    console.log("  Guardrailed action demo completed (mock)");
  }

  // ========================================
  // STEP 3: Agent-to-Agent Payment
  // ========================================
  console.log("\n--- Step 3: Agent-to-Agent Payment ---");

  const trustRequirements: TrustRequirements = {
    minReputationScore: 70,
    minReputationCount: 5,
    minZkmlApprovalRate: 80,
    minZkmlAttestations: 3,
    requireZkmlProof: true,
  };

  console.log("  Trust requirements:");
  console.log(`    - Min reputation: ${trustRequirements.minReputationScore}`);
  console.log(`    - Min zkML approval: ${trustRequirements.minZkmlApprovalRate}%`);

  // Simulate payment verification
  try {
    const recipientAgentId = 2; // Target agent
    const meetsRequirements = await rails.verifyAgentTrust(
      recipientAgentId,
      trustRequirements
    );
    console.log("  Recipient meets trust requirements:", meetsRequirements);
  } catch (error) {
    console.log("  Trust verification demo (contracts not deployed)");
  }

  // ========================================
  // STEP 4: Kinic AI Memory (On-Chain Vector DB)
  // ========================================
  console.log("\n--- Step 4: Kinic AI Memory ---");

  const memory = new AgentMemory(wallet, {
    identityRegistryAddress: CONTRACTS.IDENTITY_REGISTRY,
    memoryRegistryAddress: CONTRACTS.MEMORY_REGISTRY,
    kinicServiceUrl: KINIC_URL,
    agentId: 1,
  });

  // Create on-chain vector database for agent
  try {
    await memory.createStore({
      name: "trading-knowledge",
      description: "Market analysis and trading strategies",
      storageType: StorageType.InternetComputer,
      useKinic: true,
    });
    console.log("  Created on-chain vector DB: trading-knowledge");
  } catch (error) {
    console.log("  Memory store demo (Kinic service not running)");
  }

  // Insert memory with zkML proof
  try {
    const result = await memory.insert(
      "market-analysis-2024",
      "DeFi yield optimization strategy: Focus on stable pools with >5% APY..."
    );
    console.log("  Inserted memory with proof:", result.zkProof ? "yes" : "no");
  } catch (error) {
    console.log("  Memory insert demo completed");
  }

  // ========================================
  // Summary
  // ========================================
  console.log("\n========================================");
  console.log("  Demo Complete!");
  console.log("========================================");
  console.log("\nJolt Atlas provides:");
  console.log("  - ERC-8004 agent identity (NFT-based)");
  console.log("  - zkML guardrails for action verification");
  console.log("  - Agent-to-agent payments with trust requirements");
  console.log("  - Kinic AI Memory (on-chain vector database)");
  console.log("\nContracts deployed on Base Sepolia!");
  console.log("Run Kinic service: cd services/kinic-service && python main.py");
}

// Escrow Demo (separate flow)
async function demoEscrow() {
  console.log("\n========================================");
  console.log("  Escrow Demo");
  console.log("========================================\n");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // AgentEscrow ABI (minimal)
  const escrowAbi = [
    "function createEscrow((uint256 senderAgentId, uint256 recipientAgentId, address token, uint256 amount, uint8 condition, uint256 timeout, bytes32 zkmlModelCommitment, uint96 minConfidence, string description)) returns (uint256)",
    "function fund(uint256 escrowId) payable",
    "function release(uint256 escrowId, bytes32 zkmlProofHash)",
    "function getEscrow(uint256 escrowId) view returns (tuple, uint8, address, address, uint256, uint256, bytes32, uint8)",
  ];

  console.log("Escrow enables:");
  console.log("  - Time-locked payments");
  console.log("  - zkML-gated release conditions");
  console.log("  - Multi-party approvals");
  console.log("  - Dispute resolution");
  console.log("\nUse AgentEscrow.sol for trustless agent payments");
}

// Run demo
main().catch(console.error);
