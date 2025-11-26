//! Type definitions for the prover service API

use serde::{Deserialize, Serialize};

/// Health check response
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub prover: String,
}

/// Error response
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

/// Request to generate a proof
#[derive(Deserialize)]
pub struct ProveRequest {
    /// Model identifier (registered model ID or path)
    pub model_id: String,

    /// Input features as a flat vector of f32 values
    pub inputs: Vec<f32>,

    /// Expected output (for commitment)
    pub expected_output: Option<Vec<f32>>,

    /// Optional: Input names for structured inputs
    pub input_names: Option<Vec<String>>,
}

/// Response from proof generation
#[derive(Serialize)]
pub struct ProveResponse {
    pub success: bool,

    /// The ZK proof (base64 encoded)
    pub proof: String,

    /// Commitment to the model weights
    pub model_commitment: String,

    /// Hash of the inputs
    pub input_hash: String,

    /// Hash of the outputs
    pub output_hash: String,

    /// Public inputs for verification
    pub public_inputs: PublicInputs,

    /// Time taken to generate proof in milliseconds
    pub proving_time_ms: u64,

    /// Error message if failed
    pub error: Option<String>,
}

/// Public inputs embedded in the proof
#[derive(Serialize, Deserialize, Clone)]
pub struct PublicInputs {
    /// Model commitment
    pub model_commitment: String,

    /// Input hash
    pub input_hash: String,

    /// Output hash
    pub output_hash: String,

    /// The actual inference output
    pub output: Vec<f32>,

    /// Timestamp
    pub timestamp: u64,
}

/// Request to verify a proof
#[derive(Deserialize)]
pub struct VerifyRequest {
    /// The proof to verify (base64 encoded)
    pub proof: String,

    /// Model commitment to verify against
    pub model_commitment: String,

    /// Input hash to verify against
    pub input_hash: String,

    /// Output hash to verify against
    pub output_hash: String,

    /// Public inputs
    pub public_inputs: Option<PublicInputs>,
}

/// Response from proof verification
#[derive(Serialize)]
pub struct VerifyResponse {
    pub valid: bool,
    pub verification_time_ms: u64,
    pub error: Option<String>,
}

/// Request to register a model
#[derive(Deserialize)]
pub struct RegisterModelRequest {
    /// Human-readable name
    pub name: String,

    /// ONNX model bytes (base64 encoded)
    pub model_bytes: String,

    /// Optional description
    pub description: Option<String>,
}

/// Response from model registration
#[derive(Serialize)]
pub struct RegisterModelResponse {
    pub success: bool,
    pub model_id: String,
    pub commitment: String,
    pub error: Option<String>,
}

/// Model commitment response
#[derive(Serialize)]
pub struct ModelCommitmentResponse {
    pub model_id: String,
    pub commitment: String,
}

/// Internal model info
#[derive(Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub commitment: String,
    pub path: std::path::PathBuf,
}

/// Internal proof result
pub struct ProofResult {
    pub proof: String,
    pub model_commitment: String,
    pub input_hash: String,
    pub output_hash: String,
    pub public_inputs: PublicInputs,
}
