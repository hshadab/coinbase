//! Jolt Atlas Prover Implementation
//!
//! This module handles:
//! - ONNX model loading and inference
//! - ZK proof generation using Jolt Atlas
//! - Model commitment computation

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::jolt_atlas::{
    create_prover, compute_model_commitment, deserialize_proof, hash_floats,
    serialize_proof, JoltAtlasProof, ZkmlProver,
};
use crate::types::*;

/// Jolt Atlas prover wrapper
pub struct JoltAtlasProver {
    /// Registered models
    models: HashMap<String, ModelInfo>,

    /// Model storage directory
    model_dir: PathBuf,

    /// The underlying zkML prover
    zkml_prover: Arc<RwLock<Box<dyn ZkmlProver>>>,
}

impl JoltAtlasProver {
    /// Create a new prover instance
    pub fn new() -> Result<Self> {
        let model_dir = std::env::var("MODEL_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./models"));

        std::fs::create_dir_all(&model_dir)?;

        // Create the appropriate prover based on feature flags
        let zkml_prover = create_prover()?;

        tracing::info!(
            "Prover initialized: {} (model_dir: {:?})",
            zkml_prover.prover_id(),
            model_dir
        );

        Ok(Self {
            models: HashMap::new(),
            model_dir,
            zkml_prover: Arc::new(RwLock::new(zkml_prover)),
        })
    }

    /// Register an ONNX model
    pub async fn register_model(&mut self, request: &RegisterModelRequest) -> Result<ModelInfo> {
        // Decode model bytes
        let model_bytes = BASE64
            .decode(&request.model_bytes)
            .map_err(|e| anyhow!("Invalid base64: {}", e))?;

        // Compute model commitment (hash of weights)
        let commitment = compute_model_commitment(&model_bytes);

        // Generate model ID
        let model_id = uuid::Uuid::new_v4().to_string();

        // Save model to disk
        let model_path = self.model_dir.join(format!("{}.onnx", model_id));
        std::fs::write(&model_path, &model_bytes)?;

        // Verify model can be loaded
        self.verify_model_loadable(&model_path).await?;

        let model_info = ModelInfo {
            id: model_id.clone(),
            name: request.name.clone(),
            commitment,
            path: model_path,
        };

        self.models.insert(model_id, model_info.clone());

        Ok(model_info)
    }

    /// Get model commitment by ID
    pub fn get_model_commitment(&self, model_id: &str) -> Option<String> {
        self.models.get(model_id).map(|m| m.commitment.clone())
    }

    /// Generate a zkML proof
    pub async fn generate_proof(&self, request: &ProveRequest) -> Result<ProofResult> {
        // Get model info
        let model_info = self
            .models
            .get(&request.model_id)
            .ok_or_else(|| anyhow!("Model not found: {}", request.model_id))?;

        // Run ONNX inference to get outputs
        let output = self.run_inference(&model_info.path, &request.inputs).await?;

        // Generate zkML proof
        let prover = self.zkml_prover.read().await;
        let proof = prover.prove(&model_info.commitment, &request.inputs, &output)?;

        // Serialize proof
        let proof_encoded = serialize_proof(&proof)?;

        // Compute hashes for public inputs
        let input_hash = hash_floats(&request.inputs);
        let output_hash = hash_floats(&output);

        let public_inputs = PublicInputs {
            model_commitment: model_info.commitment.clone(),
            input_hash: input_hash.clone(),
            output_hash: output_hash.clone(),
            output: output.clone(),
            timestamp: proof.timestamp,
        };

        Ok(ProofResult {
            proof: proof_encoded,
            model_commitment: model_info.commitment.clone(),
            input_hash,
            output_hash,
            public_inputs,
        })
    }

    /// Verify a zkML proof
    pub async fn verify_proof(&self, request: &VerifyRequest) -> Result<bool> {
        // Deserialize the proof
        let proof = deserialize_proof(&request.proof)?;

        // Verify model commitment matches
        if proof.model_commitment != request.model_commitment {
            return Ok(false);
        }

        // Verify input/output hashes match
        if proof.input_hash != request.input_hash {
            return Ok(false);
        }

        if proof.output_hash != request.output_hash {
            return Ok(false);
        }

        // Verify the actual zkML proof
        let prover = self.zkml_prover.read().await;
        let result = prover.verify(&proof)?;

        if !result.valid {
            tracing::warn!("Proof verification failed: {:?}", result.error);
        }

        Ok(result.valid)
    }

    /// Run ONNX model inference
    async fn run_inference(&self, model_path: &PathBuf, inputs: &[f32]) -> Result<Vec<f32>> {
        // Try to use ONNX runtime if available
        #[cfg(feature = "ort")]
        {
            return self.run_onnx_inference(model_path, inputs).await;
        }

        // Fallback: mock inference based on input features
        #[allow(unreachable_code)]
        {
            tracing::warn!("ONNX runtime not available, using mock inference");
            Ok(self.mock_inference(inputs))
        }
    }

    /// Run inference using ONNX runtime
    #[cfg(feature = "ort")]
    async fn run_onnx_inference(&self, model_path: &PathBuf, inputs: &[f32]) -> Result<Vec<f32>> {
        use ort::{Session, Value};
        use ndarray::Array2;

        let session = Session::builder()?.with_model_from_file(model_path)?;

        // Get input shape from model
        let input_info = &session.inputs[0];
        let input_dims = input_info.input_type.tensor_dimensions()
            .ok_or_else(|| anyhow!("Cannot get input dimensions"))?;

        let batch_size = input_dims.get(0).and_then(|d| *d).unwrap_or(1) as usize;
        let features = input_dims.get(1).and_then(|d| *d).unwrap_or(inputs.len() as i64) as usize;

        // Reshape inputs
        let input_array = Array2::from_shape_vec((batch_size, features), inputs.to_vec())?;
        let input_value = Value::from_array(input_array)?;

        // Run inference
        let outputs = session.run(vec![input_value])?;
        let output_tensor = outputs[0].extract_tensor::<f32>()?;

        Ok(output_tensor.view().iter().copied().collect())
    }

    /// Mock inference for testing
    fn mock_inference(&self, inputs: &[f32]) -> Vec<f32> {
        // Simple mock: sigmoid-like output based on input sum
        let sum: f32 = inputs.iter().sum();
        let normalized = 1.0 / (1.0 + (-sum / inputs.len() as f32).exp());

        // Return binary classification output
        vec![1.0 - normalized, normalized]
    }

    /// Verify model can be loaded
    async fn verify_model_loadable(&self, model_path: &PathBuf) -> Result<()> {
        // Check file exists and is readable
        if !model_path.exists() {
            return Err(anyhow!("Model file does not exist: {:?}", model_path));
        }

        let metadata = std::fs::metadata(model_path)?;
        if metadata.len() == 0 {
            return Err(anyhow!("Model file is empty"));
        }

        // TODO: Additional validation (ONNX structure, supported operators, etc.)

        Ok(())
    }

    /// Get prover information
    pub async fn get_prover_info(&self) -> String {
        let prover = self.zkml_prover.read().await;
        prover.prover_id().to_string()
    }
}
