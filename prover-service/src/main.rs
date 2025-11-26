//! Jolt Atlas Prover Service
//!
//! HTTP API for generating zkML proofs using Jolt Atlas.
//! This service wraps the Jolt Atlas proving system and exposes
//! a simple REST API for proof generation and verification.

mod prover;
mod types;
mod verification;

use axum::{
    extract::{Json, State},
    http::StatusCode,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::prover::JoltAtlasProver;
use crate::types::*;

/// Application state shared across handlers
struct AppState {
    prover: RwLock<JoltAtlasProver>,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "jolt_atlas_prover_service=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Initialize prover
    let prover = JoltAtlasProver::new().expect("Failed to initialize prover");
    let state = Arc::new(AppState {
        prover: RwLock::new(prover),
    });

    // Build router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/prove", post(generate_proof))
        .route("/verify", post(verify_proof))
        .route("/models", post(register_model))
        .route("/models/:id/commitment", get(get_model_commitment))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = std::env::var("PROVER_ADDR").unwrap_or_else(|_| "0.0.0.0:3001".to_string());
    tracing::info!("Starting Jolt Atlas Prover Service on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Health check endpoint
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        prover: "jolt-atlas".to_string(),
    })
}

/// Generate a zkML proof for model inference
async fn generate_proof(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProveRequest>,
) -> Result<Json<ProveResponse>, (StatusCode, Json<ErrorResponse>)> {
    tracing::info!(
        "Generating proof for model: {}, inputs: {} features",
        request.model_id,
        request.inputs.len()
    );

    let start = std::time::Instant::now();

    let prover = state.prover.read().await;

    match prover.generate_proof(&request).await {
        Ok(proof_result) => {
            let elapsed = start.elapsed();
            tracing::info!(
                "Proof generated in {:?}, size: {} bytes",
                elapsed,
                proof_result.proof.len()
            );

            Ok(Json(ProveResponse {
                success: true,
                proof: proof_result.proof,
                model_commitment: proof_result.model_commitment,
                input_hash: proof_result.input_hash,
                output_hash: proof_result.output_hash,
                public_inputs: proof_result.public_inputs,
                proving_time_ms: elapsed.as_millis() as u64,
                error: None,
            }))
        }
        Err(e) => {
            tracing::error!("Proof generation failed: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: "PROOF_GENERATION_FAILED".to_string(),
                }),
            ))
        }
    }
}

/// Verify a zkML proof
async fn verify_proof(
    State(state): State<Arc<AppState>>,
    Json(request): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, (StatusCode, Json<ErrorResponse>)> {
    tracing::info!("Verifying proof for model: {}", request.model_commitment);

    let start = std::time::Instant::now();
    let prover = state.prover.read().await;

    match prover.verify_proof(&request).await {
        Ok(valid) => {
            let elapsed = start.elapsed();
            tracing::info!("Proof verification: {}, took {:?}", valid, elapsed);

            Ok(Json(VerifyResponse {
                valid,
                verification_time_ms: elapsed.as_millis() as u64,
                error: None,
            }))
        }
        Err(e) => {
            tracing::error!("Proof verification failed: {}", e);
            Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: "VERIFICATION_FAILED".to_string(),
                }),
            ))
        }
    }
}

/// Register an ONNX model for proving
async fn register_model(
    State(state): State<Arc<AppState>>,
    Json(request): Json<RegisterModelRequest>,
) -> Result<Json<RegisterModelResponse>, (StatusCode, Json<ErrorResponse>)> {
    tracing::info!("Registering model: {}", request.name);

    let mut prover = state.prover.write().await;

    match prover.register_model(&request).await {
        Ok(model_info) => {
            tracing::info!(
                "Model registered: {} with commitment {}",
                model_info.id,
                model_info.commitment
            );

            Ok(Json(RegisterModelResponse {
                success: true,
                model_id: model_info.id,
                commitment: model_info.commitment,
                error: None,
            }))
        }
        Err(e) => {
            tracing::error!("Model registration failed: {}", e);
            Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: "MODEL_REGISTRATION_FAILED".to_string(),
                }),
            ))
        }
    }
}

/// Get model commitment by ID
async fn get_model_commitment(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(model_id): axum::extract::Path<String>,
) -> Result<Json<ModelCommitmentResponse>, (StatusCode, Json<ErrorResponse>)> {
    let prover = state.prover.read().await;

    match prover.get_model_commitment(&model_id) {
        Some(commitment) => Ok(Json(ModelCommitmentResponse {
            model_id,
            commitment,
        })),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Model not found".to_string(),
                code: "MODEL_NOT_FOUND".to_string(),
            }),
        )),
    }
}
