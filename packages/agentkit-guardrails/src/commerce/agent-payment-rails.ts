/**
 * Agent-to-Agent Payment Rails
 *
 * Enables autonomous commerce between AI agents with zkML-verified trust.
 * This module provides the infrastructure for agents to:
 * - Pay other agents with trust verification
 * - Request payments with proof of service
 * - Escrow funds with zkML-gated release
 * - Build payment channels for high-frequency interactions
 *
 * @module commerce/agent-payment-rails
 */

import { ethers, Contract, Signer, BigNumberish } from "ethers";

// ============================================================================
// Types
// ============================================================================

/**
 * Agent identity as registered on-chain
 */
export interface AgentIdentity {
  did: string;
  wallet: string;
  owner: string;
  modelCommitment: string;
  reputationScore: number;
  totalTransactions: number;
  totalVolume: bigint;
  status: AgentStatus;
}

export enum AgentStatus {
  Active = 0,
  Suspended = 1,
  Deactivated = 2,
}

/**
 * Trust requirements for a payment
 */
export interface TrustRequirements {
  minReputation: number;
  requiredCredentials: string[];
  minTrustLevel: number;
  requireZkmlProof: boolean;
}

/**
 * Payment request from one agent to another
 */
export interface AgentPaymentRequest {
  fromAgent: string; // DID
  toAgent: string; // DID
  amount: bigint;
  token: string; // Token address (address(0) for ETH)
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
  zkmlProofHash?: string;
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
  requiredConfidence?: number;
  timeoutSeconds?: number;
  requiredSigners?: string[];
  oracleAddress?: string;
}

/**
 * Escrow state
 */
export interface Escrow {
  escrowId: string;
  fromAgent: string;
  toAgent: string;
  amount: bigint;
  token: string;
  config: EscrowConfig;
  status: EscrowStatus;
  createdAt: number;
  releasedAt?: number;
  zkmlProofHash?: string;
}

export enum EscrowStatus {
  Active = "active",
  Released = "released",
  Refunded = "refunded",
  Disputed = "disputed",
}

// ============================================================================
// Agent Payment Rails Class
// ============================================================================

/**
 * AgentPaymentRails - Infrastructure for agent-to-agent payments
 *
 * @example
 * ```typescript
 * const rails = new AgentPaymentRails(signer, {
 *   identityRegistryAddress: "0x...",
 *   escrowContractAddress: "0x...",
 *   proverServiceUrl: "http://localhost:3001"
 * });
 *
 * // Pay another agent with trust verification
 * const payment = await rails.payAgent({
 *   toAgent: "did:coinbase:agent:0x...",
 *   amount: ethers.parseEther("10"),
 *   token: USDC_ADDRESS,
 *   trustRequirements: {
 *     minReputation: 200,
 *     requireZkmlProof: true
 *   }
 * });
 * ```
 */
export class AgentPaymentRails {
  private signer: Signer;
  private identityRegistry: Contract;
  private escrowContract: Contract | null = null;
  private proverServiceUrl: string;
  private myAgentDid: string | null = null;

  constructor(
    signer: Signer,
    config: {
      identityRegistryAddress: string;
      escrowContractAddress?: string;
      proverServiceUrl?: string;
    }
  ) {
    this.signer = signer;
    this.proverServiceUrl = config.proverServiceUrl || "http://localhost:3001";

    // Initialize identity registry contract
    this.identityRegistry = new Contract(
      config.identityRegistryAddress,
      IDENTITY_REGISTRY_ABI,
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
  // Identity Management
  // ==========================================================================

  /**
   * Register this agent's identity on-chain
   */
  async registerIdentity(
    modelCommitment: string,
    metadataUri: string = ""
  ): Promise<string> {
    const wallet = await this.signer.getAddress();
    const tx = await this.identityRegistry.createAgentIdentity(
      wallet,
      modelCommitment,
      metadataUri
    );
    const receipt = await tx.wait();

    // Extract DID from event
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "AgentIdentityCreated"
    );
    if (event) {
      this.myAgentDid = event.args[0];
      return this.myAgentDid;
    }

    throw new Error("Failed to extract DID from transaction");
  }

  /**
   * Get my agent DID (cached or lookup)
   */
  async getMyAgentDid(): Promise<string> {
    if (this.myAgentDid) return this.myAgentDid;

    const wallet = await this.signer.getAddress();
    this.myAgentDid = await this.identityRegistry.walletToDid(wallet);

    if (this.myAgentDid === ethers.ZeroHash) {
      throw new Error("Agent not registered. Call registerIdentity first.");
    }

    return this.myAgentDid;
  }

  /**
   * Get another agent's identity
   */
  async getAgentIdentity(agentDid: string): Promise<AgentIdentity> {
    const identity = await this.identityRegistry.getAgent(agentDid);
    return {
      did: identity.did,
      wallet: identity.wallet,
      owner: identity.owner,
      modelCommitment: identity.modelCommitment,
      reputationScore: Number(identity.reputationScore),
      totalTransactions: Number(identity.totalTransactions),
      totalVolume: identity.totalVolume,
      status: Number(identity.status) as AgentStatus,
    };
  }

  // ==========================================================================
  // Trust Verification
  // ==========================================================================

  /**
   * Verify an agent meets trust requirements
   */
  async verifyAgentTrust(
    agentDid: string,
    requirements: TrustRequirements
  ): Promise<{ verified: boolean; reason?: string }> {
    // Get agent identity
    const agent = await this.getAgentIdentity(agentDid);

    // Check status
    if (agent.status !== AgentStatus.Active) {
      return { verified: false, reason: "Agent is not active" };
    }

    // Check reputation
    if (agent.reputationScore < requirements.minReputation) {
      return {
        verified: false,
        reason: `Reputation ${agent.reputationScore} below minimum ${requirements.minReputation}`,
      };
    }

    // Check credentials
    for (const credential of requirements.requiredCredentials) {
      const hasCredential = await this.identityRegistry.hasValidCredential(
        agentDid,
        credential
      );
      if (!hasCredential) {
        return { verified: false, reason: `Missing credential: ${credential}` };
      }
    }

    // Check trust level if we have a relationship
    if (requirements.minTrustLevel > 0) {
      const myDid = await this.getMyAgentDid();
      const [trustLevel] = await this.identityRegistry.getTrust(myDid, agentDid);
      if (Number(trustLevel) < requirements.minTrustLevel) {
        return {
          verified: false,
          reason: `Trust level ${trustLevel} below minimum ${requirements.minTrustLevel}`,
        };
      }
    }

    // Generate zkML proof if required
    if (requirements.requireZkmlProof) {
      const proofResult = await this.generateTrustProof(agentDid, requirements);
      if (!proofResult.success) {
        return { verified: false, reason: "Failed to generate zkML trust proof" };
      }
    }

    return { verified: true };
  }

  /**
   * Generate a zkML proof of trust verification
   */
  async generateTrustProof(
    agentDid: string,
    requirements: TrustRequirements
  ): Promise<{ success: boolean; proofHash?: string }> {
    try {
      const agent = await this.getAgentIdentity(agentDid);

      // Prepare features for the authorization model
      const features = [
        Math.min(15, Math.floor(agent.reputationScore / 100)), // budget proxy
        Math.min(7, Math.floor(agent.reputationScore / 150)), // trust
        requirements.minReputation / 100, // amount proxy
        0, // category
        Math.min(7, agent.totalTransactions % 8), // velocity
        new Date().getDay(), // day
        Math.floor(new Date().getHours() / 8), // time bucket
        agent.status === AgentStatus.Active ? 0 : 1, // risk
      ];

      const response = await fetch(`${this.proverServiceUrl}/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: "trust-verification",
          inputs: features,
        }),
      });

      const result = await response.json();

      if (result.success) {
        return { success: true, proofHash: result.proof };
      }

      return { success: false };
    } catch (error) {
      console.error("Trust proof generation failed:", error);
      return { success: false };
    }
  }

  // ==========================================================================
  // Payments
  // ==========================================================================

  /**
   * Pay another agent with trust verification
   */
  async payAgent(params: {
    toAgent: string;
    amount: bigint;
    token?: string;
    memo?: string;
    trustRequirements?: Partial<TrustRequirements>;
  }): Promise<AgentPayment> {
    const requirements: TrustRequirements = {
      minReputation: params.trustRequirements?.minReputation ?? 100,
      requiredCredentials: params.trustRequirements?.requiredCredentials ?? [],
      minTrustLevel: params.trustRequirements?.minTrustLevel ?? 0,
      requireZkmlProof: params.trustRequirements?.requireZkmlProof ?? false,
    };

    // Verify recipient meets trust requirements
    const verification = await this.verifyAgentTrust(params.toAgent, requirements);
    if (!verification.verified) {
      throw new Error(`Trust verification failed: ${verification.reason}`);
    }

    // Get recipient wallet
    const recipientIdentity = await this.getAgentIdentity(params.toAgent);
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

    // Record interaction
    const myDid = await this.getMyAgentDid();
    await this.identityRegistry.recordInteraction(myDid, params.toAgent, true);

    // Generate payment ID
    const paymentId = ethers.keccak256(
      ethers.solidityPacked(
        ["string", "string", "uint256", "uint256"],
        [myDid, params.toAgent, params.amount, Date.now()]
      )
    );

    return {
      paymentId,
      request: {
        fromAgent: myDid,
        toAgent: params.toAgent,
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
    fromAgent: string;
    amount: bigint;
    token?: string;
    memo?: string;
    serviceProofHash?: string;
  }): Promise<AgentPaymentRequest> {
    const myDid = await this.getMyAgentDid();

    return {
      fromAgent: params.fromAgent,
      toAgent: myDid,
      amount: params.amount,
      token: params.token || ethers.ZeroAddress,
      memo: params.memo || "",
      trustRequirements: {
        minReputation: 0,
        requiredCredentials: [],
        minTrustLevel: 0,
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
    toAgent: string;
    amount: bigint;
    token?: string;
    config: EscrowConfig;
  }): Promise<Escrow> {
    if (!this.escrowContract) {
      throw new Error("Escrow contract not configured");
    }

    const myDid = await this.getMyAgentDid();
    const token = params.token || ethers.ZeroAddress;

    // Create escrow on-chain
    let tx;
    if (token === ethers.ZeroAddress) {
      tx = await this.escrowContract.createEscrow(
        params.toAgent,
        params.config.zkmlModelCommitment || ethers.ZeroHash,
        params.config.requiredConfidence || 80,
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
        params.toAgent,
        params.config.zkmlModelCommitment || ethers.ZeroHash,
        params.config.requiredConfidence || 80,
        params.config.timeoutSeconds || 86400
      );
    }

    const receipt = await tx.wait();

    // Extract escrow ID from event
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "EscrowCreated"
    );

    return {
      escrowId: event?.args[0] || ethers.ZeroHash,
      fromAgent: myDid,
      toAgent: params.toAgent,
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
    zkmlProofHash: string
  ): Promise<{ success: boolean; txHash?: string }> {
    if (!this.escrowContract) {
      throw new Error("Escrow contract not configured");
    }

    try {
      const tx = await this.escrowContract.releaseWithProof(escrowId, zkmlProofHash);
      const receipt = await tx.wait();

      return { success: true, txHash: receipt.hash };
    } catch (error) {
      console.error("Escrow release failed:", error);
      return { success: false };
    }
  }

  // ==========================================================================
  // Trust Management
  // ==========================================================================

  /**
   * Establish trust with another agent
   */
  async establishTrust(toAgent: string, trustLevel: number): Promise<void> {
    const myDid = await this.getMyAgentDid();
    await this.identityRegistry.establishTrust(myDid, toAgent, trustLevel);
  }

  /**
   * Get trust level with another agent
   */
  async getTrustLevel(toAgent: string): Promise<{
    trustLevel: number;
    successRate: number;
  }> {
    const myDid = await this.getMyAgentDid();
    const [level, rate] = await this.identityRegistry.getTrust(myDid, toAgent);
    return {
      trustLevel: Number(level),
      successRate: Number(rate),
    };
  }
}

// ============================================================================
// Contract ABIs (minimal)
// ============================================================================

const IDENTITY_REGISTRY_ABI = [
  "function createAgentIdentity(address wallet, bytes32 modelCommitment, string metadataUri) external returns (bytes32)",
  "function getAgent(bytes32 agentDid) external view returns (tuple(bytes32 did, address wallet, address owner, bytes32 modelCommitment, uint256 reputationScore, uint256 totalTransactions, uint256 totalVolume, uint256 createdAt, uint256 lastActiveAt, uint8 status, string metadataUri))",
  "function walletToDid(address wallet) external view returns (bytes32)",
  "function hasValidCredential(bytes32 agentDid, bytes32 credentialType) external view returns (bool)",
  "function getTrust(bytes32 fromDid, bytes32 toDid) external view returns (uint256 level, uint256 successRate)",
  "function establishTrust(bytes32 fromDid, bytes32 toDid, uint256 trustLevel) external",
  "function recordInteraction(bytes32 fromDid, bytes32 toDid, bool successful) external",
  "event AgentIdentityCreated(bytes32 indexed agentDid, address indexed wallet, address indexed owner, bytes32 modelCommitment, uint256 timestamp)",
];

const ESCROW_ABI = [
  "function createEscrow(bytes32 toAgent, bytes32 modelCommitment, uint256 requiredConfidence, uint256 timeout) external payable returns (bytes32)",
  "function createEscrowERC20(address token, uint256 amount, bytes32 toAgent, bytes32 modelCommitment, uint256 requiredConfidence, uint256 timeout) external returns (bytes32)",
  "function releaseWithProof(bytes32 escrowId, bytes32 proofHash) external",
  "event EscrowCreated(bytes32 indexed escrowId, bytes32 indexed fromAgent, bytes32 indexed toAgent, uint256 amount)",
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
 * Create payment rails with default configuration
 */
export function createPaymentRails(
  signer: Signer,
  identityRegistryAddress: string,
  options?: {
    escrowContractAddress?: string;
    proverServiceUrl?: string;
  }
): AgentPaymentRails {
  return new AgentPaymentRails(signer, {
    identityRegistryAddress,
    escrowContractAddress: options?.escrowContractAddress,
    proverServiceUrl: options?.proverServiceUrl,
  });
}
