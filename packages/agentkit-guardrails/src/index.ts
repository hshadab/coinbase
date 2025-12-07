/**
 * @trustless-agentkit/sdk
 *
 * Trustless AgentKit - Verifiable Compute (zkML) + Verifiable Memory (Kinic)
 * for Coinbase AgentKit. Make your agents trustless.
 *
 * Two Pillars:
 * - **Verifiable Compute**: zkML proofs that agent ran its policy (Jolt Atlas)
 * - **Verifiable Memory**: On-chain vector DB with zkML embeddings (Kinic)
 *
 * @example
 * ```typescript
 * import {
 *   createMarketplace,
 *   withZkGuardrail,
 *   AgentMemory,
 *   StorageType,
 * } from '@trustless-agentkit/sdk';
 *
 * // Setup marketplace with verifiable compute + memory
 * const marketplace = createMarketplace(signer, {
 *   erc8004: { identityRegistry, reputationRegistry, validationRegistry },
 *   x402: { network: 'base-sepolia' },
 * });
 *
 * // Discover agents via Kinic semantic search
 * const providers = await marketplace.discoverAgents({
 *   query: 'data analysis with ML',
 *   minTrustScore: 70,
 * });
 *
 * // Execute with x402 payment + zkML proof
 * const result = await marketplace.executeService(providers[0].agentId, {
 *   serviceType: 'data-analysis',
 *   payload: { data: [...] },
 * }, { requireProof: true });
 *
 * console.log(result.result);          // Service result
 * console.log(result.proof);           // zkML proof
 * console.log(result.attestationHash); // On-chain record
 * ```
 *
 * @packageDocumentation
 */

// Core exports
export {
  withZkGuardrail,
  createGuardrail,
  checkAction,
  Guardrail,
} from './core/guardrail.js';

export type {
  PolicyDecision,
  GuardrailConfig,
  GuardrailResult,
  GuardrailedActionResult,
  ActionContext,
  WalletContext,
  PolicyModelConfig,
  AttestationConfig,
  SignedAttestation,
  AttestationData,
  FeatureVector,
  FeatureExtractor,
} from './core/types.js';

export { GuardrailBlockedError } from './core/types.js';

// Model exports
export {
  PolicyModel,
  getPolicyModel,
  clearModelCache,
} from './models/policy-model.js';

// Proof exports
export {
  ProofGenerator,
  getProofGenerator,
  type ProofResult,
  type VerificationResult,
  type ProverConfig,
  // Prover service client
  ProverServiceClient,
  getProverServiceClient,
  isProverServiceAvailable,
} from './proof/proof-generator.js';

// Re-export prover client types
export type {
  ProverServiceConfig,
  PublicInputs,
  ProverResult,
  VerificationResult as ProverVerificationResult,
  ModelRegistrationResult,
} from './proof/prover-client.js';

// Attestation exports
export {
  signAttestation,
  createAttestationData,
  createUnsignedAttestation,
  verifyAttestationSignature,
  computeAttestationHash,
  encodeAttestationForOnchain,
  decodeAttestationFromOnchain,
  ATTESTATION_DOMAIN,
  ATTESTATION_TYPES,
} from './attestation/eip712.js';

// Feature extractor exports
export {
  defaultFeatureExtractor,
  transferFeatureExtractor,
  highValueFeatureExtractor,
} from './utils/feature-extractors.js';

// Commerce exports - Agent-to-Agent Payment Rails + x402 + Marketplace
export {
  // ERC-8004 Payment Rails
  AgentPaymentRails,
  createPaymentRails,
  type AgentIdentity,
  type AgentPayment,
  type AgentPaymentRequest,
  type TrustRequirements,
  type ZkmlTrustScore,
  type AgentReputation,
  type Escrow,
  type EscrowConfig,
  type ERC8004Config,
  PaymentStatus,
  EscrowStatus,
  // x402 HTTP Micropayments
  X402Client,
  createX402Client,
  create402Response,
  USDC_ADDRESSES,
  type X402ClientConfig,
  type X402PaymentRequired,
  type X402PaymentPayload,
  type X402PaymentResult,
  type PaymentScheme,
  // Trustless Marketplace
  TrustlessMarketplace,
  createMarketplace,
  type MarketplaceConfig,
  type AgentService,
  type ServiceRequest,
  type ServiceResponse,
  type DiscoveryOptions,
  type ExecutionOptions,
} from './commerce/index.js';

// Memory exports - Verifiable Agent Memory (Kinic + Base)
export {
  AgentMemory,
  createAgentMemory,
  StorageType,
  OperationType,
  KNOWLEDGE_DOMAINS,
  type AgentMemoryConfig,
  type MemoryStoreConfig,
  type MemoryStore,
  type MemoryEntry,
  type InsertResult,
  type SearchResult,
  type KnowledgeCredential,
  type MemoryIntegrityScore,
} from './memory/index.js';

// Configuration exports
export {
  getSDKConfig,
  getProverServiceUrl,
  getKinicServiceUrl,
  getRuntimeMode,
  isMockMode,
  DEFAULT_TIMEOUT_MS,
  HEALTH_CHECK_TIMEOUT_MS,
  ZERO_ADDRESS,
  type SDKConfig,
  type RuntimeMode,
} from './config.js';

// Model cache utilities
export { getModelCacheSize } from './models/policy-model.js';
