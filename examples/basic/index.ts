/**
 * Basic Example: Using Jolt Atlas Guardrails with AgentKit
 *
 * This example shows how to wrap AgentKit actions with zkML guardrails
 * to enforce policy compliance with cryptographic proofs.
 */

import {
  withZkGuardrail,
  createGuardrail,
  checkAction,
  type ActionContext,
  type GuardrailConfig,
  type WalletContext,
} from '@jolt-atlas/agentkit-guardrails';

// Simulated AgentKit action (replace with real AgentKit in production)
async function simulatedTransfer(params: {
  to: string;
  amount: string;
  asset: string;
}): Promise<{ txHash: string }> {
  console.log(`[Simulated] Transferring ${params.amount} ${params.asset} to ${params.to}`);
  return { txHash: '0x' + '1'.repeat(64) };
}

// Example 1: Wrap an action with guardrails
async function example1_wrappedAction() {
  console.log('\n=== Example 1: Wrapped Action ===\n');

  const config: GuardrailConfig = {
    policyModel: './models/tx-authorization.onnx', // Path to your ONNX model
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: 'block',
  };

  // Wrap the transfer action with guardrails
  const guardrailedTransfer = withZkGuardrail(simulatedTransfer, config);

  try {
    // This transfer will be checked by the policy model before execution
    const result = await guardrailedTransfer({
      to: '0x1234567890123456789012345678901234567890',
      amount: '100',
      asset: 'USDC',
    });

    console.log('Transfer succeeded!');
    console.log('Decision:', result.guardrail.decision);
    console.log('Confidence:', result.guardrail.confidence.toFixed(3));
    console.log('Model Commitment:', result.guardrail.modelCommitment);
    console.log('Proof Generated:', !!result.guardrail.proof);
    console.log('TX Hash:', result.result.txHash);
  } catch (error) {
    if ((error as Error).name === 'GuardrailBlockedError') {
      console.log('Transfer blocked by guardrail!');
      console.log('Reason:', (error as Error).message);
    } else {
      throw error;
    }
  }
}

// Example 2: Check action without executing
async function example2_checkOnly() {
  console.log('\n=== Example 2: Check Only (No Execution) ===\n');

  const config: GuardrailConfig = {
    policyModel: {
      path: './models/tx-authorization.onnx',
      name: 'Transaction Authorization',
      threshold: 0.7, // Higher threshold = more strict
    },
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: 'log',
  };

  const action: ActionContext = {
    actionType: 'transfer',
    params: {
      to: '0x1234567890123456789012345678901234567890',
      amount: '50000', // Large amount
      asset: 'USDC',
    },
    timestamp: Date.now(),
  };

  const wallet: WalletContext = {
    address: '0xABCD...',
    chainId: 8453, // Base
    balance: BigInt(100000e6), // 100k USDC
    dailySpend: BigInt(10000e6), // Already spent 10k today
    spendLimit: BigInt(50000e6), // Daily limit 50k
  };

  const result = await checkAction(action, config, wallet);

  console.log('Action:', action.actionType);
  console.log('Amount:', action.params.amount);
  console.log('Decision:', result.decision);
  console.log('Confidence:', result.confidence.toFixed(3));
  console.log('Would be allowed:', result.decision === 'approve');
}

// Example 3: Using attestations for audit trail
async function example3_withAttestation() {
  console.log('\n=== Example 3: With Attestation ===\n');

  const config: GuardrailConfig = {
    policyModel: './models/tx-authorization.onnx',
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: 'block',
    attestation: {
      enabled: true,
      // In production, you'd provide a real signer
      // signer: yourWalletClient,
      chainId: 8453,
    },
  };

  const guardrail = createGuardrail(config);

  const action: ActionContext = {
    actionType: 'transfer',
    params: {
      to: '0x1234567890123456789012345678901234567890',
      amount: '100',
      asset: 'USDC',
    },
    timestamp: Date.now(),
  };

  const result = await guardrail.check(action);

  console.log('Decision:', result.decision);
  console.log('Attestation created:', !!result.attestation);

  if (result.attestation) {
    console.log('Attestation hash:', result.attestation.hash);
    console.log('Attestation data:', JSON.stringify(result.attestation.data, null, 2));
  }
}

// Example 4: Different guardrails for different action types
async function example4_multipleGuardrails() {
  console.log('\n=== Example 4: Multiple Guardrails ===\n');

  // Strict guardrail for transfers
  const transferConfig: GuardrailConfig = {
    policyModel: './models/transfer-policy.onnx',
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: 'block',
  };

  // More permissive guardrail for swaps
  const swapConfig: GuardrailConfig = {
    policyModel: './models/swap-policy.onnx',
    proofMode: 'on-reject', // Only generate proof if rejected
    onProofFail: 'allow', // Allow even if proof fails
    onModelReject: 'warn', // Just warn, don't block
  };

  const transferGuardrail = createGuardrail(transferConfig);
  const swapGuardrail = createGuardrail(swapConfig);

  // Check a transfer
  const transferResult = await transferGuardrail.check({
    actionType: 'transfer',
    params: { to: '0x...', amount: '1000', asset: 'ETH' },
    timestamp: Date.now(),
  });
  console.log('Transfer decision:', transferResult.decision);

  // Check a swap
  const swapResult = await swapGuardrail.check({
    actionType: 'swap',
    params: { fromToken: 'ETH', toToken: 'USDC', amount: '1', slippage: 0.5 },
    timestamp: Date.now(),
  });
  console.log('Swap decision:', swapResult.decision);
}

// Run all examples
async function main() {
  console.log('Jolt Atlas AgentKit Guardrails - Basic Examples');
  console.log('================================================');

  await example1_wrappedAction();
  await example2_checkOnly();
  await example3_withAttestation();
  await example4_multipleGuardrails();

  console.log('\n✅ All examples completed!');
}

main().catch(console.error);
