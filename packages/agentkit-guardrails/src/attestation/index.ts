/**
 * Attestation module exports
 *
 * Use these for direct attestation operations without the full guardrail wrapper.
 */

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
} from './eip712.js';
