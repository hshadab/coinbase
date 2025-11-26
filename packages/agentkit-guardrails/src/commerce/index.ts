/**
 * Commerce Module - Agent-to-Agent Payment Infrastructure
 *
 * Provides the rails for autonomous commerce between AI agents
 * with zkML-verified trust and compliance.
 */

export {
  AgentPaymentRails,
  createPaymentRails,
  type AgentIdentity,
  type AgentPayment,
  type AgentPaymentRequest,
  type TrustRequirements,
  type Escrow,
  type EscrowConfig,
  AgentStatus,
  PaymentStatus,
  EscrowStatus,
} from "./agent-payment-rails";
