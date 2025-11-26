/**
 * Feature Extractors for Common AgentKit Actions
 *
 * These functions extract relevant features from AgentKit action contexts
 * for policy model evaluation.
 */

import type {
  ActionContext,
  WalletContext,
  FeatureVector,
  FeatureExtractor,
} from '../core/types.js';

/**
 * Default feature extractor that handles common action types
 */
export const defaultFeatureExtractor: FeatureExtractor = async (
  action: ActionContext,
  wallet?: WalletContext
): Promise<FeatureVector> => {
  const features: FeatureVector = {
    // Timestamp features
    timestamp: action.timestamp,
    hour_of_day: new Date(action.timestamp).getUTCHours(),
    day_of_week: new Date(action.timestamp).getUTCDay(),

    // Action type one-hot (simplified)
    is_transfer: action.actionType === 'transfer' ? 1 : 0,
    is_swap: action.actionType === 'swap' ? 1 : 0,
    is_deploy: action.actionType === 'deploy' ? 1 : 0,
    is_contract_call: action.actionType === 'contract_call' ? 1 : 0,
  };

  // Extract based on action type
  switch (action.actionType) {
    case 'transfer':
      Object.assign(features, extractTransferFeatures(action));
      break;
    case 'swap':
      Object.assign(features, extractSwapFeatures(action));
      break;
    case 'deploy':
      Object.assign(features, extractDeployFeatures(action));
      break;
    default:
      Object.assign(features, extractGenericFeatures(action));
  }

  // Add wallet context features if available
  if (wallet) {
    Object.assign(features, extractWalletFeatures(wallet));
  }

  // Add history features if available
  if (action.history && action.history.length > 0) {
    Object.assign(features, extractHistoryFeatures(action.history));
  }

  return features;
};

/**
 * Extract features for transfer actions
 */
function extractTransferFeatures(action: ActionContext): FeatureVector {
  const params = action.params as {
    to?: string;
    amount?: string | number | bigint;
    asset?: string;
  };

  return {
    // Amount (normalized to number)
    amount: normalizeAmount(params.amount),

    // Recipient features
    recipient_is_contract: 0, // Would need onchain lookup
    recipient_is_known: 0, // Would check against allowlist

    // Asset features
    is_native_token: !params.asset || params.asset === 'ETH',
    is_stablecoin: isStablecoin(params.asset),
  };
}

/**
 * Extract features for swap actions
 */
function extractSwapFeatures(action: ActionContext): FeatureVector {
  const params = action.params as {
    fromToken?: string;
    toToken?: string;
    amount?: string | number | bigint;
    slippage?: number;
  };

  return {
    amount: normalizeAmount(params.amount),
    slippage: params.slippage ?? 0.5,
    from_is_stablecoin: isStablecoin(params.fromToken),
    to_is_stablecoin: isStablecoin(params.toToken),
  };
}

/**
 * Extract features for deploy actions
 */
function extractDeployFeatures(action: ActionContext): FeatureVector {
  const params = action.params as {
    bytecode?: string;
    constructorArgs?: unknown[];
  };

  return {
    bytecode_length: params.bytecode?.length ?? 0,
    has_constructor_args: params.constructorArgs && params.constructorArgs.length > 0 ? 1 : 0,
  };
}

/**
 * Extract features for generic/unknown actions
 */
function extractGenericFeatures(action: ActionContext): FeatureVector {
  const params = action.params;

  // Try to extract common patterns
  const features: FeatureVector = {
    param_count: Object.keys(params).length,
  };

  // Look for amount-like params
  for (const [key, value] of Object.entries(params)) {
    if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('value')) {
      features['amount'] = normalizeAmount(value as string | number | bigint);
      break;
    }
  }

  return features;
}

/**
 * Extract features from wallet context
 */
function extractWalletFeatures(wallet: WalletContext): FeatureVector {
  const features: FeatureVector = {
    chain_id: wallet.chainId,
  };

  if (wallet.balance !== undefined) {
    features['balance'] = Number(wallet.balance) / 1e18; // Normalize to ETH
  }

  if (wallet.dailySpend !== undefined) {
    features['daily_spend'] = Number(wallet.dailySpend) / 1e18;
  }

  if (wallet.spendLimit !== undefined) {
    features['spend_limit'] = Number(wallet.spendLimit) / 1e18;

    // Budget remaining ratio
    if (wallet.dailySpend !== undefined) {
      const remaining = Number(wallet.spendLimit - wallet.dailySpend);
      features['budget_remaining_ratio'] = remaining / Number(wallet.spendLimit);
    }
  }

  return features;
}

/**
 * Extract features from action history
 */
function extractHistoryFeatures(
  history: NonNullable<ActionContext['history']>
): FeatureVector {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  // Actions in last hour
  const lastHour = history.filter(h => now - h.timestamp < oneHour);
  // Actions in last day
  const lastDay = history.filter(h => now - h.timestamp < oneDay);

  return {
    actions_last_hour: lastHour.length,
    actions_last_day: lastDay.length,
    rejections_last_hour: lastHour.filter(h => h.decision === 'reject').length,
    rejections_last_day: lastDay.filter(h => h.decision === 'reject').length,
    success_rate_last_day:
      lastDay.length > 0
        ? lastDay.filter(h => h.success).length / lastDay.length
        : 1,
  };
}

/**
 * Normalize amount to a number
 */
function normalizeAmount(amount: string | number | bigint | undefined): number {
  if (amount === undefined) return 0;
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'bigint') return Number(amount) / 1e18;
  // Assume string is in wei for ETH-like values
  const num = parseFloat(amount);
  if (isNaN(num)) return 0;
  // If very large number, assume wei
  if (num > 1e15) return num / 1e18;
  return num;
}

/**
 * Check if token is a stablecoin
 */
function isStablecoin(token: string | undefined): number {
  if (!token) return 0;
  const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD'];
  return stablecoins.includes(token.toUpperCase()) ? 1 : 0;
}

/**
 * Transfer-specific feature extractor
 */
export const transferFeatureExtractor: FeatureExtractor = async (
  action: ActionContext,
  wallet?: WalletContext
): Promise<FeatureVector> => {
  const base = await defaultFeatureExtractor(action, wallet);

  // Add transfer-specific features
  const params = action.params as {
    to?: string;
    amount?: string | number | bigint;
  };

  return {
    ...base,
    // Additional transfer analysis
    is_round_amount: isRoundAmount(params.amount),
    amount_usd_estimate: 0, // Would need price oracle
  };
};

/**
 * Check if amount is a "round" number (potential red flag for unauthorized transfers)
 */
function isRoundAmount(amount: string | number | bigint | undefined): number {
  const num = normalizeAmount(amount);
  if (num === 0) return 0;

  // Check if it's a round number like 100, 1000, etc.
  const log10 = Math.log10(num);
  const isRound = Math.abs(log10 - Math.round(log10)) < 0.001;
  return isRound ? 1 : 0;
}

/**
 * High-value transaction feature extractor
 * Adds extra scrutiny for large transactions
 */
export const highValueFeatureExtractor: FeatureExtractor = async (
  action: ActionContext,
  wallet?: WalletContext
): Promise<FeatureVector> => {
  const base = await defaultFeatureExtractor(action, wallet);

  const amount = base['amount'] as number || 0;
  const balance = (base['balance'] as number) || 1000; // Default assumption

  return {
    ...base,
    // Ratio of transaction to balance
    amount_to_balance_ratio: amount / balance,
    // Is this the largest transaction today?
    is_largest_today: 0, // Would need history lookup
    // Velocity (transactions per hour)
    velocity: (base['actions_last_hour'] as number) || 0,
  };
};
