/**
 * Trustless Agent Marketplace
 *
 * Full integration of x402 + ERC-8004 + Kinic + zkML for agent-to-agent commerce.
 *
 * The marketplace enables:
 * - Agents to discover each other via Kinic semantic search
 * - Trust verification via ERC-8004 registries
 * - Micropayments via x402 HTTP protocol
 * - Verifiable execution via zkML proofs
 *
 * @module commerce/trustless-marketplace
 */

import { ethers, Signer } from 'ethers';
import {
  AgentPaymentRails,
  type ERC8004Config,
  type AgentIdentity,
  type TrustRequirements,
  type ZkmlTrustScore,
  type AgentReputation,
} from './agent-payment-rails.js';
import {
  X402Client,
  type X402ClientConfig,
  type X402PaymentRequired,
  type X402PaymentResult,
} from './x402-client.js';
import {
  AgentMemory,
  type AgentMemoryConfig,
  type MemoryEntry,
  type SearchResult,
  StorageType,
} from '../memory/index.js';
import {
  checkAction,
  type GuardrailConfig,
  type GuardrailResult,
  type ActionContext,
} from '../core/guardrail.js';
import { PolicyDecision } from '../core/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent service listing in the marketplace
 */
export interface AgentService {
  /** ERC-8004 agent ID */
  agentId: number;
  /** Service type (e.g., 'data-analysis', 'content-generation') */
  serviceType: string;
  /** Human-readable description */
  description: string;
  /** Base price in USDC (6 decimals) */
  basePrice: string;
  /** Endpoint URL for service requests */
  endpoint: string;
  /** Model commitment for verification */
  modelCommitment: string;
  /** Required trust score to use this service */
  requiredTrustScore?: number;
  /** Tags for discovery */
  tags: string[];
}

/**
 * Service request from one agent to another
 */
export interface ServiceRequest {
  /** Unique request ID */
  requestId: string;
  /** Requesting agent ID */
  fromAgentId: number;
  /** Service provider agent ID */
  toAgentId: number;
  /** Service type */
  serviceType: string;
  /** Request payload */
  payload: Record<string, unknown>;
  /** Price agreed upon */
  price: string;
  /** Created timestamp */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number;
}

/**
 * Service response with proof
 */
export interface ServiceResponse {
  /** Request ID this responds to */
  requestId: string;
  /** Response payload */
  result: Record<string, unknown>;
  /** zkML proof of execution */
  proof?: string;
  /** Attestation hash on-chain */
  attestationHash?: string;
  /** Completed timestamp */
  completedAt: number;
  /** Success status */
  success: boolean;
}

/**
 * Marketplace configuration
 */
export interface MarketplaceConfig {
  /** ERC-8004 contract addresses */
  erc8004: ERC8004Config;
  /** x402 client configuration */
  x402: Omit<X402ClientConfig, 'signer'>;
  /** Kinic memory configuration */
  memory?: Partial<AgentMemoryConfig>;
  /** Default guardrail configuration */
  guardrail?: Partial<GuardrailConfig>;
}

/**
 * Discovery options for finding agents
 */
export interface DiscoveryOptions {
  /** Service type to search for */
  serviceType?: string;
  /** Semantic search query */
  query?: string;
  /** Minimum trust score */
  minTrustScore?: number;
  /** Maximum price */
  maxPrice?: string;
  /** Required tags */
  tags?: string[];
  /** Maximum results */
  limit?: number;
}

/**
 * Service execution options
 */
export interface ExecutionOptions {
  /** Whether to require zkML proof */
  requireProof?: boolean;
  /** Whether to post attestation on-chain */
  postAttestation?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Trust requirements for the provider */
  trustRequirements?: Partial<TrustRequirements>;
}

// ============================================================================
// TrustlessMarketplace Class
// ============================================================================

/**
 * TrustlessMarketplace - Full agent-to-agent commerce platform
 *
 * @example
 * ```typescript
 * const marketplace = new TrustlessMarketplace(signer, {
 *   erc8004: {
 *     identityRegistryAddress: '0x...',
 *     reputationRegistryAddress: '0x...',
 *     validationRegistryAddress: '0x...',
 *   },
 *   x402: { network: 'base-sepolia' },
 * });
 *
 * // Initialize (registers agent if needed)
 * await marketplace.initialize();
 *
 * // Discover service providers
 * const providers = await marketplace.discoverAgents({
 *   query: 'data analysis with ML',
 *   minTrustScore: 70,
 * });
 *
 * // Execute service with payment
 * const result = await marketplace.executeService(providers[0].agentId, {
 *   serviceType: 'data-analysis',
 *   payload: { data: [...] },
 *   requireProof: true,
 * });
 * ```
 */
export class TrustlessMarketplace {
  private signer: Signer;
  private config: MarketplaceConfig;
  private rails: AgentPaymentRails;
  private x402: X402Client;
  private memory: AgentMemory;
  private myAgentId: number | null = null;
  private initialized: boolean = false;

  constructor(signer: Signer, config: MarketplaceConfig) {
    this.signer = signer;
    this.config = config;

    // Initialize ERC-8004 payment rails
    this.rails = new AgentPaymentRails(signer, config.erc8004);

    // Initialize x402 client
    this.x402 = new X402Client({
      signer,
      ...config.x402,
    });

    // Initialize Kinic memory
    this.memory = new AgentMemory({
      stores: [
        {
          type: StorageType.Kinic,
          config: {
            canisterId: config.memory?.stores?.[0]?.config?.canisterId || 'mock',
          },
        },
      ],
      ...config.memory,
    });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the marketplace (register agent if needed)
   */
  async initialize(modelCommitment?: string): Promise<void> {
    if (this.initialized) return;

    // Initialize memory
    await this.memory.initialize();

    // Check if already registered
    try {
      this.myAgentId = await this.rails.getMyAgentId();
    } catch {
      // Not registered - register now
      const commitment = modelCommitment || ethers.ZeroHash;
      this.myAgentId = await this.rails.registerIdentity(
        commitment,
        '' // tokenUri
      );
    }

    this.initialized = true;
  }

  /**
   * Get my agent ID
   */
  async getMyAgentId(): Promise<number> {
    if (!this.initialized) await this.initialize();
    if (this.myAgentId === undefined) {
      throw new Error('Agent ID not set after initialization');
    }
    return this.myAgentId;
  }

  // ==========================================================================
  // Service Registration
  // ==========================================================================

  /**
   * Register a service in the marketplace
   */
  async registerService(service: Omit<AgentService, 'agentId'>): Promise<string> {
    const agentId = await this.getMyAgentId();

    // Create service listing
    const listing: AgentService = {
      ...service,
      agentId,
    };

    // Store in Kinic for discovery
    const result = await this.memory.insert({
      content: JSON.stringify(listing),
      embedding: [], // Will be generated
      metadata: {
        type: 'service-listing',
        agentId: String(agentId),
        serviceType: service.serviceType,
        price: service.basePrice,
        tags: service.tags.join(','),
      },
    });

    // Also store as agent metadata on-chain
    await this.rails.setMetadata(
      `service:${service.serviceType}`,
      JSON.stringify({
        endpoint: service.endpoint,
        basePrice: service.basePrice,
        description: service.description,
      })
    );

    return result.id;
  }

  /**
   * Update a service listing
   */
  async updateService(
    serviceType: string,
    updates: Partial<AgentService>
  ): Promise<void> {
    const agentId = await this.getMyAgentId();

    // Search for existing listing
    const existing = await this.memory.search({
      query: `service ${serviceType} agent ${agentId}`,
      limit: 1,
      filter: {
        type: 'service-listing',
        agentId: String(agentId),
        serviceType,
      },
    });

    if (existing.results.length === 0) {
      throw new Error(`Service ${serviceType} not found`);
    }

    // Parse and update
    const current = JSON.parse(existing.results[0].content) as AgentService;
    const updated = { ...current, ...updates };

    // Re-insert (Kinic will handle update)
    await this.memory.insert({
      content: JSON.stringify(updated),
      embedding: [],
      metadata: {
        type: 'service-listing',
        agentId: String(agentId),
        serviceType: updated.serviceType,
        price: updated.basePrice,
        tags: updated.tags.join(','),
      },
    });
  }

  // ==========================================================================
  // Agent Discovery
  // ==========================================================================

  /**
   * Discover agents providing services
   */
  async discoverAgents(options: DiscoveryOptions = {}): Promise<AgentService[]> {
    const query = options.query || options.serviceType || 'service provider';

    // Search Kinic
    const searchResult = await this.memory.search({
      query,
      limit: options.limit || 10,
      filter: {
        type: 'service-listing',
        ...(options.serviceType && { serviceType: options.serviceType }),
      },
    });

    // Parse results
    const services: AgentService[] = [];

    for (const result of searchResult.results) {
      try {
        const service = JSON.parse(result.content) as AgentService;

        // Filter by trust score
        if (options.minTrustScore) {
          const trustScore = await this.getAgentTrustScore(service.agentId);
          if (trustScore.approvalRate < options.minTrustScore) continue;
        }

        // Filter by price
        if (options.maxPrice) {
          if (BigInt(service.basePrice) > BigInt(options.maxPrice)) continue;
        }

        // Filter by tags
        if (options.tags && options.tags.length > 0) {
          const hasAllTags = options.tags.every((tag) =>
            service.tags.includes(tag)
          );
          if (!hasAllTags) continue;
        }

        services.push(service);
      } catch {
        // Invalid listing, skip
      }
    }

    return services;
  }

  /**
   * Get detailed agent information
   */
  async getAgentDetails(agentId: number): Promise<{
    identity: AgentIdentity;
    reputation: AgentReputation;
    trustScore: ZkmlTrustScore;
    services: AgentService[];
  }> {
    const [identity, reputation, trustScore] = await Promise.all([
      this.rails.getAgentIdentity(agentId),
      this.rails.getAgentReputation(agentId),
      this.rails.getZkmlTrustScore(agentId),
    ]);

    // Search for agent's services
    const servicesResult = await this.memory.search({
      query: `services by agent ${agentId}`,
      limit: 20,
      filter: {
        type: 'service-listing',
        agentId: String(agentId),
      },
    });

    const services = servicesResult.results
      .map((r) => {
        try {
          return JSON.parse(r.content) as AgentService;
        } catch {
          return null;
        }
      })
      .filter((s): s is AgentService => s !== null);

    return { identity, reputation, trustScore, services };
  }

  /**
   * Get agent's zkML trust score
   */
  async getAgentTrustScore(agentId: number): Promise<ZkmlTrustScore> {
    return this.rails.getZkmlTrustScore(agentId);
  }

  // ==========================================================================
  // Service Execution with Payment
  // ==========================================================================

  /**
   * Execute a service with x402 payment
   *
   * This is the main entry point for agent-to-agent commerce:
   * 1. Verify provider trust via ERC-8004
   * 2. Make paid HTTP request via x402
   * 3. Verify response with zkML proof
   * 4. Record interaction in Kinic
   * 5. Update reputation
   */
  async executeService(
    toAgentId: number,
    params: {
      serviceType: string;
      payload: Record<string, unknown>;
      endpoint?: string;
    },
    options: ExecutionOptions = {}
  ): Promise<ServiceResponse> {
    const fromAgentId = await this.getMyAgentId();
    const requestId = ethers.hexlify(ethers.randomBytes(16));
    const startTime = Date.now();

    // 1. Verify provider trust
    const trustRequirements: TrustRequirements = {
      minReputationScore: options.trustRequirements?.minReputationScore ?? 50,
      minReputationCount: options.trustRequirements?.minReputationCount ?? 1,
      minZkmlApprovalRate: options.trustRequirements?.minZkmlApprovalRate ?? 70,
      minZkmlAttestations: options.trustRequirements?.minZkmlAttestations ?? 1,
      requireZkmlProof: options.requireProof ?? false,
    };

    const trustVerification = await this.rails.verifyAgentTrust(
      toAgentId,
      trustRequirements
    );

    if (!trustVerification.verified) {
      throw new Error(`Trust verification failed: ${trustVerification.reason}`);
    }

    // 2. Get provider details and endpoint
    const providerDetails = await this.getAgentDetails(toAgentId);
    const service = providerDetails.services.find(
      (s) => s.serviceType === params.serviceType
    );

    const endpoint = params.endpoint || service?.endpoint;
    if (!endpoint) {
      throw new Error(`No endpoint found for service ${params.serviceType}`);
    }

    // 3. Make paid request via x402
    const request: ServiceRequest = {
      requestId,
      fromAgentId,
      toAgentId,
      serviceType: params.serviceType,
      payload: params.payload,
      price: service?.basePrice || '0',
      createdAt: startTime,
      expiresAt: startTime + (options.timeoutMs || 60000),
    };

    const paymentResult = await this.x402.paidFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        'X-From-Agent': String(fromAgentId),
        ...(options.requireProof && { 'X-Require-Proof': 'true' }),
      },
      body: JSON.stringify(params.payload),
    });

    if (!paymentResult.success || !paymentResult.response) {
      // Record failed interaction
      await this.recordInteraction(request, {
        requestId,
        result: { error: paymentResult.error || 'Payment failed' },
        completedAt: Date.now(),
        success: false,
      });

      throw new Error(`Service execution failed: ${paymentResult.error}`);
    }

    // 4. Parse response and verify proof
    const responseData = await paymentResult.response.json();
    const proof = paymentResult.response.headers.get('X-Proof');
    const attestationHash = paymentResult.response.headers.get('X-Attestation-Hash');

    // Verify proof if required
    if (options.requireProof && !proof) {
      throw new Error('Proof required but not provided');
    }

    if (proof && options.requireProof) {
      // Verify the proof matches expected execution
      const guardrailResult = await this.verifyServiceProof(
        toAgentId,
        params.serviceType,
        params.payload,
        responseData,
        proof
      );

      if (guardrailResult.decision !== PolicyDecision.APPROVE) {
        throw new Error('Proof verification failed');
      }
    }

    // 5. Record successful interaction
    const response: ServiceResponse = {
      requestId,
      result: responseData,
      proof: proof || undefined,
      attestationHash: attestationHash || undefined,
      completedAt: Date.now(),
      success: true,
    };

    await this.recordInteraction(request, response);

    // 6. Submit positive feedback
    try {
      await this.rails.submitOpenFeedback(
        toAgentId,
        90, // High score for successful execution
        params.serviceType,
        `request:${requestId}`
      );
    } catch {
      // Feedback is optional
    }

    return response;
  }

  /**
   * Verify a service execution proof
   */
  private async verifyServiceProof(
    agentId: number,
    serviceType: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    proof: string
  ): Promise<GuardrailResult> {
    const action: ActionContext = {
      actionType: `service:${serviceType}`,
      params: { input, output, proof },
      timestamp: Date.now(),
    };

    const config: GuardrailConfig = {
      policyModel: this.config.guardrail?.policyModel || 'mock',
      proofMode: 'never', // We're verifying, not generating
      onProofFail: 'reject',
      onModelReject: 'block',
      ...this.config.guardrail,
    };

    return checkAction(action, config);
  }

  /**
   * Record an interaction in Kinic memory
   */
  private async recordInteraction(
    request: ServiceRequest,
    response: ServiceResponse
  ): Promise<void> {
    await this.memory.insert({
      content: JSON.stringify({
        type: 'interaction',
        request,
        response,
      }),
      embedding: [],
      metadata: {
        type: 'interaction',
        fromAgentId: String(request.fromAgentId),
        toAgentId: String(request.toAgentId),
        serviceType: request.serviceType,
        success: String(response.success),
        hasProof: String(!!response.proof),
        timestamp: String(response.completedAt),
      },
    });
  }

  // ==========================================================================
  // Service Provider Methods
  // ==========================================================================

  /**
   * Handle an incoming service request (for service providers)
   */
  async handleServiceRequest(
    req: {
      requestId: string;
      fromAgentId: number;
      serviceType: string;
      payload: Record<string, unknown>;
      requireProof?: boolean;
    },
    handler: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>,
    options?: {
      guardrailConfig?: GuardrailConfig;
      postAttestation?: boolean;
    }
  ): Promise<{
    response: Record<string, unknown>;
    proof?: string;
    attestationHash?: string;
  }> {
    const toAgentId = await this.getMyAgentId();

    // Verify requester trust (optional)
    // const trustScore = await this.getAgentTrustScore(req.fromAgentId);

    // Execute with guardrails if configured
    let response: Record<string, unknown>;
    let guardrailResult: GuardrailResult | undefined;

    if (options?.guardrailConfig) {
      const action: ActionContext = {
        actionType: req.serviceType,
        params: req.payload,
        timestamp: Date.now(),
      };

      guardrailResult = await checkAction(action, options.guardrailConfig);

      if (guardrailResult.decision === PolicyDecision.REJECT) {
        throw new Error('Request rejected by guardrail');
      }
    }

    // Execute the handler
    response = await handler(req.payload);

    // Generate proof if required
    let proof: string | undefined;
    let attestationHash: string | undefined;

    if (req.requireProof && options?.guardrailConfig) {
      // Re-run with proof generation
      const proofConfig: GuardrailConfig = {
        ...options.guardrailConfig,
        proofMode: 'always',
      };

      const proofResult = await checkAction(
        {
          actionType: req.serviceType,
          params: { input: req.payload, output: response },
          timestamp: Date.now(),
        },
        proofConfig
      );

      proof = proofResult.proof;

      // Post attestation on-chain if configured
      if (options?.postAttestation && proof) {
        attestationHash = await this.rails.postZkmlAttestation(
          toAgentId,
          proofResult.modelCommitment,
          proofResult.inputHash,
          ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(response))),
          ethers.keccak256(ethers.toUtf8Bytes(proof)),
          1, // approve
          BigInt(Math.floor(proofResult.confidence * 1e18))
        );
      }
    }

    return { response, proof, attestationHash };
  }

  /**
   * Create a 402 Payment Required response
   */
  async createPaymentRequiredResponse(params: {
    price: string;
    serviceType: string;
    description?: string;
  }): Promise<X402PaymentRequired> {
    return this.x402.createPaymentRequest({
      amount: params.price,
      description: params.description || `Payment for ${params.serviceType}`,
      resource: params.serviceType,
    });
  }

  // ==========================================================================
  // Memory & History
  // ==========================================================================

  /**
   * Get interaction history with an agent
   */
  async getInteractionHistory(
    withAgentId: number,
    options?: { limit?: number; serviceType?: string }
  ): Promise<Array<{ request: ServiceRequest; response: ServiceResponse }>> {
    const myAgentId = await this.getMyAgentId();

    const result = await this.memory.search({
      query: `interactions with agent ${withAgentId}`,
      limit: options?.limit || 20,
      filter: {
        type: 'interaction',
        ...(options?.serviceType && { serviceType: options.serviceType }),
      },
    });

    return result.results
      .map((r) => {
        try {
          const data = JSON.parse(r.content);
          if (data.type !== 'interaction') return null;

          const { request, response } = data;

          // Filter to interactions involving both agents
          if (
            (request.fromAgentId === myAgentId && request.toAgentId === withAgentId) ||
            (request.fromAgentId === withAgentId && request.toAgentId === myAgentId)
          ) {
            return { request, response };
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter((i): i is { request: ServiceRequest; response: ServiceResponse } => i !== null);
  }

  /**
   * Search memory for past interactions
   */
  async searchMemory(query: string, limit: number = 10): Promise<SearchResult> {
    return this.memory.search({ query, limit });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get the underlying components for advanced use
   */
  getComponents(): {
    rails: AgentPaymentRails;
    x402: X402Client;
    memory: AgentMemory;
  } {
    return {
      rails: this.rails,
      x402: this.x402,
      memory: this.memory,
    };
  }
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Create a trustless marketplace instance
 */
export function createMarketplace(
  signer: Signer,
  config: MarketplaceConfig
): TrustlessMarketplace {
  return new TrustlessMarketplace(signer, config);
}

export default TrustlessMarketplace;
