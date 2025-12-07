/**
 * EIP-712 Attestation Signing
 *
 * Creates typed, signable attestations for guardrail decisions.
 * These attestations can be verified offchain or posted onchain as commitments.
 */

import { createHash, randomBytes } from 'crypto';
import type {
  AttestationData,
  SignedAttestation,
  AttestationSigner,
  EIP712Domain,
  PolicyDecision,
} from '../core/types.js';
import { ZERO_ADDRESS } from '../config.js';

/**
 * EIP-712 domain for Jolt Atlas attestations
 *
 * Note: verifyingContract should be overridden with the actual registry
 * address when one is deployed. Use the attestation config to provide it.
 */
export const ATTESTATION_DOMAIN: EIP712Domain = {
  name: 'JoltAtlasGuardrail',
  version: '1',
  chainId: 8453, // Base mainnet, can be overridden
  verifyingContract: ZERO_ADDRESS,
};

/**
 * EIP-712 types for attestation
 */
export const ATTESTATION_TYPES: Record<string, { name: string; type: string }[]> = {
  GuardrailAttestation: [
    { name: 'modelCommitment', type: 'bytes32' },
    { name: 'inputHash', type: 'bytes32' },
    { name: 'outputHash', type: 'bytes32' },
    { name: 'decision', type: 'string' },
    { name: 'confidence', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * Create attestation data from guardrail result
 */
export function createAttestationData(
  modelCommitment: string,
  inputHash: string,
  decision: PolicyDecision,
  confidence: number,
  timestamp?: number
): AttestationData {
  const outputHash = hashDecision(decision, confidence);
  const nonce = '0x' + randomBytes(32).toString('hex');

  return {
    modelCommitment: normalizeBytes32(modelCommitment),
    inputHash: normalizeBytes32(inputHash),
    outputHash: normalizeBytes32(outputHash),
    decision,
    confidence,
    timestamp: timestamp ?? Date.now(),
    nonce,
  };
}

/**
 * Hash a decision for attestation
 */
function hashDecision(decision: PolicyDecision, confidence: number): string {
  const hash = createHash('sha256');
  hash.update(decision);
  hash.update(':');
  hash.update(Math.round(confidence * 1e6).toString());
  return '0x' + hash.digest('hex');
}

/**
 * Normalize a hex string to bytes32 format
 */
function normalizeBytes32(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = clean.padStart(64, '0').slice(0, 64);
  return '0x' + padded;
}

/**
 * Compute attestation hash (for onchain posting)
 */
export function computeAttestationHash(data: AttestationData): string {
  const hash = createHash('sha256');
  hash.update(data.modelCommitment);
  hash.update(data.inputHash);
  hash.update(data.outputHash);
  hash.update(data.decision);
  hash.update(data.confidence.toString());
  hash.update(data.timestamp.toString());
  hash.update(data.nonce);
  return '0x' + hash.digest('hex');
}

/**
 * Sign attestation data using EIP-712
 */
export async function signAttestation(
  data: AttestationData,
  signer: AttestationSigner,
  domain?: Partial<EIP712Domain>
): Promise<SignedAttestation> {
  const fullDomain: EIP712Domain = {
    ...ATTESTATION_DOMAIN,
    ...domain,
  };

  // Convert to EIP-712 compatible format
  const typedValue = {
    modelCommitment: data.modelCommitment,
    inputHash: data.inputHash,
    outputHash: data.outputHash,
    decision: data.decision,
    confidence: BigInt(Math.round(data.confidence * 1e18)), // 18 decimals
    timestamp: BigInt(data.timestamp),
    nonce: data.nonce,
  };

  const signature = await signer.signTypedData(
    fullDomain,
    ATTESTATION_TYPES,
    typedValue
  );

  const hash = computeAttestationHash(data);

  return {
    data,
    signature,
    signer: signer.address,
    hash,
  };
}

/**
 * Create an unsigned attestation (for offchain use without signing)
 */
export function createUnsignedAttestation(
  modelCommitment: string,
  inputHash: string,
  decision: PolicyDecision,
  confidence: number
): Omit<SignedAttestation, 'signature' | 'signer'> {
  const data = createAttestationData(
    modelCommitment,
    inputHash,
    decision,
    confidence
  );

  return {
    data,
    hash: computeAttestationHash(data),
  };
}

/**
 * Verify attestation signature (offchain)
 *
 * Uses viem for signature recovery
 */
export async function verifyAttestationSignature(
  attestation: SignedAttestation,
  domain?: Partial<EIP712Domain>
): Promise<{ valid: boolean; recoveredAddress?: string; error?: string }> {
  try {
    const { verifyTypedData } = await import('viem');

    const fullDomain: EIP712Domain = {
      ...ATTESTATION_DOMAIN,
      ...domain,
    };

    const typedValue = {
      modelCommitment: attestation.data.modelCommitment,
      inputHash: attestation.data.inputHash,
      outputHash: attestation.data.outputHash,
      decision: attestation.data.decision,
      confidence: BigInt(Math.round(attestation.data.confidence * 1e18)),
      timestamp: BigInt(attestation.data.timestamp),
      nonce: attestation.data.nonce,
    };

    const valid = await verifyTypedData({
      address: attestation.signer as `0x${string}`,
      domain: {
        name: fullDomain.name,
        version: fullDomain.version,
        chainId: fullDomain.chainId,
        verifyingContract: fullDomain.verifyingContract as `0x${string}`,
      },
      types: ATTESTATION_TYPES,
      primaryType: 'GuardrailAttestation',
      message: {
        modelCommitment: typedValue.modelCommitment as `0x${string}`,
        inputHash: typedValue.inputHash as `0x${string}`,
        outputHash: typedValue.outputHash as `0x${string}`,
        decision: typedValue.decision,
        confidence: typedValue.confidence,
        timestamp: typedValue.timestamp,
        nonce: typedValue.nonce as `0x${string}`,
      },
      signature: attestation.signature as `0x${string}`,
    });

    return { valid, recoveredAddress: valid ? attestation.signer : undefined };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Encode attestation for onchain posting
 *
 * Returns minimal calldata for posting attestation hash + signature
 */
export function encodeAttestationForOnchain(attestation: SignedAttestation): string {
  // Simple encoding: hash (32 bytes) + signature (65 bytes)
  const hashHex = attestation.hash.startsWith('0x')
    ? attestation.hash.slice(2)
    : attestation.hash;
  const sigHex = attestation.signature.startsWith('0x')
    ? attestation.signature.slice(2)
    : attestation.signature;

  return '0x' + hashHex + sigHex;
}

/**
 * Decode attestation from onchain data
 */
export function decodeAttestationFromOnchain(data: string): {
  hash: string;
  signature: string;
} {
  const hex = data.startsWith('0x') ? data.slice(2) : data;

  return {
    hash: '0x' + hex.slice(0, 64),
    signature: '0x' + hex.slice(64),
  };
}
