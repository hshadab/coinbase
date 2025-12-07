/**
 * Agent-to-Agent Payment Rails (ERC-8004 Compliant)
 *
 * Enables autonomous commerce between AI agents with zkML-verified trust.
 * Built on the ERC-8004 Trustless Agents standard with three registries:
 * - IdentityRegistry: NFT-based agent identity (ERC-721)
 * - ReputationRegistry: Feedback and reputation scoring
 * - ValidationRegistry: zkML proof attestations
 *
 * @module commerce/agent-payment-rails
 */

import { ethers, Contract, Signer } from "ethers";
import { getProverServiceUrl } from "../config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Agent identity from ERC-8004 IdentityRegistry
 */
export interface AgentIdentity {
  agentId: number;
  owner: string;
  wallet: string;
  modelCommitment: string;
  tokenUri: string;
}

/**
 * Agent reputation from ReputationRegistry
 */
export interface AgentReputation {
  feedbackCount: number;
  averageScore: number; // 0-100
}

/**
 * zkML trust score from ValidationRegistry
 */
export interface ZkmlTrustScore {
  attestationCount: number;
  approvalRate: number; // 0-100
  avgConfidence: bigint;
}

/**
 * Trust requirements for a payment
 */
export interface TrustRequirements {
  minReputationScore: number;
  minReputationCount: number;
  minZkmlApprovalRate: number;
  minZkmlAttestations: number;
  requiredModelCommitment?: string;
  requireZkmlProof: boolean;
}

/**
 * Payment request from one agent to another
 */
export interface AgentPaymentRequest {
  fromAgentId: number;
  toAgentId: number;
  amount: bigint;
  token: string;
  memo: string;
  trustRequirements: TrustRequirements;
  expiresAt: number;
  nonce: string;
}

/**
 * Completed payment with proof
 */
export interface AgentPayment {
  paymentId: string;
  request: AgentPaymentRequest;
  txHash: string;
  zkmlAttestationHash?: string;
  timestamp: number;
  status: PaymentStatus;
}

export enum PaymentStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
  Refunded = "refunded",
}

/**
 * Escrow configuration
 */
export interface EscrowConfig {
  releaseCondition: "zkml-attestation" | "time-based" | "multi-sig" | "oracle";
  zkmlModelCommitment?: string;
  requiredApprovalRate?: number;
  timeoutSeconds?: number;
  requiredSigners?: string[];
  oracleAddress?: string;
}

/**
 * Escrow state
 */
export interface Escrow {
  escrowId: string;
  fromAgentId: number;
  toAgentId: number;
  amount: bigint;
  token: string;
  config: EscrowConfig;
  status: EscrowStatus;
  createdAt: number;
  releasedAt?: number;
  zkmlAttestationHash?: string;
}

export enum EscrowStatus {
  Active = "active",
  Released = "released",
  Refunded = "refunded",
  Disputed = "disputed",
}

// ============================================================================
// ERC-8004 Configuration
// ============================================================================

export interface ERC8004Config {
  identityRegistryAddress: string;
  reputationRegistryAddress: string;
  validationRegistryAddress: string;
  escrowContractAddress?: string;
  proverServiceUrl?: string;
}

// ============================================================================
// Agent Payment Rails Class
// ============================================================================

/**
 * AgentPaymentRails - ERC-8004 compliant agent-to-agent payments
 *
 * @example
 * ```typescript
 * const rails = new AgentPaymentRails(signer, {
 *   identityRegistryAddress: "0x...",
 *   reputationRegistryAddress: "0x...",
 *   validationRegistryAddress: "0x...",
 *   proverServiceUrl: "http://localhost:3001"
 * });
 *
 * // Register agent identity (get NFT)
 * const agentId = await rails.registerIdentity(modelCommitment, "ipfs://...");
 *
 * // Pay another agent with trust verification
 * const payment = await rails.payAgent({
 *   toAgentId: 42,
 *   amount: ethers.parseEther("10"),
 *   trustRequirements: {
 *     minReputationScore: 70,
 *     minZkmlApprovalRate: 80,
 *     requireZkmlProof: true
 *   }
 * });
 * ```
 */
export class AgentPaymentRails {
  private signer: Signer;
  private identityRegistry: Contract;
  private reputationRegistry: Contract;
  private validationRegistry: Contract;
  private escrowContract: Contract | null = null;
  private proverServiceUrl: string;
  private myAgentId: number | null = null;

  constructor(signer: Signer, config: ERC8004Config) {
    this.signer = signer;
    this.proverServiceUrl = config.proverServiceUrl || getProverServiceUrl();

    // Initialize ERC-8004 registries
    this.identityRegistry = new Contract(
      config.identityRegistryAddress,
      IDENTITY_REGISTRY_ABI,
      signer
    );

    this.reputationRegistry = new Contract(
      config.reputationRegistryAddress,
      REPUTATION_REGISTRY_ABI,
      signer
    );

    this.validationRegistry = new Contract(
      config.validationRegistryAddress,
      VALIDATION_REGISTRY_ABI,
      signer
    );

    // Initialize escrow contract if provided
    if (config.escrowContractAddress) {
      this.escrowContract = new Contract(
        config.escrowContractAddress,
        ESCROW_ABI,
        signer
      );
    }
  }

  // ==========================================================================
  // Identity Management (ERC-8004 IdentityRegistry)
  // ==========================================================================

  /**
   * Register this agent's identity as an NFT
   */
  async registerIdentity(
    modelCommitment: string,
    tokenUri: string = ""
  ): Promise<number> {
    const wallet = await this.signer.getAddress();

    // Use registerWithModel for zkML-enabled agents
    const tx = await this.identityRegistry.registerWithModel(
      tokenUri,
      modelCommitment,
      wallet
    );
    const receipt = await tx.wait();

    // Extract agentId from Registered event
    const event = receipt.logs.find(
      (log: { fragment?: { name: string } }) => log.fragment?.name === "Registered"
    );
    if (event) {
      this.myAgentId = Number(event.args[0]);
      return this.myAgentId;
    }

    throw new Error("Failed to extract agentId from transaction");
  }

  /**
   * Get my agent ID (cached or lookup)
   */
  async getMyAgentId(): Promise<number> {
    if (this.myAgentId !== null) return this.myAgentId;

    const wallet = await this.signer.getAddress();
    this.myAgentId = Number(await this.identityRegistry.getAgentByWallet(wallet));

    if (this.myAgentId === 0) {
      throw new Error("Agent not registered. Call registerIdentity first.");
    }

    return this.myAgentId;
  }

  /**
   * Get another agent's identity
   */
  async getAgentIdentity(agentId: number): Promise<AgentIdentity> {
    const owner = await this.identityRegistry.ownerOf(agentId);
    const wallet = await this.identityRegistry.agentWallets(agentId);
    const modelCommitment = await this.identityRegistry.modelCommitments(agentId);
    const tokenUri = await this.identityRegistry.tokenURI(agentId);

    return {
      agentId,
      owner,
      wallet,
      modelCommitment,
      tokenUri,
    };
  }

  /**
   * Update agent metadata
   */
  async setMetadata(key: string, value: string): Promise<void> {
    const agentId = await this.getMyAgentId();
    await this.identityRegistry.setMetadata(
      agentId,
      key,
      ethers.toUtf8Bytes(value)
    );
  }

  // ==========================================================================
  // Reputation (ERC-8004 ReputationRegistry)
  // ==========================================================================

  /**
   * Get agent's reputation summary
   */
  async getAgentReputation(
    agentId: number,
    tag?: string
  ): Promise<AgentReputation> {
    const tag1 = tag ? ethers.encodeBytes32String(tag) : ethers.ZeroHash;
    const [count, avgScore] = await this.reputationRegistry.getSummary(
      agentId,
      [], // all clients
      tag1,
      ethers.ZeroHash
    );

    return {
      feedbackCount: Number(count),
      averageScore: Number(avgScore),
    };
  }

  /**
   * Submit feedback for an agent (requires pre-authorization)
   */
  async submitFeedback(
    agentId: number,
    score: number,
    tag: string,
    feedbackUri: string,
    feedbackAuth: string
  ): Promise<void> {
    const tag1 = ethers.encodeBytes32String(tag);
    const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(feedbackUri));

    await this.reputationRegistry.giveFeedback(
      agentId,
      score,
      tag1,
      ethers.ZeroHash,
      feedbackUri,
      feedbackHash,
      feedbackAuth
    );
  }

  /**
   * Submit open feedback (no authorization required)
   */
  async submitOpenFeedback(
    agentId: number,
    score: number,
    tag: string,
    feedbackUri: string
  ): Promise<void> {
    const tag1 = ethers.encodeBytes32String(tag);
    const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(feedbackUri));

    await this.reputationRegistry.giveOpenFeedback(
      agentId,
      score,
      tag1,
      ethers.ZeroHash,
      feedbackUri,
      feedbackHash
    );
  }

  // ==========================================================================
  // zkML Validation (ERC-8004 ValidationRegistry + Extensions)
  // ==========================================================================

  /**
   * Get agent's zkML trust score
   */
  async getZkmlTrustScore(
    agentId: number,
    modelCommitment?: string
  ): Promise<ZkmlTrustScore> {
    const model = modelCommitment || ethers.ZeroHash;
    const [count, rate, confidence] = await this.validationRegistry.getZkmlTrustScore(
      agentId,
      model
    );

    return {
      attestationCount: Number(count),
      approvalRate: Number(rate),
      avgConfidence: confidence,
    };
  }

  /**
   * Post a zkML attestation for an agent
   */
  async postZkmlAttestation(
    agentId: number,
    modelCommitment: string,
    inputHash: string,
    outputHash: string,
    proofHash: string,
    decision: number, // 0=reject, 1=approve, 2=review
    confidence: bigint
  ): Promise<string> {
    const tx = await this.validationRegistry.postZkmlAttestation(
      agentId,
      modelCommitment,
      inputHash,
      outputHash,
      proofHash,
      decision,
      confidence
    );
    const receipt = await tx.wait();

    // Extract attestation hash from event
    const event = receipt.logs.find(
      (log: { fragment?: { name: string } }) => log.fragment?.name === "ZkmlAttestationPosted"
    );

    return event?.args[0] || ethers.ZeroHash;
  }

  /**
   * Generate and post a zkML proof for trust verification
   */
  async generateAndPostTrustProof(
    targetAgentId: number
  ): Promise<{ success: boolean; attestationHash?: string }> {
    try {
      const identity = await this.getAgentIdentity(targetAgentId);
      const reputation = await this.getAgentReputation(targetAgentId);

      // Prepare features for the authorization model
      const features = [
        Math.min(15, Math.floor(reputation.averageScore / 7)), // budget proxy
        Math.min(7, Math.floor(reputation.averageScore / 15)), // trust
        Math.min(1000, reputation.feedbackCount), // amount proxy
        0, // category
        Math.min(7, reputation.feedbackCount % 8), // velocity
        new Date().getDay(), // day
        Math.floor(new Date().getHours() / 8), // time bucket
        reputation.averageScore > 50 ? 0 : 1, // risk
      ];

      const response = await fetch(`${this.proverServiceUrl}/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: identity.modelCommitment,
          inputs: features,
        }),
      });

      const result = await response.json() as {
        success: boolean;
        decision?: string;
        proof_hash?: string;
        confidence?: number;
      };

      if (result.success && result.decision === "approve") {
        // Post attestation on-chain
        const inputHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256[]"], [features.map(f => Math.floor(f))])
        );
        const outputHash = ethers.keccak256(
          ethers.toUtf8Bytes(result.decision)
        );

        const attestationHash = await this.postZkmlAttestation(
          targetAgentId,
          identity.modelCommitment,
          inputHash,
          outputHash,
          result.proof_hash || ethers.ZeroHash,
          1, // approve
          BigInt(Math.floor((result.confidence || 0) * 1e18))
        );

        return { success: true, attestationHash };
      }

      return { success: false };
    } catch (error) {
      console.error("Trust proof generation failed:", error);
      return { success: false };
    }
  }

  // ==========================================================================
  // Trust Verification (Combined)
  // ==========================================================================

  /**
   * Verify an agent meets trust requirements
   */
  async verifyAgentTrust(
    agentId: number,
    requirements: TrustRequirements
  ): Promise<{ verified: boolean; reason?: string }> {
    // Check agent exists
    try {
      await this.identityRegistry.ownerOf(agentId);
    } catch {
      return { verified: false, reason: "Agent does not exist" };
    }

    // Check reputation
    if (requirements.minReputationScore > 0 || requirements.minReputationCount > 0) {
      const reputation = await this.getAgentReputation(agentId);

      if (reputation.averageScore < requirements.minReputationScore) {
        return {
          verified: false,
          reason: `Reputation score ${reputation.averageScore} below minimum ${requirements.minReputationScore}`,
        };
      }

      if (reputation.feedbackCount < requirements.minReputationCount) {
        return {
          verified: false,
          reason: `Feedback count ${reputation.feedbackCount} below minimum ${requirements.minReputationCount}`,
        };
      }
    }

    // Check zkML trust score
    if (requirements.minZkmlApprovalRate > 0 || requirements.minZkmlAttestations > 0) {
      const zkmlScore = await this.getZkmlTrustScore(
        agentId,
        requirements.requiredModelCommitment
      );

      if (zkmlScore.approvalRate < requirements.minZkmlApprovalRate) {
        return {
          verified: false,
          reason: `zkML approval rate ${zkmlScore.approvalRate}% below minimum ${requirements.minZkmlApprovalRate}%`,
        };
      }

      if (zkmlScore.attestationCount < requirements.minZkmlAttestations) {
        return {
          verified: false,
          reason: `zkML attestation count ${zkmlScore.attestationCount} below minimum ${requirements.minZkmlAttestations}`,
        };
      }
    }

    // Generate fresh zkML proof if required
    if (requirements.requireZkmlProof) {
      const proofResult = await this.generateAndPostTrustProof(agentId);
      if (!proofResult.success) {
        return { verified: false, reason: "Failed to generate zkML trust proof" };
      }
    }

    return { verified: true };
  }

  // ==========================================================================
  // Payments
  // ==========================================================================

  /**
   * Pay another agent with trust verification
   */
  async payAgent(params: {
    toAgentId: number;
    amount: bigint;
    token?: string;
    memo?: string;
    trustRequirements?: Partial<TrustRequirements>;
  }): Promise<AgentPayment> {
    const requirements: TrustRequirements = {
      minReputationScore: params.trustRequirements?.minReputationScore ?? 0,
      minReputationCount: params.trustRequirements?.minReputationCount ?? 0,
      minZkmlApprovalRate: params.trustRequirements?.minZkmlApprovalRate ?? 0,
      minZkmlAttestations: params.trustRequirements?.minZkmlAttestations ?? 0,
      requiredModelCommitment: params.trustRequirements?.requiredModelCommitment,
      requireZkmlProof: params.trustRequirements?.requireZkmlProof ?? false,
    };

    // Verify recipient meets trust requirements
    const verification = await this.verifyAgentTrust(params.toAgentId, requirements);
    if (!verification.verified) {
      throw new Error(`Trust verification failed: ${verification.reason}`);
    }

    // Get recipient wallet
    const recipientIdentity = await this.getAgentIdentity(params.toAgentId);
    const recipientWallet = recipientIdentity.wallet;

    // Execute payment
    const token = params.token || ethers.ZeroAddress;
    let txHash: string;

    if (token === ethers.ZeroAddress) {
      // ETH payment
      const tx = await this.signer.sendTransaction({
        to: recipientWallet,
        value: params.amount,
      });
      const receipt = await tx.wait();
      txHash = receipt!.hash;
    } else {
      // ERC20 payment
      const erc20 = new Contract(token, ERC20_ABI, this.signer);
      const tx = await erc20.transfer(recipientWallet, params.amount);
      const receipt = await tx.wait();
      txHash = receipt.hash;
    }

    // Submit positive feedback for completed payment
    const myAgentId = await this.getMyAgentId();
    try {
      await this.submitOpenFeedback(
        params.toAgentId,
        90, // High score for successful payment
        "payment",
        `payment:${txHash}`
      );
    } catch {
      // Feedback submission is optional
    }

    // Generate payment ID
    const paymentId = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "uint256", "uint256", "uint256"],
        [myAgentId, params.toAgentId, params.amount, Date.now()]
      )
    );

    return {
      paymentId,
      request: {
        fromAgentId: myAgentId,
        toAgentId: params.toAgentId,
        amount: params.amount,
        token,
        memo: params.memo || "",
        trustRequirements: requirements,
        expiresAt: 0,
        nonce: ethers.hexlify(ethers.randomBytes(32)),
      },
      txHash,
      timestamp: Date.now(),
      status: PaymentStatus.Completed,
    };
  }

  /**
   * Request payment from another agent
   */
  async requestPayment(params: {
    fromAgentId: number;
    amount: bigint;
    token?: string;
    memo?: string;
  }): Promise<AgentPaymentRequest> {
    const myAgentId = await this.getMyAgentId();

    return {
      fromAgentId: params.fromAgentId,
      toAgentId: myAgentId,
      amount: params.amount,
      token: params.token || ethers.ZeroAddress,
      memo: params.memo || "",
      trustRequirements: {
        minReputationScore: 0,
        minReputationCount: 0,
        minZkmlApprovalRate: 0,
        minZkmlAttestations: 0,
        requireZkmlProof: false,
      },
      expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24 hours
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };
  }

  // ==========================================================================
  // Escrow
  // ==========================================================================

  /**
   * Create an escrow with zkML-gated release
   */
  async createEscrow(params: {
    toAgentId: number;
    amount: bigint;
    token?: string;
    config: EscrowConfig;
  }): Promise<Escrow> {
    if (!this.escrowContract) {
      throw new Error("Escrow contract not configured");
    }

    const myAgentId = await this.getMyAgentId();
    const token = params.token || ethers.ZeroAddress;

    // Create escrow on-chain
    let tx;
    if (token === ethers.ZeroAddress) {
      tx = await this.escrowContract.createEscrow(
        params.toAgentId,
        params.config.zkmlModelCommitment || ethers.ZeroHash,
        params.config.requiredApprovalRate || 80,
        params.config.timeoutSeconds || 86400,
        { value: params.amount }
      );
    } else {
      // Approve and create
      const erc20 = new Contract(token, ERC20_ABI, this.signer);
      await (await erc20.approve(this.escrowContract.target, params.amount)).wait();

      tx = await this.escrowContract.createEscrowERC20(
        token,
        params.amount,
        params.toAgentId,
        params.config.zkmlModelCommitment || ethers.ZeroHash,
        params.config.requiredApprovalRate || 80,
        params.config.timeoutSeconds || 86400
      );
    }

    const receipt = await tx.wait();

    // Extract escrow ID from event
    const event = receipt.logs.find(
      (log: { fragment?: { name: string } }) => log.fragment?.name === "EscrowCreated"
    );

    return {
      escrowId: event?.args[0] || ethers.ZeroHash,
      fromAgentId: myAgentId,
      toAgentId: params.toAgentId,
      amount: params.amount,
      token,
      config: params.config,
      status: EscrowStatus.Active,
      createdAt: Date.now(),
    };
  }

  /**
   * Release escrow with zkML proof
   */
  async releaseEscrow(
    escrowId: string,
    zkmlAttestationHash: string
  ): Promise<{ success: boolean; txHash?: string }> {
    if (!this.escrowContract) {
      throw new Error("Escrow contract not configured");
    }

    try {
      const tx = await this.escrowContract.releaseWithProof(escrowId, zkmlAttestationHash);
      const receipt = await tx.wait();

      return { success: true, txHash: receipt.hash };
    } catch (error) {
      console.error("Escrow release failed:", error);
      return { success: false };
    }
  }
}

// ============================================================================
// Contract ABIs (ERC-8004 Compliant)
// ============================================================================

const IDENTITY_REGISTRY_ABI = [
  // ERC-721 Standard
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
  "function getApproved(uint256 tokenId) external view returns (address)",
  // ERC-8004 IdentityRegistry
  "function register() external returns (uint256 agentId)",
  "function register(string tokenUri) external returns (uint256 agentId)",
  "function register(string tokenUri, tuple(string key, bytes value)[] metadata) external returns (uint256 agentId)",
  "function getMetadata(uint256 agentId, string key) external view returns (bytes)",
  "function setMetadata(uint256 agentId, string key, bytes value) external",
  "function setAgentUri(uint256 agentId, string newUri) external",
  // zkML Extensions
  "function registerWithModel(string tokenUri, bytes32 modelCommitment, address wallet) external returns (uint256 agentId)",
  "function modelCommitments(uint256 agentId) external view returns (bytes32)",
  "function agentWallets(uint256 agentId) external view returns (address)",
  "function getAgentByWallet(address wallet) external view returns (uint256)",
  "function setModelCommitment(uint256 agentId, bytes32 modelCommitment) external",
  "function setAgentWallet(uint256 agentId, address wallet) external",
  // Events
  "event Registered(uint256 indexed agentId, string tokenURI, address indexed owner)",
  "event ModelCommitmentSet(uint256 indexed agentId, bytes32 modelCommitment)",
  "event AgentWalletSet(uint256 indexed agentId, address indexed wallet)",
];

const REPUTATION_REGISTRY_ABI = [
  // ERC-8004 ReputationRegistry
  "function giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string feedbackUri, bytes32 feedbackHash, bytes feedbackAuth) external",
  "function giveOpenFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string feedbackUri, bytes32 feedbackHash) external",
  "function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external",
  "function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseUri, bytes32 responseHash) external",
  "function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 index) external view returns (uint8 score, bytes32 tag1, bytes32 tag2, bool isRevoked)",
  "function getSummary(uint256 agentId, address[] clientAddresses, bytes32 tag1, bytes32 tag2) external view returns (uint64 count, uint8 averageScore)",
  "function getClients(uint256 agentId) external view returns (address[])",
  // Events
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint8 score, bytes32 indexed tag1, bytes32 tag2, string feedbackUri, bytes32 feedbackHash)",
  "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)",
];

const VALIDATION_REGISTRY_ABI = [
  // ERC-8004 ValidationRegistry
  "function validationRequest(address validatorAddress, uint256 agentId, string requestUri, bytes32 requestHash) external",
  "function validationResponse(bytes32 requestHash, uint8 response, string responseUri, bytes32 responseHash, bytes32 tag) external",
  "function getValidationStatus(bytes32 requestHash) external view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, bytes32 tag, uint256 lastUpdate)",
  "function getSummary(uint256 agentId, address[] validatorAddresses, bytes32 tag) external view returns (uint64 count, uint8 avgResponse)",
  "function getAgentValidations(uint256 agentId) external view returns (bytes32[])",
  "function getValidatorRequests(address validatorAddress) external view returns (bytes32[])",
  // zkML Extensions
  "function registerZkmlValidator(address validator, bool active) external",
  "function zkmlValidators(address validator) external view returns (bool)",
  "function postZkmlAttestation(uint256 agentId, bytes32 modelCommitment, bytes32 inputHash, bytes32 outputHash, bytes32 proofHash, uint8 decision, uint96 confidence) external returns (bytes32 attestationHash)",
  "function verifyZkmlAttestation(bytes32 attestationHash, bytes32 expectedModel, uint8 expectedDecision) external view returns (bool valid)",
  "function getZkmlAttestation(bytes32 attestationHash) external view returns (tuple(bytes32 modelCommitment, bytes32 inputHash, bytes32 outputHash, bytes32 proofHash, uint8 decision, uint96 confidence, uint256 timestamp, address attester))",
  "function getAgentAttestations(uint256 agentId) external view returns (bytes32[])",
  "function getZkmlTrustScore(uint256 agentId, bytes32 modelCommitment) external view returns (uint64 attestationCount, uint8 approvalRate, uint96 avgConfidence)",
  "function meetsZkmlTrustRequirements(uint256 agentId, uint64 minAttestations, uint8 minApprovalRate, bytes32 requiredModel) external view returns (bool meets)",
  // Events
  "event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestUri, bytes32 indexed requestHash)",
  "event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseUri, bytes32 responseHash, bytes32 tag)",
  "event ZkmlAttestationPosted(bytes32 indexed attestationHash, uint256 indexed agentId, bytes32 modelCommitment, uint8 decision, uint96 confidence)",
];

const ESCROW_ABI = [
  "function createEscrow(uint256 toAgentId, bytes32 modelCommitment, uint256 requiredApprovalRate, uint256 timeout) external payable returns (bytes32)",
  "function createEscrowERC20(address token, uint256 amount, uint256 toAgentId, bytes32 modelCommitment, uint256 requiredApprovalRate, uint256 timeout) external returns (bytes32)",
  "function releaseWithProof(bytes32 escrowId, bytes32 attestationHash) external",
  "event EscrowCreated(bytes32 indexed escrowId, uint256 indexed fromAgentId, uint256 indexed toAgentId, uint256 amount)",
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

// ============================================================================
// Convenience Exports
// ============================================================================

export { AgentPaymentRails as default };

/**
 * Create payment rails with ERC-8004 configuration
 */
export function createPaymentRails(
  signer: Signer,
  config: ERC8004Config
): AgentPaymentRails {
  return new AgentPaymentRails(signer, config);
}

/**
 * Default trust requirements for payments
 */
export const DEFAULT_TRUST_REQUIREMENTS: TrustRequirements = {
  minReputationScore: 50,
  minReputationCount: 3,
  minZkmlApprovalRate: 70,
  minZkmlAttestations: 1,
  requireZkmlProof: false,
};
