/**
 * Agent Memory SDK (Kinic + Base Integration)
 *
 * Provides verifiable agent memory with:
 * - Kinic zkTAM for actual memory storage (Internet Computer)
 * - Base MemoryRegistry for commitment anchors (on-chain proofs)
 *
 * Architecture:
 * ┌─────────────────┐     ┌─────────────────┐
 * │   Kinic (IC)    │     │   Base Chain    │
 * │  Memory Data    │────▶│  Commitments    │
 * │  + Embeddings   │     │  + Proofs       │
 * └─────────────────┘     └─────────────────┘
 *
 * @module memory/agent-memory
 */

import { ethers, Contract, Signer } from "ethers";
import { getKinicServiceUrl } from "../config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Storage backend types
 */
export enum StorageType {
  IPFS = 0,
  Arweave = 1,
  InternetComputer = 2,
  HTTP = 3,
  Custom = 4,
}

/**
 * Memory operation types
 */
export enum OperationType {
  Insert = 0,
  Update = 1,
  Delete = 2,
  Search = 3,
}

/**
 * Memory store configuration
 */
export interface MemoryStoreConfig {
  name: string;
  description: string;
  storageType: StorageType;
  useKinic: boolean;
}

/**
 * Memory store info
 */
export interface MemoryStore {
  memoryId: string;
  storageUri: string;
  merkleRoot: string;
  memoryCount: number;
  lastUpdated: number;
  storageType: StorageType;
}

/**
 * Memory entry
 */
export interface MemoryEntry {
  tag: string;
  content: string;
  contentHash: string;
  embeddingHash: string;
  metadata?: Record<string, unknown>;
}

/**
 * Memory insertion result
 */
export interface InsertResult {
  success: boolean;
  contentHash: string;
  embeddingHash: string;
  merkleRoot: string;
  zkProof?: string;
  attestationHash?: string; // On-chain attestation
}

/**
 * Search result
 */
export interface SearchResult {
  content: string;
  tag: string;
  similarity: number;
  contentHash: string;
}

/**
 * Knowledge domain credential
 */
export interface KnowledgeCredential {
  domain: string;
  domainHash: string;
  proofHash: string;
  memoryCount: number;
  verifiedAt: number;
  verifier: string;
}

/**
 * Memory integrity score
 */
export interface MemoryIntegrityScore {
  score: number; // 0-100
  attestationCount: number;
  knowledgeDomains: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface AgentMemoryConfig {
  // Base contracts
  identityRegistryAddress: string;
  memoryRegistryAddress: string;

  // Kinic service
  kinicServiceUrl?: string;

  // Agent identity
  agentId?: number;
}

// ============================================================================
// Agent Memory Class
// ============================================================================

/**
 * AgentMemory - Verifiable agent memory with Kinic + Base
 *
 * @example
 * ```typescript
 * const memory = new AgentMemory(signer, {
 *   identityRegistryAddress: IDENTITY_REGISTRY,
 *   memoryRegistryAddress: MEMORY_REGISTRY,
 *   kinicServiceUrl: 'http://localhost:3002',
 *   agentId: 42,
 * });
 *
 * // Create memory store
 * await memory.createStore({
 *   name: 'agent-knowledge',
 *   description: 'Trading strategies and market data',
 *   storageType: StorageType.InternetComputer,
 *   useKinic: true,
 * });
 *
 * // Insert memory with zkML proof
 * const result = await memory.insert('strategy', 'Buy low, sell high...');
 * console.log(result.zkProof); // Kinic embedding proof
 * console.log(result.attestationHash); // Base attestation
 *
 * // Search with verification
 * const results = await memory.search('trading strategy');
 * ```
 */
export class AgentMemory {
  private signer: Signer;
  private memoryRegistry: Contract;
  private identityRegistry: Contract;
  private kinicServiceUrl: string;
  private agentId: number | null;
  private memoryId: string | null = null;

  constructor(signer: Signer, config: AgentMemoryConfig) {
    this.signer = signer;
    this.kinicServiceUrl = config.kinicServiceUrl || getKinicServiceUrl();
    this.agentId = config.agentId || null;

    this.memoryRegistry = new Contract(
      config.memoryRegistryAddress,
      MEMORY_REGISTRY_ABI,
      signer
    );

    this.identityRegistry = new Contract(
      config.identityRegistryAddress,
      IDENTITY_REGISTRY_ABI,
      signer
    );
  }

  // ==========================================================================
  // Store Management
  // ==========================================================================

  /**
   * Create a new memory store
   */
  async createStore(config: MemoryStoreConfig): Promise<string> {
    if (!this.agentId) {
      throw new Error("Agent ID required. Set agentId in config.");
    }

    let storageUri = "";
    let memoryId = "";

    // Create Kinic canister if enabled
    if (config.useKinic) {
      const response = await fetch(`${this.kinicServiceUrl}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          use_ic: config.storageType === StorageType.InternetComputer,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Kinic creation failed: ${result.error}`);
      }

      memoryId = result.memory_id;
      storageUri = result.canister_id
        ? `ic://${result.canister_id}`
        : `kinic://${memoryId}`;
    } else {
      // Generate local memory ID
      memoryId = ethers.keccak256(
        ethers.toUtf8Bytes(`${config.name}:${Date.now()}`)
      ).slice(0, 34);
      storageUri = `local://${memoryId}`;
    }

    // Register on Base
    const tx = await this.memoryRegistry.createMemoryStore(
      this.agentId,
      storageUri,
      config.storageType
    );
    await tx.wait();

    this.memoryId = memoryId;
    return memoryId;
  }

  /**
   * Get memory store info
   */
  async getStore(): Promise<MemoryStore | null> {
    if (!this.agentId) return null;

    const [storageUri, merkleRoot, memoryCount, lastUpdated, storageType] =
      await this.memoryRegistry.getMemoryStore(this.agentId);

    if (lastUpdated === 0n) return null;

    return {
      memoryId: this.memoryId || "",
      storageUri,
      merkleRoot,
      memoryCount: Number(memoryCount),
      lastUpdated: Number(lastUpdated),
      storageType: Number(storageType),
    };
  }

  // ==========================================================================
  // Memory Operations
  // ==========================================================================

  /**
   * Insert a memory with zkML embedding proof
   */
  async insert(
    tag: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<InsertResult> {
    if (!this.agentId || !this.memoryId) {
      throw new Error("Memory store not initialized. Call createStore first.");
    }

    // Insert into Kinic
    const kinicResponse = await fetch(
      `${this.kinicServiceUrl}/memories/${this.memoryId}/insert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, content, metadata }),
      }
    );

    const kinicResult = await kinicResponse.json();
    if (!kinicResult.success) {
      throw new Error(`Kinic insert failed: ${kinicResult.error}`);
    }

    // Post attestation on Base
    const tx = await this.memoryRegistry.postMemoryAttestation(
      this.agentId,
      OperationType.Insert,
      kinicResult.content_hash,
      kinicResult.embedding_hash,
      kinicResult.zk_proof || ethers.ZeroHash,
      kinicResult.merkle_root
    );
    const receipt = await tx.wait();

    // Extract attestation hash from event
    const event = receipt.logs.find(
      (log: { fragment?: { name: string } }) => log.fragment?.name === "MemoryAttestationPosted"
    );

    return {
      success: true,
      contentHash: kinicResult.content_hash,
      embeddingHash: kinicResult.embedding_hash,
      merkleRoot: kinicResult.merkle_root,
      zkProof: kinicResult.zk_proof,
      attestationHash: event?.args?.[0],
    };
  }

  /**
   * Search memories with semantic similarity
   */
  async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.memoryId) {
      throw new Error("Memory store not initialized.");
    }

    const response = await fetch(
      `${this.kinicServiceUrl}/memories/${this.memoryId}/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit }),
      }
    );

    const result = await response.json();
    if (!result.success) {
      throw new Error(`Search failed: ${result.error}`);
    }

    return result.results;
  }

  /**
   * Get current commitment (Merkle root) from Kinic
   */
  async getCommitment(): Promise<{
    merkleRoot: string;
    memoryCount: number;
    synced: boolean;
  }> {
    if (!this.memoryId || !this.agentId) {
      throw new Error("Memory store not initialized.");
    }

    // Get from Kinic
    const response = await fetch(
      `${this.kinicServiceUrl}/memories/${this.memoryId}/commitment`
    );
    const kinicCommitment = await response.json();

    // Get from Base
    const store = await this.getStore();

    return {
      merkleRoot: kinicCommitment.merkle_root,
      memoryCount: kinicCommitment.memory_count,
      synced: store?.merkleRoot === kinicCommitment.merkle_root,
    };
  }

  /**
   * Sync commitment to Base (anchor Kinic state on-chain)
   */
  async syncCommitment(): Promise<string> {
    if (!this.memoryId || !this.agentId) {
      throw new Error("Memory store not initialized.");
    }

    const response = await fetch(
      `${this.kinicServiceUrl}/memories/${this.memoryId}/commitment`
    );
    const commitment = await response.json();

    const tx = await this.memoryRegistry.updateCommitment(
      this.agentId,
      commitment.merkle_root,
      commitment.memory_count,
      ethers.ZeroHash // No zkProof for sync
    );
    await tx.wait();

    return commitment.merkle_root;
  }

  // ==========================================================================
  // Verification
  // ==========================================================================

  /**
   * Verify a memory exists in the store
   */
  async verifyMemory(
    contentHash: string,
    proof: string[]
  ): Promise<boolean> {
    if (!this.agentId) return false;

    return await this.memoryRegistry.verifyMemoryInclusion(
      this.agentId,
      contentHash,
      proof
    );
  }

  /**
   * Get memory integrity score
   */
  async getIntegrityScore(): Promise<MemoryIntegrityScore> {
    if (!this.agentId) {
      throw new Error("Agent ID required.");
    }

    const [score, attestationCount, knowledgeDomains] =
      await this.memoryRegistry.getMemoryIntegrityScore(this.agentId);

    return {
      score: Number(score),
      attestationCount: Number(attestationCount),
      knowledgeDomains: Number(knowledgeDomains),
    };
  }

  // ==========================================================================
  // Knowledge Credentials
  // ==========================================================================

  /**
   * Check if agent has knowledge in a domain
   */
  async hasKnowledge(domain: string): Promise<{
    hasKnowledge: boolean;
    memoryCount: number;
  }> {
    if (!this.agentId) {
      throw new Error("Agent ID required.");
    }

    const domainHash = ethers.keccak256(ethers.toUtf8Bytes(domain));
    const [has, count] = await this.memoryRegistry.hasKnowledge(
      this.agentId,
      domainHash
    );

    return {
      hasKnowledge: has,
      memoryCount: Number(count),
    };
  }

  /**
   * Get all knowledge domains for the agent
   */
  async getKnowledgeDomains(): Promise<string[]> {
    if (!this.agentId) {
      throw new Error("Agent ID required.");
    }

    const domains = await this.memoryRegistry.getAgentDomains(this.agentId);
    return domains;
  }

  /**
   * Check if agent meets memory requirements
   */
  async meetsMemoryRequirements(
    requiredDomains: string[],
    minAttestations: number
  ): Promise<boolean> {
    if (!this.agentId) return false;

    const domainHashes = requiredDomains.map((d) =>
      ethers.keccak256(ethers.toUtf8Bytes(d))
    );

    return await this.memoryRegistry.meetsMemoryRequirements(
      this.agentId,
      domainHashes,
      minAttestations
    );
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Set agent ID (if not set in constructor)
   */
  setAgentId(agentId: number): void {
    this.agentId = agentId;
  }

  /**
   * Set memory ID (for existing stores)
   */
  setMemoryId(memoryId: string): void {
    this.memoryId = memoryId;
  }

  /**
   * Get Kinic service health
   */
  async checkKinicHealth(): Promise<{
    healthy: boolean;
    kinicAvailable: boolean;
  }> {
    try {
      const response = await fetch(`${this.kinicServiceUrl}/health`);
      const result = await response.json();
      return {
        healthy: result.status === "healthy",
        kinicAvailable: result.kinic_available,
      };
    } catch {
      return { healthy: false, kinicAvailable: false };
    }
  }
}

// ============================================================================
// Contract ABIs
// ============================================================================

const MEMORY_REGISTRY_ABI = [
  // Store management
  "function createMemoryStore(uint256 agentId, string storageUri, uint8 storageType) external",
  "function updateStorageUri(uint256 agentId, string newUri, uint8 newType) external",
  "function getMemoryStore(uint256 agentId) external view returns (string storageUri, bytes32 merkleRoot, uint256 memoryCount, uint256 lastUpdated, uint8 storageType)",

  // Commitments
  "function updateCommitment(uint256 agentId, bytes32 newRoot, uint256 memoryCount, bytes32 zkProof) external",
  "function postMemoryAttestation(uint256 agentId, uint8 operation, bytes32 contentHash, bytes32 embeddingHash, bytes32 zkProof, bytes32 newRoot) external returns (bytes32 attestationHash)",

  // Verification
  "function verifyMemoryInclusion(uint256 agentId, bytes32 contentHash, bytes32[] proof) external view returns (bool)",
  "function getMemoryIntegrityScore(uint256 agentId) external view returns (uint8 score, uint64 attestationCount, uint64 knowledgeDomains)",

  // Knowledge
  "function hasKnowledge(uint256 agentId, bytes32 domain) external view returns (bool, uint256)",
  "function getAgentDomains(uint256 agentId) external view returns (bytes32[])",
  "function meetsMemoryRequirements(uint256 agentId, bytes32[] requiredDomains, uint64 minAttestations) external view returns (bool)",

  // Events
  "event MemoryStoreCreated(uint256 indexed agentId, string storageUri, uint8 storageType)",
  "event MemoryCommitmentUpdated(uint256 indexed agentId, bytes32 indexed previousRoot, bytes32 indexed newRoot, uint256 memoryCount)",
  "event MemoryAttestationPosted(bytes32 indexed attestationHash, uint256 indexed agentId, uint8 operation, bytes32 contentHash)",
];

const IDENTITY_REGISTRY_ABI = [
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

// ============================================================================
// Exports
// ============================================================================

export { AgentMemory as default };

/**
 * Create agent memory with config
 */
export function createAgentMemory(
  signer: Signer,
  config: AgentMemoryConfig
): AgentMemory {
  return new AgentMemory(signer, config);
}

/**
 * Common knowledge domains
 */
export const KNOWLEDGE_DOMAINS = {
  SOLIDITY: ethers.keccak256(ethers.toUtf8Bytes("solidity")),
  TRADING: ethers.keccak256(ethers.toUtf8Bytes("trading")),
  DEFI: ethers.keccak256(ethers.toUtf8Bytes("defi")),
  LEGAL: ethers.keccak256(ethers.toUtf8Bytes("legal")),
  MEDICAL: ethers.keccak256(ethers.toUtf8Bytes("medical")),
  SECURITY: ethers.keccak256(ethers.toUtf8Bytes("security")),
};
