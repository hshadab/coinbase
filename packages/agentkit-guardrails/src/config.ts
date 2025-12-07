/**
 * SDK Configuration
 *
 * Centralized configuration management for the Trustless AgentKit SDK.
 * All configurable values can be set via environment variables.
 */

/**
 * Default timeout for service requests in milliseconds
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Health check timeout in milliseconds
 */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Zero address constant
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * Default prover service URL
 */
export const DEFAULT_PROVER_URL = 'http://localhost:3001';

/**
 * Default Kinic memory service URL
 */
export const DEFAULT_KINIC_URL = 'http://localhost:3002';

/**
 * Get the prover service URL from environment or default
 */
export function getProverServiceUrl(): string {
  return process.env.TRUSTLESS_PROVER_URL ?? DEFAULT_PROVER_URL;
}

/**
 * Get the Kinic service URL from environment or default
 */
export function getKinicServiceUrl(): string {
  return process.env.TRUSTLESS_KINIC_URL ?? DEFAULT_KINIC_URL;
}

/**
 * Check if running in mock mode (development)
 *
 * Mock mode is enabled when:
 * - TRUSTLESS_MOCK_MODE=true environment variable is set
 * - Or when services are unavailable and auto-fallback is enabled
 */
export function isMockMode(): boolean {
  return process.env.TRUSTLESS_MOCK_MODE === 'true';
}

/**
 * Runtime mode for SDK components
 */
export type RuntimeMode = 'auto' | 'service' | 'mock';

/**
 * Get the runtime mode from environment or default
 */
export function getRuntimeMode(): RuntimeMode {
  const mode = process.env.TRUSTLESS_RUNTIME_MODE;
  if (mode === 'service' || mode === 'mock') {
    return mode;
  }
  return 'auto';
}

/**
 * SDK configuration interface
 */
export interface SDKConfig {
  /** Prover service URL */
  proverUrl: string;
  /** Kinic memory service URL */
  kinicUrl: string;
  /** Default request timeout in ms */
  timeoutMs: number;
  /** Whether to run in mock mode */
  mockMode: boolean;
}

/**
 * Get the full SDK configuration from environment
 */
export function getSDKConfig(): SDKConfig {
  return {
    proverUrl: getProverServiceUrl(),
    kinicUrl: getKinicServiceUrl(),
    timeoutMs: parseInt(process.env.TRUSTLESS_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10),
    mockMode: isMockMode(),
  };
}
