/**
 * Proof generation for zkML guardrails
 *
 * This module handles proof generation using Jolt Atlas.
 * For Phase 1, we use a mock prover that generates proof-like outputs.
 * In production, this integrates with the actual Jolt Atlas proving system.
 */

import type { FeatureVector, PolicyDecision } from '../core/types.js';
import { createHash, randomBytes } from 'crypto';

/**
 * Proof generation result
 */
export interface ProofResult {
  /** Proof bytes (hex encoded) */
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
  /** Use mock prover (for testing) */
  mock?: boolean;

  /** Jolt Atlas prover endpoint (for remote proving) */
  proverEndpoint?: string;

  /** Local WASM prover path */
  wasmProverPath?: string;
}

/**
 * Proof generator using Jolt Atlas
 */
export class ProofGenerator {
  private readonly config: ProverConfig;

  constructor(config: ProverConfig = {}) {
    this.config = {
      mock: true, // Default to mock for Phase 1
      ...config,
    };
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

    // Compute input hash
    const inputHash = this.hashFeatures(features);

    // Compute output hash
    const outputHash = this.hashOutput(decision, confidence);

    if (this.config.mock) {
      return this.generateMockProof(
        modelCommitment,
        inputHash,
        outputHash,
        startTime
      );
    }

    // TODO: Integrate with actual Jolt Atlas prover
    // For now, fall back to mock
    return this.generateMockProof(
      modelCommitment,
      inputHash,
      outputHash,
      startTime
    );
  }

  /**
   * Verify a proof
   */
  async verifyProof(proof: ProofResult): Promise<VerificationResult> {
    const startTime = Date.now();

    if (this.config.mock) {
      return this.verifyMockProof(proof, startTime);
    }

    // TODO: Integrate with actual Jolt Atlas verifier
    return this.verifyMockProof(proof, startTime);
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
   * Generate a mock proof for testing
   *
   * This creates a proof-like structure that mimics the real Jolt Atlas output.
   * The mock proof includes:
   * - A header indicating mock proof
   * - Model commitment
   * - Input/output hashes
   * - Random bytes to simulate proof data
   */
  private generateMockProof(
    modelCommitment: string,
    inputHash: string,
    outputHash: string,
    startTime: number
  ): ProofResult {
    // Mock proof structure
    const proofData = {
      version: 1,
      prover: 'jolt-atlas-mock',
      modelCommitment,
      inputHash,
      outputHash,
      timestamp: Date.now(),
      // Random proof bytes (simulating actual ZK proof)
      proofBytes: randomBytes(256).toString('hex'),
    };

    const proofJson = JSON.stringify(proofData);
    const proof = '0x' + Buffer.from(proofJson).toString('hex');

    return {
      proof,
      modelCommitment,
      inputHash,
      outputHash,
      provingTimeMs: Date.now() - startTime,
      proofSizeBytes: proof.length / 2 - 1, // hex to bytes
    };
  }

  /**
   * Verify a mock proof
   */
  private verifyMockProof(proof: ProofResult, startTime: number): VerificationResult {
    try {
      // Decode and validate mock proof structure
      const proofHex = proof.proof.startsWith('0x')
        ? proof.proof.slice(2)
        : proof.proof;
      const proofJson = Buffer.from(proofHex, 'hex').toString('utf-8');
      const proofData = JSON.parse(proofJson);

      // Verify structure
      if (proofData.prover !== 'jolt-atlas-mock') {
        return {
          valid: false,
          verificationTimeMs: Date.now() - startTime,
          error: 'Invalid prover identifier',
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
