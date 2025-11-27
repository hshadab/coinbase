/**
 * Core Guardrail Wrapper
 *
 * The main entry point for adding zkML guardrails to AgentKit actions.
 * Wraps any action with policy model inference, proof generation, and attestation.
 */

import {
  PolicyDecision,
  GuardrailBlockedError,
  type GuardrailConfig,
  type GuardrailResult,
  type GuardrailedActionResult,
  type ActionContext,
  type WalletContext,
  type SignedAttestation,
} from './types.js';
import { PolicyModel, getPolicyModel } from '../models/policy-model.js';
import { ProofGenerator, getProofGenerator } from '../proof/proof-generator.js';
import {
  createAttestationData,
  signAttestation,
  createUnsignedAttestation,
} from '../attestation/eip712.js';
import { defaultFeatureExtractor } from '../utils/feature-extractors.js';

/**
 * Default guardrail configuration
 */
const DEFAULT_CONFIG: Partial<GuardrailConfig> = {
  proofMode: 'always',
  onProofFail: 'reject',
  onModelReject: 'block',
};

/**
 * Guardrail instance that wraps actions
 */
export class Guardrail {
  private readonly config: GuardrailConfig;
  private readonly model: PolicyModel;
  private readonly prover: ProofGenerator;

  constructor(config: GuardrailConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.model = getPolicyModel(config.policyModel);
    this.prover = getProofGenerator();
  }

  /**
   * Check an action against the policy model
   */
  async check(
    action: ActionContext,
    wallet?: WalletContext
  ): Promise<GuardrailResult> {
    const startTime = Date.now();

    // Extract features
    const extractor = this.config.featureExtractor ?? defaultFeatureExtractor;
    const features = await extractor(action, wallet);

    // Run policy model
    const modelResult = await this.model.run(features);
    const modelCommitment = await this.model.getCommitment();

    // Generate proof if needed
    let proof: string | undefined;
    let inputHash: string = '';

    const shouldProve =
      this.config.proofMode === 'always' ||
      (this.config.proofMode === 'on-reject' && modelResult.decision === 'reject') ||
      (this.config.proofMode === 'on-approve' && modelResult.decision === 'approve');

    if (shouldProve) {
      try {
        const proofResult = await this.prover.generateProof(
          modelCommitment,
          features,
          modelResult.decision,
          modelResult.confidence
        );
        proof = proofResult.proof;
        inputHash = proofResult.inputHash;
      } catch (error) {
        console.error('[JoltAtlas] Proof generation failed:', error);

        if (this.config.onProofFail === 'reject') {
          return {
            decision: PolicyDecision.REJECT,
            confidence: 0,
            modelCommitment,
            inputHash: '',
            timestamp: Date.now(),
            processingTimeMs: Date.now() - startTime,
          };
        }
      }
    }

    // Create attestation if configured
    let attestation: SignedAttestation | undefined;

    if (this.config.attestation?.enabled) {
      const attestData = createAttestationData(
        modelCommitment,
        inputHash,
        modelResult.decision,
        modelResult.confidence
      );

      if (this.config.attestation.signer) {
        attestation = await signAttestation(
          attestData,
          this.config.attestation.signer,
          {
            chainId: this.config.attestation.chainId,
            verifyingContract: this.config.attestation.registryAddress as `0x${string}`,
          }
        );
      } else {
        // Create unsigned attestation for offchain use
        const unsigned = createUnsignedAttestation(
          modelCommitment,
          inputHash,
          modelResult.decision,
          modelResult.confidence
        );
        attestation = {
          ...unsigned,
          signature: '0x',
          signer: '0x0000000000000000000000000000000000000000',
        };
      }
    }

    return {
      decision: modelResult.decision,
      confidence: modelResult.confidence,
      modelCommitment,
      inputHash,
      proof,
      attestation,
      timestamp: Date.now(),
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Execute an action with guardrail check
   */
  async execute<T>(
    actionFn: () => Promise<T>,
    action: ActionContext,
    wallet?: WalletContext
  ): Promise<GuardrailedActionResult<T>> {
    const guardrailResult = await this.check(action, wallet);

    // Handle rejection
    if (guardrailResult.decision === 'reject') {
      if (this.config.onModelReject === 'block') {
        const error = new Error(
          `Action blocked by guardrail: ${action.actionType} rejected with confidence ${guardrailResult.confidence.toFixed(3)}`
        ) as GuardrailBlockedError;
        error.name = 'GuardrailBlockedError';
        (error as any).guardrailResult = guardrailResult;
        (error as any).actionContext = action;
        throw error;
      }

      if (this.config.onModelReject === 'warn') {
        console.warn(
          `[JoltAtlas] Action would be rejected: ${action.actionType}`,
          { decision: guardrailResult.decision, confidence: guardrailResult.confidence }
        );
      }
    }

    // Handle review decision
    if (guardrailResult.decision === 'review') {
      if (this.config.onModelReject === 'block') {
        const error = new Error(
          `Action requires review: ${action.actionType}`
        ) as GuardrailBlockedError;
        error.name = 'GuardrailBlockedError';
        (error as any).guardrailResult = guardrailResult;
        (error as any).actionContext = action;
        throw error;
      }
    }

    // Execute the action
    const result = await actionFn();

    return {
      result,
      guardrail: guardrailResult,
      allowed: true,
    };
  }
}

/**
 * Create a guardrailed version of an AgentKit action
 *
 * @example
 * ```typescript
 * const guardrailedTransfer = withZkGuardrail(
 *   agent.getAction('transfer'),
 *   {
 *     policyModel: './models/tx-authorization.onnx',
 *     proofMode: 'always',
 *     onModelReject: 'block',
 *   }
 * );
 *
 * // Now the action will be checked before execution
 * const result = await guardrailedTransfer({ to: '0x...', amount: '100' });
 * ```
 */
export function withZkGuardrail<TParams extends Record<string, unknown>, TResult>(
  action: (params: TParams) => Promise<TResult>,
  config: GuardrailConfig,
  options?: {
    /** Extract action type from params */
    getActionType?: (params: TParams) => string;
    /** Get wallet context */
    getWalletContext?: () => Promise<WalletContext> | WalletContext;
  }
): (params: TParams) => Promise<GuardrailedActionResult<TResult>> {
  const guardrail = new Guardrail(config);

  return async (params: TParams): Promise<GuardrailedActionResult<TResult>> => {
    // Build action context
    const actionContext: ActionContext = {
      actionType: options?.getActionType?.(params) ?? inferActionType(action, params),
      params: params as Record<string, unknown>,
      timestamp: Date.now(),
    };

    // Get wallet context if available
    const walletContext = await options?.getWalletContext?.();

    // Execute with guardrail
    return guardrail.execute(
      () => action(params),
      actionContext,
      walletContext
    );
  };
}

/**
 * Infer action type from function name or params
 */
function inferActionType<TParams>(
  action: (params: TParams) => Promise<unknown>,
  params: TParams
): string {
  // Try to get function name
  if (action.name) {
    return action.name;
  }

  // Infer from params
  const p = params as Record<string, unknown>;
  if ('to' in p && 'amount' in p) return 'transfer';
  if ('fromToken' in p && 'toToken' in p) return 'swap';
  if ('bytecode' in p) return 'deploy';
  if ('contractAddress' in p && 'method' in p) return 'contract_call';

  return 'unknown';
}

/**
 * Create a guardrail for checking actions without wrapping
 *
 * @example
 * ```typescript
 * const guardrail = createGuardrail({
 *   policyModel: './models/tx-authorization.onnx',
 * });
 *
 * const result = await guardrail.check({
 *   actionType: 'transfer',
 *   params: { to: '0x...', amount: '100' },
 *   timestamp: Date.now(),
 * });
 *
 * if (result.decision === 'approve') {
 *   // proceed with action
 * }
 * ```
 */
export function createGuardrail(config: GuardrailConfig): Guardrail {
  return new Guardrail(config);
}

/**
 * Quick check function for one-off guardrail evaluations
 */
export async function checkAction(
  action: ActionContext,
  config: GuardrailConfig,
  wallet?: WalletContext
): Promise<GuardrailResult> {
  const guardrail = new Guardrail(config);
  return guardrail.check(action, wallet);
}
