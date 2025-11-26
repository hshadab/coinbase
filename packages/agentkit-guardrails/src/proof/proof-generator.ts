/**
 * Proof generation for zkML guardrails
 *
 * This module handles proof generation using Jolt Atlas.
 * It supports three modes:
 * 1. Remote prover service (production) - calls the Rust prover service
 * 2. Mock prover (development) - generates mock proofs for testing
 * 3. Auto mode - uses prover service if available, falls back to mock
 */

import type { FeatureVector, PolicyDecision } from '../core/types.js';
import { createHash, randomBytes } from 'crypto';
import {
  ProverServiceClient,
  getProverServiceClient,
  isProverServiceAvailable,
  type PublicInputs,
} from './prover-client.js';

/**
 * Proof generation result
 */
export interface ProofResult {
  /** Proof bytes (base64 for real proofs, hex for mock) */
  proof: string;

  /** Model commitment */
  modelCommitment: string;

  /** Hash of input features */
  inputHash: string;

  /** Hash of output decision */
  outputHash: string;

  /** Proving time in milliseconds */
  provingTimeMs: number;

  /** Proof size in bytes */
  proofSizeBytes: number;

  /** Public inputs (for real proofs) */
  publicInputs?: PublicInputs;

  /** Whether this is a mock proof */
  isMock: boolean;
}

/**
 * Proof verification result
 */
export interface VerificationResult {
  /** Whether proof is valid */
  valid: boolean;

  /** Verification time in milliseconds */
  verificationTimeMs: number;

  /** Error message if invalid */
  error?: string;
}

/**
 * Configuration for proof generation
 */
export interface ProverConfig {
  /** Prover mode */
  mode?: 'auto' | 'service' | 'mock';

  /** Jolt Atlas prover service endpoint */
  proverEndpoint?: string;

  /** Model ID for the prover service */
  modelId?: string;

  /** API key for prover service */
  apiKey?: string;

  /** Timeout for prover requests (ms) */
  timeout?: number;
}

/**
 * Proof generator using Jolt Atlas
 */
export class ProofGenerator {
  private readonly config: ProverConfig;
  private proverClient: ProverServiceClient | null = null;
  private serviceAvailable: boolean | null = null;

  constructor(config: ProverConfig = {}) {
    this.config = {
      mode: config.mode ?? 'auto',
      proverEndpoint: config.proverEndpoint ?? process.env.JOLT_ATLAS_PROVER_URL,
      timeout: config.timeout ?? 30000,
      ...config,
    };

    // Initialize prover client if endpoint is configured
    if (this.config.proverEndpoint && this.config.mode !== 'mock') {
      this.proverClient = new ProverServiceClient({
        endpoint: this.config.proverEndpoint,
        apiKey: this.config.apiKey,
        timeout: this.config.timeout,
      });
    }
  }

  /**
   * Check if prover service is available
   */
  async checkServiceAvailability(): Promise<boolean> {
    if (this.serviceAvailable !== null) {
      return this.serviceAvailable;
    }

    if (!this.proverClient) {
      this.serviceAvailable = false;
      return false;
    }

    try {
      await this.proverClient.healthCheck();
      this.serviceAvailable = true;
      console.log('[JoltAtlas] Prover service connected');
    } catch {
      this.serviceAvailable = false;
      console.warn('[JoltAtlas] Prover service not available, using mock mode');
    }

    return this.serviceAvailable;
  }

  /**
   * Generate a ZK proof for a policy model inference
   */
  async generateProof(
    modelCommitment: string,
    features: FeatureVector,
    decision: PolicyDecision,
    confidence: number
  ): Promise<ProofResult> {
    const startTime = Date.now();

    // Compute hashes
    const inputHash = this.hashFeatures(features);
    const outputHash = this.hashOutput(decision, confidence);

    // Determine whether to use real prover
    const useService =
      this.config.mode === 'service' ||
      (this.config.mode === 'auto' && (await this.checkServiceAvailability()));

    if (useService && this.proverClient && this.config.modelId) {
      return this.generateRealProof(
        modelCommitment,
        features,
        decision,
        confidence,
        inputHash,
        outputHash,
        startTime
      );
    }

    // Fall back to mock
    return this.generateMockProof(modelCommitment, inputHash, outputHash, startTime);
  }

  /**
   * Generate a real proof using the prover service
   */
  private async generateRealProof(
    modelCommitment: string,
    features: FeatureVector,
    decision: PolicyDecision,
    confidence: number,
    inputHash: string,
    outputHash: string,
    startTime: number
  ): Promise<ProofResult> {
    if (!this.proverClient || !this.config.modelId) {
      throw new Error('Prover client not configured');
    }

    try {
      // Convert features to array
      const inputArray = this.featureVectorToArray(features);

      // Expected output based on decision
      const expectedOutput = this.decisionToOutput(decision, confidence);

      // Call prover service
      const result = await this.proverClient.generateProof(
        this.config.modelId,
        inputArray,
        expectedOutput
      );

      return {
        proof: result.proof,
        modelCommitment: result.modelCommitment,
        inputHash: result.inputHash,
        outputHash: result.outputHash,
        provingTimeMs: result.provingTimeMs,
        proofSizeBytes: Math.ceil((result.proof.length * 3) / 4), // Base64 to bytes estimate
        publicInputs: result.publicInputs,
        isMock: false,
      };
    } catch (error) {
      console.error('[JoltAtlas] Real proof generation failed:', error);

      // If in auto mode, fall back to mock
      if (this.config.mode === 'auto') {
        console.warn('[JoltAtlas] Falling back to mock proof');
        return this.generateMockProof(modelCommitment, inputHash, outputHash, startTime);
      }

      throw error;
    }
  }

  /**
   * Verify a proof
   */
  async verifyProof(proof: ProofResult): Promise<VerificationResult> {
    const startTime = Date.now();

    // If it's a mock proof, use mock verification
    if (proof.isMock) {
      return this.verifyMockProof(proof, startTime);
    }

    // Try real verification if service is available
    const useService =
      this.config.mode === 'service' ||
      (this.config.mode === 'auto' && (await this.checkServiceAvailability()));

    if (useService && this.proverClient) {
      return this.verifyRealProof(proof, startTime);
    }

    // Fall back to commitment verification only
    return this.verifyCommitmentsOnly(proof, startTime);
  }

  /**
   * Verify using the prover service
   */
  private async verifyRealProof(
    proof: ProofResult,
    startTime: number
  ): Promise<VerificationResult> {
    if (!this.proverClient) {
      throw new Error('Prover client not configured');
    }

    try {
      const result = await this.proverClient.verifyProof(
        proof.proof,
        proof.modelCommitment,
        proof.inputHash,
        proof.outputHash,
        proof.publicInputs
      );

      return {
        valid: result.valid,
        verificationTimeMs: result.verificationTimeMs,
        error: result.error,
      };
    } catch (error) {
      return {
        valid: false,
        verificationTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Verify commitments only (lightweight offchain verification)
   */
  private verifyCommitmentsOnly(
    proof: ProofResult,
    startTime: number
  ): VerificationResult {
    // For non-mock proofs without service, we can only verify the structure
    // and commitments match what's in the proof

    if (!proof.publicInputs) {
      return {
        valid: false,
        verificationTimeMs: Date.now() - startTime,
        error: 'Cannot verify: no public inputs and prover service unavailable',
      };
    }

    // Verify public inputs match
    const valid =
      proof.publicInputs.modelCommitment === proof.modelCommitment &&
      proof.publicInputs.inputHash === proof.inputHash &&
      proof.publicInputs.outputHash === proof.outputHash;

    return {
      valid,
      verificationTimeMs: Date.now() - startTime,
      error: valid ? undefined : 'Public inputs mismatch',
    };
  }

  /**
   * Hash feature vector for proof input
   */
  private hashFeatures(features: FeatureVector): string {
    const hash = createHash('sha256');

    // Sort keys for deterministic hashing
    const sortedKeys = Object.keys(features).sort();
    for (const key of sortedKeys) {
      const value = features[key];
      hash.update(`${key}:`);
      hash.update(String(value));
      hash.update('|');
    }

    return '0x' + hash.digest('hex');
  }

  /**
   * Hash output for proof
   */
  private hashOutput(decision: PolicyDecision, confidence: number): string {
    const hash = createHash('sha256');
    hash.update(decision);
    hash.update(':');
    hash.update(confidence.toFixed(6));
    return '0x' + hash.digest('hex');
  }

  /**
   * Convert feature vector to array
   */
  private featureVectorToArray(features: FeatureVector): number[] {
    const keys = Object.keys(features).sort();
    return keys.map(k => {
      const val = features[k];
      return typeof val === 'boolean' ? (val ? 1 : 0) : Number(val);
    });
  }

  /**
   * Convert decision to model output format
   */
  private decisionToOutput(decision: PolicyDecision, confidence: number): number[] {
    switch (decision) {
      case 'approve':
        return [1 - confidence, confidence];
      case 'reject':
        return [confidence, 1 - confidence];
      case 'review':
        return [0.33, 0.33, 0.34]; // Three-class output
      default:
        return [confidence];
    }
  }

  /**
   * Generate a mock proof for testing
   */
  private generateMockProof(
    modelCommitment: string,
    inputHash: string,
    outputHash: string,
    startTime: number
  ): ProofResult {
    // Create deterministic mock proof
    const proofSeed = createHash('sha256')
      .update(modelCommitment)
      .update(inputHash)
      .update(outputHash)
      .digest();

    const proofData = {
      version: 1,
      prover: 'jolt-atlas-mock-v1',
      modelCommitment,
      inputHash,
      outputHash,
      timestamp: Date.now(),
      // Deterministic "proof" data
      commitmentRandomness: proofSeed.slice(0, 16).toString('hex'),
      sumcheckProof: proofSeed.slice(16, 32).toString('hex'),
      lookupProof: createHash('sha256').update(proofSeed).update('lookup').digest('hex'),
    };

    const proofJson = JSON.stringify(proofData);
    const proof = Buffer.from(proofJson).toString('base64');

    return {
      proof,
      modelCommitment,
      inputHash,
      outputHash,
      provingTimeMs: Date.now() - startTime,
      proofSizeBytes: proofJson.length,
      isMock: true,
    };
  }

  /**
   * Verify a mock proof
   */
  private verifyMockProof(proof: ProofResult, startTime: number): VerificationResult {
    try {
      const proofJson = Buffer.from(proof.proof, 'base64').toString('utf-8');
      const proofData = JSON.parse(proofJson);

      // Verify version and prover
      if (proofData.version !== 1 || proofData.prover !== 'jolt-atlas-mock-v1') {
        return {
          valid: false,
          verificationTimeMs: Date.now() - startTime,
          error: 'Invalid mock proof version',
        };
      }

      // Verify commitments match
      if (proofData.modelCommitment !== proof.modelCommitment) {
        return {
          valid: false,
          verificationTimeMs: Date.now() - startTime,
          error: 'Model commitment mismatch',
        };
      }

      if (proofData.inputHash !== proof.inputHash) {
        return {
          valid: false,
          verificationTimeMs: Date.now() - startTime,
          error: 'Input hash mismatch',
        };
      }

      if (proofData.outputHash !== proof.outputHash) {
        return {
          valid: false,
          verificationTimeMs: Date.now() - startTime,
          error: 'Output hash mismatch',
        };
      }

      // Verify proof data is consistent (deterministic check)
      const expectedSeed = createHash('sha256')
        .update(proof.modelCommitment)
        .update(proof.inputHash)
        .update(proof.outputHash)
        .digest();

      const expectedCommitmentRandomness = expectedSeed.slice(0, 16).toString('hex');
      const expectedSumcheck = expectedSeed.slice(16, 32).toString('hex');

      if (proofData.commitmentRandomness !== expectedCommitmentRandomness) {
        return {
          valid: false,
          verificationTimeMs: Date.now() - startTime,
          error: 'Invalid proof: commitment randomness mismatch',
        };
      }

      if (proofData.sumcheckProof !== expectedSumcheck) {
        return {
          valid: false,
          verificationTimeMs: Date.now() - startTime,
          error: 'Invalid proof: sumcheck mismatch',
        };
      }

      return {
        valid: true,
        verificationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        valid: false,
        verificationTimeMs: Date.now() - startTime,
        error: `Proof parsing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }
}

/**
 * Default proof generator instance
 */
let defaultGenerator: ProofGenerator | null = null;

/**
 * Get or create the default proof generator
 */
export function getProofGenerator(config?: ProverConfig): ProofGenerator {
  if (!defaultGenerator || config) {
    defaultGenerator = new ProofGenerator(config);
  }
  return defaultGenerator;
}

// Re-export prover client utilities
export {
  ProverServiceClient,
  getProverServiceClient,
  isProverServiceAvailable,
} from './prover-client.js';
