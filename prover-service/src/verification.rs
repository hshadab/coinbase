//! Verification utilities
//!
//! This module provides utilities for proof verification that can be
//! used both in the service and compiled to WASM for client-side verification.

use sha2::{Digest, Sha256};

/// Verify proof commitments without full proof verification
///
/// This is a lightweight check that verifies:
/// - Input hash matches
/// - Output hash matches
/// - Model commitment matches
///
/// For full ZK verification, use the prover service's /verify endpoint
pub fn verify_commitments(
    model_commitment: &str,
    input_hash: &str,
    output_hash: &str,
    expected_model_commitment: &str,
    expected_input_hash: &str,
    expected_output_hash: &str,
) -> bool {
    model_commitment == expected_model_commitment
        && input_hash == expected_input_hash
        && output_hash == expected_output_hash
}

/// Compute input hash from feature vector
pub fn compute_input_hash(inputs: &[f32]) -> String {
    let mut hasher = Sha256::new();
    for input in inputs {
        hasher.update(input.to_le_bytes());
    }
    format!("0x{}", hex::encode(hasher.finalize()))
}

/// Compute output hash from inference result
pub fn compute_output_hash(outputs: &[f32]) -> String {
    let mut hasher = Sha256::new();
    for output in outputs {
        hasher.update(output.to_le_bytes());
    }
    format!("0x{}", hex::encode(hasher.finalize()))
}

/// Verify that a proof contains valid structure (without cryptographic verification)
pub fn verify_proof_structure(proof_bytes: &[u8]) -> Result<ProofMetadata, String> {
    #[derive(serde::Deserialize)]
    struct MockProof {
        version: u8,
        prover: String,
        model_commitment: String,
        input_hash: String,
        output_hash: String,
        outputs: Vec<f32>,
        timestamp: u64,
    }

    let proof: MockProof =
        serde_json::from_slice(proof_bytes).map_err(|e| format!("Invalid proof format: {}", e))?;

    Ok(ProofMetadata {
        version: proof.version,
        prover: proof.prover,
        model_commitment: proof.model_commitment,
        input_hash: proof.input_hash,
        output_hash: proof.output_hash,
        outputs: proof.outputs,
        timestamp: proof.timestamp,
    })
}

/// Metadata extracted from a proof
#[derive(Debug, Clone)]
pub struct ProofMetadata {
    pub version: u8,
    pub prover: String,
    pub model_commitment: String,
    pub input_hash: String,
    pub output_hash: String,
    pub outputs: Vec<f32>,
    pub timestamp: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_input_hash_deterministic() {
        let inputs = vec![1.0, 2.0, 3.0];
        let hash1 = compute_input_hash(&inputs);
        let hash2 = compute_input_hash(&inputs);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_different_inputs_different_hash() {
        let inputs1 = vec![1.0, 2.0, 3.0];
        let inputs2 = vec![1.0, 2.0, 4.0];
        let hash1 = compute_input_hash(&inputs1);
        let hash2 = compute_input_hash(&inputs2);
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_verify_commitments() {
        assert!(verify_commitments(
            "0xabc",
            "0x123",
            "0x456",
            "0xabc",
            "0x123",
            "0x456"
        ));

        assert!(!verify_commitments(
            "0xabc",
            "0x123",
            "0x456",
            "0xdef",
            "0x123",
            "0x456"
        ));
    }
}
