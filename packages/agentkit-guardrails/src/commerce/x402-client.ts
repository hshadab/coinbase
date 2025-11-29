/**
 * x402 Protocol Client
 *
 * HTTP-native micropayment client implementing the x402 protocol.
 * Uses HTTP 402 Payment Required status for agent-to-agent payments.
 *
 * @see https://github.com/coinbase/x402
 *
 * @module commerce/x402-client
 */

import { ethers, Signer } from 'ethers';

// ============================================================================
// Types
// ============================================================================

/**
 * x402 payment scheme
 */
export type PaymentScheme = 'exact' | 'upto';

/**
 * x402 payment requirement from 402 response
 */
export interface X402PaymentRequired {
  /** Accepts header value */
  accepts: string;
  /** Payment scheme */
  scheme: PaymentScheme;
  /** Network (e.g., 'base-sepolia', 'base') */
  network: string;
  /** Maximum amount in wei/base units */
  maxAmountRequired: string;
  /** Asset address (0x0 for native) */
  asset: string;
  /** Resource being paid for */
  resource: string;
  /** Description of the resource */
  description?: string;
  /** Payment receiver address */
  payTo: string;
  /** Extra data from server */
  extra?: Record<string, unknown>;
}

/**
 * x402 payment payload sent in X-PAYMENT header
 */
export interface X402PaymentPayload {
  /** The x402 version */
  x402Version: number;
  /** Payment scheme */
  scheme: PaymentScheme;
  /** Network identifier */
  network: string;
  /** Payload containing payment details */
  payload: {
    /** Payment signature */
    signature: string;
    /** Authorization details (EIP-3009) */
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

/**
 * x402 client configuration
 */
export interface X402ClientConfig {
  /** Signer for payment signatures */
  signer: Signer;
  /** Network identifier */
  network: string;
  /** Default asset for payments (USDC address or native) */
  defaultAsset?: string;
  /** Facilitator URL for payment settlement */
  facilitatorUrl?: string;
}

/**
 * x402 payment result
 */
export interface X402PaymentResult {
  /** Whether payment was successful */
  success: boolean;
  /** Transaction hash if settled on-chain */
  txHash?: string;
  /** Error message if failed */
  error?: string;
  /** The response from the resource after payment */
  response?: Response;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * USDC addresses on various networks
 */
export const USDC_ADDRESSES: Record<string, string> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};

/**
 * Chain IDs by network name
 */
const CHAIN_IDS: Record<string, number> = {
  'base': 8453,
  'base-sepolia': 84532,
  'ethereum': 1,
  'sepolia': 11155111,
};

/**
 * EIP-3009 domain type for signing
 */
const EIP3009_DOMAIN = {
  name: 'USD Coin',
  version: '2',
};

/**
 * EIP-3009 types for transferWithAuthorization
 */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

// ============================================================================
// x402 Client Class
// ============================================================================

/**
 * X402Client - HTTP micropayment client for agent-to-agent commerce
 *
 * @example
 * ```typescript
 * const client = new X402Client({
 *   signer: wallet,
 *   network: 'base-sepolia',
 * });
 *
 * // Make a paid request
 * const response = await client.paidFetch('https://agent.example/api/analyze', {
 *   method: 'POST',
 *   body: JSON.stringify({ data: 'analyze this' }),
 * });
 * ```
 */
export class X402Client {
  private signer: Signer;
  private network: string;
  private defaultAsset: string;
  private facilitatorUrl: string;
  private signerAddress: string | null = null;

  constructor(config: X402ClientConfig) {
    this.signer = config.signer;
    this.network = config.network;
    this.defaultAsset = config.defaultAsset || USDC_ADDRESSES[config.network] || ethers.ZeroAddress;
    this.facilitatorUrl = config.facilitatorUrl || 'https://x402.org/facilitator';
  }

  /**
   * Get the signer's address (cached)
   */
  private async getSignerAddress(): Promise<string> {
    if (!this.signerAddress) {
      this.signerAddress = await this.signer.getAddress();
    }
    return this.signerAddress;
  }

  /**
   * Get the chain ID for the current network
   */
  private getChainId(): number {
    return CHAIN_IDS[this.network] || 84532; // Default to Base Sepolia
  }

  /**
   * Parse 402 Payment Required response
   */
  parsePaymentRequired(response: Response): X402PaymentRequired | null {
    const accepts = response.headers.get('X-Payment-Required');
    if (!accepts) return null;

    try {
      // Parse the JSON from the header
      const data = JSON.parse(accepts);
      return {
        accepts: response.headers.get('Accepts') || 'application/json',
        scheme: data.scheme || 'exact',
        network: data.network || this.network,
        maxAmountRequired: data.maxAmountRequired || '0',
        asset: data.asset || this.defaultAsset,
        resource: data.resource || response.url,
        description: data.description,
        payTo: data.payTo,
        extra: data.extra,
      };
    } catch {
      // Try legacy format: "x402;scheme=exact;network=base-sepolia;amount=1000000;asset=0x...;payTo=0x..."
      const parts = accepts.split(';');
      if (parts[0] !== 'x402') return null;

      const params: Record<string, string> = {};
      for (const part of parts.slice(1)) {
        const [key, value] = part.split('=');
        if (key && value) params[key.trim()] = value.trim();
      }

      return {
        accepts: 'application/json',
        scheme: (params.scheme as PaymentScheme) || 'exact',
        network: params.network || this.network,
        maxAmountRequired: params.amount || params.maxAmountRequired || '0',
        asset: params.asset || this.defaultAsset,
        resource: response.url,
        payTo: params.payTo || '',
      };
    }
  }

  /**
   * Create EIP-3009 authorization signature for USDC transfer
   */
  async createPaymentAuthorization(
    to: string,
    amount: string,
    validForSeconds: number = 3600
  ): Promise<X402PaymentPayload['payload']> {
    const from = await this.getSignerAddress();
    const validAfter = '0';
    const validBefore = String(Math.floor(Date.now() / 1000) + validForSeconds);
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    // Get chain ID for domain
    const network = await this.signer.provider?.getNetwork();
    const chainId = network?.chainId || 84532; // Default to Base Sepolia

    const domain = {
      ...EIP3009_DOMAIN,
      chainId: Number(chainId),
      verifyingContract: this.defaultAsset,
    };

    const message = {
      from,
      to,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    };

    // Sign the authorization using ethers signTypedData
    const signature = await (this.signer as ethers.Signer & {
      signTypedData: (
        domain: Record<string, unknown>,
        types: Record<string, Array<{ name: string; type: string }>>,
        message: Record<string, unknown>
      ) => Promise<string>;
    }).signTypedData(domain, TRANSFER_WITH_AUTHORIZATION_TYPES, message);

    return {
      signature,
      authorization: {
        from,
        to,
        value: amount,
        validAfter,
        validBefore,
        nonce,
      },
    };
  }

  /**
   * Create x402 payment header value
   */
  async createPaymentHeader(
    paymentRequired: X402PaymentRequired
  ): Promise<string> {
    const payload = await this.createPaymentAuthorization(
      paymentRequired.payTo,
      paymentRequired.maxAmountRequired
    );

    const x402Payload: X402PaymentPayload = {
      x402Version: 1,
      scheme: paymentRequired.scheme,
      network: paymentRequired.network,
      payload,
    };

    return btoa(JSON.stringify(x402Payload));
  }

  /**
   * Make a paid HTTP request
   *
   * Automatically handles 402 Payment Required responses by:
   * 1. Parsing the payment requirement
   * 2. Creating and signing the payment authorization
   * 3. Retrying the request with the X-PAYMENT header
   */
  async paidFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<X402PaymentResult> {
    // First request - may return 402
    const initialResponse = await fetch(url, options);

    // If not 402, return success
    if (initialResponse.status !== 402) {
      return {
        success: initialResponse.ok,
        response: initialResponse,
      };
    }

    // Parse payment requirement
    const paymentRequired = this.parsePaymentRequired(initialResponse);
    if (!paymentRequired) {
      return {
        success: false,
        error: 'Invalid 402 response: missing payment details',
      };
    }

    // Create payment header
    const paymentHeader = await this.createPaymentHeader(paymentRequired);

    // Retry with payment
    const paidResponse = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-PAYMENT': paymentHeader,
      },
    });

    return {
      success: paidResponse.ok,
      response: paidResponse,
    };
  }

  /**
   * Request payment from another agent
   *
   * Creates a payment request that the other agent can fulfill via x402
   */
  async createPaymentRequest(params: {
    amount: string;
    description?: string;
    resource?: string;
    expiresInSeconds?: number;
  }): Promise<X402PaymentRequired> {
    const payTo = await this.getSignerAddress();

    return {
      accepts: 'application/json',
      scheme: 'exact',
      network: this.network,
      maxAmountRequired: params.amount,
      asset: this.defaultAsset,
      resource: params.resource || '',
      description: params.description,
      payTo,
    };
  }

  /**
   * Verify an incoming x402 payment header
   */
  async verifyPayment(
    paymentHeader: string,
    expectedPayTo: string,
    expectedMinAmount: string
  ): Promise<{ valid: boolean; from?: string; amount?: string; error?: string }> {
    try {
      const decoded = JSON.parse(atob(paymentHeader)) as X402PaymentPayload;

      // Verify version
      if (decoded.x402Version !== 1) {
        return { valid: false, error: 'Unsupported x402 version' };
      }

      // Verify recipient
      if (decoded.payload.authorization.to.toLowerCase() !== expectedPayTo.toLowerCase()) {
        return { valid: false, error: 'Payment recipient mismatch' };
      }

      // Verify amount
      const paymentAmount = BigInt(decoded.payload.authorization.value);
      const minAmount = BigInt(expectedMinAmount);
      if (paymentAmount < minAmount) {
        return { valid: false, error: 'Insufficient payment amount' };
      }

      // Verify not expired
      const validBefore = Number(decoded.payload.authorization.validBefore);
      if (validBefore < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Payment authorization expired' };
      }

      // Verify signature by recovering signer address
      const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: this.getChainId(),
        verifyingContract: this.defaultAsset,
      };

      const message = {
        from: decoded.payload.authorization.from,
        to: decoded.payload.authorization.to,
        value: decoded.payload.authorization.value,
        validAfter: decoded.payload.authorization.validAfter,
        validBefore: decoded.payload.authorization.validBefore,
        nonce: decoded.payload.authorization.nonce,
      };

      const recoveredAddress = ethers.verifyTypedData(
        domain,
        TRANSFER_WITH_AUTHORIZATION_TYPES,
        message,
        decoded.payload.signature
      );

      if (recoveredAddress.toLowerCase() !== decoded.payload.authorization.from.toLowerCase()) {
        return { valid: false, error: 'Invalid payment signature' };
      }

      return {
        valid: true,
        from: decoded.payload.authorization.from,
        amount: decoded.payload.authorization.value,
      };
    } catch (error) {
      return { valid: false, error: 'Invalid payment header format' };
    }
  }

  /**
   * Get the current balance of the default asset
   */
  async getBalance(): Promise<bigint> {
    const address = await this.getSignerAddress();

    if (this.defaultAsset === ethers.ZeroAddress) {
      // Native balance
      const balance = await this.signer.provider?.getBalance(address);
      return balance || 0n;
    }

    // ERC20 balance
    const erc20 = new ethers.Contract(
      this.defaultAsset,
      ['function balanceOf(address) view returns (uint256)'],
      this.signer
    );

    return erc20.balanceOf(address);
  }
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Create an x402 client
 */
export function createX402Client(config: X402ClientConfig): X402Client {
  return new X402Client(config);
}

/**
 * Create a 402 Payment Required response
 */
export function create402Response(
  paymentRequired: X402PaymentRequired,
  body?: string
): Response {
  return new Response(body || JSON.stringify({ error: 'Payment Required' }), {
    status: 402,
    statusText: 'Payment Required',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Required': JSON.stringify({
        scheme: paymentRequired.scheme,
        network: paymentRequired.network,
        maxAmountRequired: paymentRequired.maxAmountRequired,
        asset: paymentRequired.asset,
        payTo: paymentRequired.payTo,
        resource: paymentRequired.resource,
        description: paymentRequired.description,
      }),
    },
  });
}

export default X402Client;
