/**
 * Jolt Atlas Prover Service Client
 *
 * TypeScript client for communicating with the Jolt Atlas prover service.
 * Handles proof generation and verification requests.
 */

import type { FeatureVector, PolicyDecision } from '../core/types.js';

/**
 * Prover service configuration
 */
export interface ProverServiceConfig {
  /** Base URL of the prover service */
  endpoint: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** API key for authentication (if required) */
  apiKey?: string;

  /** Whether to retry on failure */
  retryOnFailure?: boolean;

  /** Number of retries */
  maxRetries?: number;
}

/**
 * Public inputs embedded in proofs
 */
export interface PublicInputs {
  modelCommitment: string;
  inputHash: string;
  outputHash: string;
  output: number[];
  timestamp: number;
}

/**
 * Result from proof generation
 */
export interface ProverResult {
  /** Base64-encoded proof */
  proof: string;

  /** Model commitment hash */
  modelCommitment: string;

  /** Input hash */
  inputHash: string;

  /** Output hash */
  outputHash: string;

  /** Public inputs */
  publicInputs: PublicInputs;

  /** Proving time in ms */
  provingTimeMs: number;
}

/**
 * Result from proof verification
 */
export interface VerificationResult {
  /** Whether the proof is valid */
  valid: boolean;

  /** Verification time in ms */
  verificationTimeMs: number;

  /** Error message if invalid */
  error?: string;
}

/**
 * Model registration result
 */
export interface ModelRegistrationResult {
  modelId: string;
  commitment: string;
}

/**
 * Client for the Jolt Atlas prover service
 */
export class ProverServiceClient {
  private readonly config: Required<ProverServiceConfig>;

  constructor(config: ProverServiceConfig) {
    this.config = {
      endpoint: config.endpoint.replace(/\/$/, ''), // Remove trailing slash
      timeout: config.timeout ?? 30000,
      apiKey: config.apiKey ?? '',
      retryOnFailure: config.retryOnFailure ?? true,
      maxRetries: config.maxRetries ?? 3,
    };
  }

  /**
   * Check if the prover service is healthy
   */
  async healthCheck(): Promise<{ status: string; version: string; prover: string }> {
    const response = await this.request<{ status: string; version: string; prover: string }>(
      'GET',
      '/health'
    );
    return response;
  }

  /**
   * Register an ONNX model with the prover service
   */
  async registerModel(
    name: string,
    modelBytes: Uint8Array | Buffer,
    description?: string
  ): Promise<ModelRegistrationResult> {
    const modelBase64 = Buffer.from(modelBytes).toString('base64');

    const response = await this.request<{
      success: boolean;
      model_id: string;
      commitment: string;
      error?: string;
    }>('POST', '/models', {
      name,
      model_bytes: modelBase64,
      description,
    });

    if (!response.success) {
      throw new Error(`Model registration failed: ${response.error}`);
    }

    return {
      modelId: response.model_id,
      commitment: response.commitment,
    };
  }

  /**
   * Get model commitment by ID
   */
  async getModelCommitment(modelId: string): Promise<string> {
    const response = await this.request<{ model_id: string; commitment: string }>(
      'GET',
      `/models/${modelId}/commitment`
    );
    return response.commitment;
  }

  /**
   * Generate a proof for model inference
   */
  async generateProof(
    modelId: string,
    inputs: number[] | FeatureVector,
    expectedOutput?: number[]
  ): Promise<ProverResult> {
    // Convert FeatureVector to array if needed
    const inputArray = Array.isArray(inputs)
      ? inputs
      : this.featureVectorToArray(inputs);

    const response = await this.request<{
      success: boolean;
      proof: string;
      model_commitment: string;
      input_hash: string;
      output_hash: string;
      public_inputs: {
        model_commitment: string;
        input_hash: string;
        output_hash: string;
        output: number[];
        timestamp: number;
      };
      proving_time_ms: number;
      error?: string;
    }>('POST', '/prove', {
      model_id: modelId,
      inputs: inputArray,
      expected_output: expectedOutput,
    });

    if (!response.success) {
      throw new Error(`Proof generation failed: ${response.error}`);
    }

    return {
      proof: response.proof,
      modelCommitment: response.model_commitment,
      inputHash: response.input_hash,
      outputHash: response.output_hash,
      publicInputs: {
        modelCommitment: response.public_inputs.model_commitment,
        inputHash: response.public_inputs.input_hash,
        outputHash: response.public_inputs.output_hash,
        output: response.public_inputs.output,
        timestamp: response.public_inputs.timestamp,
      },
      provingTimeMs: response.proving_time_ms,
    };
  }

  /**
   * Verify a proof
   */
  async verifyProof(
    proof: string,
    modelCommitment: string,
    inputHash: string,
    outputHash: string,
    publicInputs?: PublicInputs
  ): Promise<VerificationResult> {
    const response = await this.request<{
      valid: boolean;
      verification_time_ms: number;
      error?: string;
    }>('POST', '/verify', {
      proof,
      model_commitment: modelCommitment,
      input_hash: inputHash,
      output_hash: outputHash,
      public_inputs: publicInputs
        ? {
            model_commitment: publicInputs.modelCommitment,
            input_hash: publicInputs.inputHash,
            output_hash: publicInputs.outputHash,
            output: publicInputs.output,
            timestamp: publicInputs.timestamp,
          }
        : undefined,
    });

    return {
      valid: response.valid,
      verificationTimeMs: response.verification_time_ms,
      error: response.error,
    };
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
   * Make HTTP request to prover service
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Prover service error (${response.status}): ${errorBody}`);
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error as Error;

        if (!this.config.retryOnFailure || attempt === this.config.maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Prover service request failed: ${lastError?.message}`);
  }
}

/**
 * Default prover service client instance
 */
let defaultClient: ProverServiceClient | null = null;

/**
 * Get or create the default prover service client
 */
export function getProverServiceClient(config?: ProverServiceConfig): ProverServiceClient {
  if (!defaultClient || config) {
    const endpoint = config?.endpoint ??
      process.env.JOLT_ATLAS_PROVER_URL ??
      'http://localhost:3001';

    defaultClient = new ProverServiceClient({
      endpoint,
      ...config,
    });
  }
  return defaultClient;
}

/**
 * Check if prover service is available
 */
export async function isProverServiceAvailable(endpoint?: string): Promise<boolean> {
  try {
    const client = new ProverServiceClient({
      endpoint: endpoint ?? process.env.JOLT_ATLAS_PROVER_URL ?? 'http://localhost:3001',
      timeout: 5000,
      retryOnFailure: false,
    });
    await client.healthCheck();
    return true;
  } catch {
    return false;
  }
}
