/**
 * Policy model loader and runner
 * Handles ONNX model loading and inference
 */

import {
  PolicyDecision,
  type PolicyModelConfig,
  type FeatureVector,
} from '../core/types.js';

/**
 * Result from running a policy model
 */
export interface PolicyModelResult {
  decision: PolicyDecision;
  confidence: number;
  rawOutput: number[];
}

/**
 * Policy model wrapper for ONNX inference
 */
export class PolicyModel {
  private session: unknown | null = null;
  private readonly config: PolicyModelConfig;
  private commitment: string | null = null;

  constructor(config: PolicyModelConfig | string) {
    this.config = typeof config === 'string'
      ? { path: config }
      : config;
  }

  /**
   * Get model commitment hash (computed from model weights)
   */
  async getCommitment(): Promise<string> {
    if (this.commitment) {
      return this.commitment;
    }

    // In production, this would be a hash of the model weights
    // For now, use path + version as a simple commitment
    const { createHash } = await import('crypto');
    const hash = createHash('sha256');
    hash.update(this.config.path);
    if (this.config.version) {
      hash.update(this.config.version);
    }
    this.commitment = '0x' + hash.digest('hex');
    return this.commitment;
  }

  /**
   * Load the ONNX model
   */
  async load(): Promise<void> {
    if (this.session) {
      return;
    }

    try {
      // Dynamic import to avoid issues if onnxruntime not installed
      const ort = await import('onnxruntime-node');
      this.session = await ort.InferenceSession.create(this.config.path);
    } catch (error) {
      // If ONNX runtime not available, use mock mode
      console.warn(
        `[JoltAtlas] ONNX runtime not available, using mock inference. ` +
        `Install onnxruntime-node for real model inference.`
      );
      this.session = 'mock';
    }
  }

  /**
   * Run inference on the policy model
   */
  async run(features: FeatureVector): Promise<PolicyModelResult> {
    await this.load();

    if (this.session === 'mock') {
      return this.mockInference(features);
    }

    try {
      const ort = await import('onnxruntime-node');
      const session = this.session as InstanceType<typeof ort.InferenceSession>;

      // Convert features to tensor
      const inputNames = session.inputNames;
      const featureArray = this.featuresToArray(features, inputNames);
      const tensor = new ort.Tensor('float32', featureArray, [1, featureArray.length]);

      // Run inference
      const feeds: Record<string, unknown> = {};
      feeds[inputNames[0]] = tensor;
      const results = await session.run(feeds);

      // Parse output
      const outputName = session.outputNames[0];
      const output = results[outputName].data as Float32Array;

      return this.parseOutput(Array.from(output));
    } catch (error) {
      console.error('[JoltAtlas] Inference error:', error);
      return this.mockInference(features);
    }
  }

  /**
   * Convert feature vector to array for model input
   */
  private featuresToArray(features: FeatureVector, inputNames: readonly string[]): Float32Array {
    const schema = this.config.inputSchema;

    if (schema) {
      // Use schema order
      const arr = schema.features.map(f => {
        const val = features[f.name];
        if (val === undefined) {
          if (f.required && f.default === undefined) {
            throw new Error(`Missing required feature: ${f.name}`);
          }
          return Number(f.default ?? 0);
        }
        return typeof val === 'boolean' ? (val ? 1 : 0) : Number(val);
      });
      return new Float32Array(arr);
    }

    // Default: use feature object keys in sorted order
    const keys = Object.keys(features).sort();
    const arr = keys.map(k => {
      const val = features[k];
      return typeof val === 'boolean' ? (val ? 1 : 0) : Number(val);
    });
    return new Float32Array(arr);
  }

  /**
   * Parse model output into decision
   */
  private parseOutput(output: number[]): PolicyModelResult {
    const threshold = this.config.threshold ?? 0.5;

    if (output.length === 1) {
      // Binary classification (sigmoid output)
      const score = output[0];
      return {
        decision: score >= threshold ? PolicyDecision.APPROVE : PolicyDecision.REJECT,
        confidence: score >= threshold ? score : 1 - score,
        rawOutput: output,
      };
    }

    if (output.length === 2) {
      // Binary classification (softmax output)
      const [rejectScore, approveScore] = output;
      const decision = approveScore > rejectScore ? PolicyDecision.APPROVE : PolicyDecision.REJECT;
      return {
        decision,
        confidence: Math.max(approveScore, rejectScore),
        rawOutput: output,
      };
    }

    if (output.length === 3) {
      // Three-class: reject, review, approve
      const [rejectScore, reviewScore, approveScore] = output;
      const maxScore = Math.max(rejectScore, reviewScore, approveScore);
      let decision: PolicyDecision;
      if (maxScore === approveScore) decision = PolicyDecision.APPROVE;
      else if (maxScore === reviewScore) decision = PolicyDecision.REVIEW;
      else decision = PolicyDecision.REJECT;

      return {
        decision,
        confidence: maxScore,
        rawOutput: output,
      };
    }

    // Fallback: treat first output as approval score
    return {
      decision: output[0] >= threshold ? PolicyDecision.APPROVE : PolicyDecision.REJECT,
      confidence: Math.abs(output[0] - 0.5) * 2,
      rawOutput: output,
    };
  }

  /**
   * Mock inference for testing without ONNX
   */
  private mockInference(features: FeatureVector): PolicyModelResult {
    // Simple heuristic for mock: check amount-like features
    const amount = features['amount'] ?? features['value'] ?? 0;
    const limit = features['limit'] ?? features['budget'] ?? 10000;
    const trustScore = features['trust_score'] ?? features['trustScore'] ?? 0.5;

    // Mock decision logic
    let approveScore = 0.5;

    // Lower score for high amounts
    if (typeof amount === 'number' && typeof limit === 'number') {
      const ratio = amount / (limit || 1);
      approveScore -= ratio * 0.3;
    }

    // Higher score for trusted recipients
    if (typeof trustScore === 'number') {
      approveScore += (trustScore - 0.5) * 0.4;
    }

    // Clamp to [0, 1]
    approveScore = Math.max(0, Math.min(1, approveScore));

    const threshold = this.config.threshold ?? 0.5;

    return {
      decision: approveScore >= threshold ? PolicyDecision.APPROVE : PolicyDecision.REJECT,
      confidence: approveScore >= threshold ? approveScore : 1 - approveScore,
      rawOutput: [approveScore],
    };
  }

  /**
   * Release resources
   */
  async dispose(): Promise<void> {
    if (this.session && this.session !== 'mock') {
      // ONNX session cleanup if needed
    }
    this.session = null;
  }
}

/**
 * Model registry for caching loaded models
 */
const modelCache = new Map<string, PolicyModel>();

/**
 * Get or create a policy model
 */
export function getPolicyModel(config: PolicyModelConfig | string): PolicyModel {
  const key = typeof config === 'string' ? config : config.path;

  let model = modelCache.get(key);
  if (!model) {
    model = new PolicyModel(config);
    modelCache.set(key, model);
  }

  return model;
}

/**
 * Clear model cache
 */
export function clearModelCache(): void {
  for (const model of modelCache.values()) {
    model.dispose();
  }
  modelCache.clear();
}
