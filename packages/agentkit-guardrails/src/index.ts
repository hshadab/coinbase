/**
 * @jolt-atlas/agentkit-guardrails
 *
 * zkML guardrails for Coinbase AgentKit - cryptographic proof that your agent
 * ran the policy it claimed, before it moves money onchain.
 *
 * @example
 * ```typescript
 * import { withZkGuardrail } from '@jolt-atlas/agentkit-guardrails';
 * import { AgentKit } from '@coinbase/agentkit';
 *
 * const agent = await AgentKit.from({ walletProvider: cdpWallet });
 *
 * // Wrap any action with zkML guardrails
 * const guardrailedTransfer = withZkGuardrail(
 *   agent.getAction('transfer'),
 *   {
 *     policyModel: './models/tx-authorization.onnx',
 *     proofMode: 'always',
 *     onModelReject: 'block',
 *   }
 * );
 *
 * // Action is now protected - no proof, no tx
 * const result = await guardrailedTransfer({
 *   to: '0x...',
 *   amount: '100',
 *   asset: 'USDC',
 * });
 *
 * console.log(result.guardrail.decision); // 'approve'
 * console.log(result.guardrail.proof);    // '0x...'
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

export {
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
  GuardrailBlockedError,
} from './core/types.js';

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
