/**
 * Core types for Jolt Atlas AgentKit Guardrails
 */

/**
 * Decision output from a policy model
 */
export enum PolicyDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  REVIEW = 'review', // requires human review
}

/**
 * Configuration for a zkML guardrail
 */
export interface GuardrailConfig {
  /** Path to ONNX policy model or model identifier */
  policyModel: string | PolicyModelConfig;

  /** When to generate proofs */
  proofMode: 'always' | 'on-reject' | 'on-approve' | 'never';

  /** What to do when proof generation fails */
  onProofFail: 'reject' | 'allow' | 'review';

  /** What to do when model rejects the action */
  onModelReject: 'block' | 'warn' | 'log';

  /** Optional: custom feature extractor */
  featureExtractor?: FeatureExtractor;

  /** Optional: attestation configuration */
  attestation?: AttestationConfig;
}

/**
 * Policy model configuration
 */
export interface PolicyModelConfig {
  /** Path to ONNX model file */
  path: string;

  /** Model version/commitment hash */
  version?: string;

  /** Human-readable model name */
  name?: string;

  /** Expected input schema */
  inputSchema?: InputSchema;

  /** Decision threshold (0-1) for classification models */
  threshold?: number;
}

/**
 * Input schema for policy models
 */
export interface InputSchema {
  features: FeatureDefinition[];
}

export interface FeatureDefinition {
  name: string;
  type: 'number' | 'boolean' | 'category';
  description?: string;
  required?: boolean;
  default?: number | boolean | string;
}

/**
 * Feature extractor function type
 */
export type FeatureExtractor = (
  action: ActionContext,
  walletContext?: WalletContext
) => Promise<FeatureVector> | FeatureVector;

/**
 * Feature vector passed to policy model
 */
export interface FeatureVector {
  [key: string]: number | boolean;
}

/**
 * Context about the action being guarded
 */
export interface ActionContext {
  /** Action type (e.g., 'transfer', 'swap', 'deploy') */
  actionType: string;

  /** Action parameters */
  params: Record<string, unknown>;

  /** Timestamp */
  timestamp: number;

  /** Optional: previous actions in session */
  history?: ActionHistoryEntry[];
}

export interface ActionHistoryEntry {
  actionType: string;
  timestamp: number;
  decision: PolicyDecision;
  success: boolean;
}

/**
 * Wallet context for feature extraction
 */
export interface WalletContext {
  /** Wallet address */
  address: string;

  /** Chain ID */
  chainId: number;

  /** Current balance (in wei for native, or token units) */
  balance?: bigint;

  /** Daily spend so far */
  dailySpend?: bigint;

  /** Configured spend limit */
  spendLimit?: bigint;
}

/**
 * Attestation configuration
 */
export interface AttestationConfig {
  /** Whether to sign attestations */
  enabled: boolean;

  /** Signer for EIP-712 attestations */
  signer?: AttestationSigner;

  /** Whether to post attestation hash onchain */
  postOnchain?: boolean;

  /** Contract address for attestation registry */
  registryAddress?: string;

  /** Chain ID for onchain attestations */
  chainId?: number;
}

/**
 * Attestation signer interface
 */
export interface AttestationSigner {
  address: string;
  signTypedData: (domain: EIP712Domain, types: EIP712Types, value: Record<string, unknown>) => Promise<string>;
}

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export type EIP712Types = Record<string, Array<{ name: string; type: string }>>;

/**
 * Result of a guardrail check
 */
export interface GuardrailResult {
  /** The decision made */
  decision: PolicyDecision;

  /** Confidence score (0-1) */
  confidence: number;

  /** Model commitment hash */
  modelCommitment: string;

  /** Input hash */
  inputHash: string;

  /** Proof bytes (if generated) */
  proof?: string;

  /** Signed attestation (if enabled) */
  attestation?: SignedAttestation;

  /** Timestamp */
  timestamp: number;

  /** Processing time in ms */
  processingTimeMs: number;
}

/**
 * Signed attestation of a guardrail decision
 */
export interface SignedAttestation {
  /** Attestation data */
  data: AttestationData;

  /** EIP-712 signature */
  signature: string;

  /** Signer address */
  signer: string;

  /** Attestation hash */
  hash: string;
}

export interface AttestationData {
  /** Model commitment */
  modelCommitment: string;

  /** Input hash */
  inputHash: string;

  /** Output/decision hash */
  outputHash: string;

  /** Decision */
  decision: PolicyDecision;

  /** Confidence */
  confidence: number;

  /** Timestamp */
  timestamp: number;

  /** Nonce for uniqueness */
  nonce: string;
}

/**
 * Wrapped action result including guardrail info
 */
export interface GuardrailedActionResult<T> {
  /** Original action result */
  result: T;

  /** Guardrail check result */
  guardrail: GuardrailResult;

  /** Whether action was allowed to proceed */
  allowed: boolean;
}

/**
 * Error thrown when guardrail blocks an action
 */
export class GuardrailBlockedError extends Error {
  constructor(
    message: string,
    public readonly guardrailResult: GuardrailResult,
    public readonly actionContext: ActionContext
  ) {
    super(message);
    this.name = 'GuardrailBlockedError';
  }
}
