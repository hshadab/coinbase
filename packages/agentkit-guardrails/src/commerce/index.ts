/**
 * Commerce Module - Agent-to-Agent Payment Infrastructure
 *
 * Provides the rails for autonomous commerce between AI agents
 * with zkML-verified trust and compliance.
 *
 * Components:
 * - AgentPaymentRails: ERC-8004 identity, reputation, and validation
 * - X402Client: HTTP micropayments via x402 protocol
 * - TrustlessMarketplace: Full integration for agent commerce
 */

// ERC-8004 Payment Rails
export {
  AgentPaymentRails,
  createPaymentRails,
  type AgentIdentity,
  type AgentPayment,
  type AgentPaymentRequest,
  type TrustRequirements,
  type ZkmlTrustScore,
  type AgentReputation,
  type Escrow,
  type EscrowConfig,
  type ERC8004Config,
  PaymentStatus,
  EscrowStatus,
} from "./agent-payment-rails.js";

// x402 HTTP Micropayments
export {
  X402Client,
  createX402Client,
  create402Response,
  USDC_ADDRESSES,
  type X402ClientConfig,
  type X402PaymentRequired,
  type X402PaymentPayload,
  type X402PaymentResult,
  type PaymentScheme,
} from "./x402-client.js";

// Trustless Agent Marketplace
export {
  TrustlessMarketplace,
  createMarketplace,
  type MarketplaceConfig,
  type AgentService,
  type ServiceRequest,
  type ServiceResponse,
  type DiscoveryOptions,
  type ExecutionOptions,
} from "./trustless-marketplace.js";
