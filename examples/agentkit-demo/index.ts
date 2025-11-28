/**
 * Trustless AgentKit Demo
 *
 * Shows how to add verifiable behavior to your AgentKit agents.
 *
 * Run: npx tsx examples/agentkit-demo/index.ts
 *
 * What this demo shows:
 * 1. Wrap any AgentKit action with zkML guardrails
 * 2. Policy model decides if action is allowed
 * 3. Cryptographic proof generated for every decision
 * 4. Proof can be posted on-chain for verification
 */

import {
  withZkGuardrail,
  checkAction,
  getPolicyModel,
  type GuardrailConfig,
} from '../../packages/agentkit-guardrails/dist/index.mjs';

// ============================================================================
// Simulated AgentKit (replace with real AgentKit in production)
// ============================================================================

interface TransferParams {
  to: string;
  amount: string;
  asset: string;
}

interface AgentKitAction<T, R> {
  (params: T): Promise<R>;
}

// Simulate an AgentKit transfer action
const agentKitTransfer: AgentKitAction<TransferParams, { txHash: string }> = async (params) => {
  // In real AgentKit: agent.getAction('transfer')
  console.log(`    Executing transfer: ${params.amount} ${params.asset} → ${params.to.slice(0, 10)}...`);
  await new Promise(r => setTimeout(r, 500)); // Simulate tx time
  return { txHash: '0x' + Math.random().toString(16).slice(2).repeat(4).slice(0, 64) };
};

// ============================================================================
// Demo Scenarios
// ============================================================================

async function demo() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    TRUSTLESS AGENTKIT DEMO                           ║
║                                                                       ║
║  Every AI agent deserves a wallet.                                   ║
║  Every wallet deserves verifiable behavior.                          ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // -------------------------------------------------------------------------
  // Setup: Create a guardrailed version of the transfer action
  // -------------------------------------------------------------------------

  console.log('🔧 Setting up zkML guardrails...\n');

  const guardrailConfig: GuardrailConfig = {
    policyModel: './models/spending-policy.onnx', // Your trained ONNX model
    proofMode: 'always',      // Generate proof for every action
    onModelReject: 'block',   // Block if policy says no
    onProofFail: 'reject',    // Reject if proof generation fails
  };

  // Wrap the AgentKit action with zkML guardrails
  const safeTransfer = withZkGuardrail(agentKitTransfer, guardrailConfig);

  console.log('✅ Guardrails configured\n');
  console.log('─'.repeat(70));

  // -------------------------------------------------------------------------
  // Scenario 1: Normal transaction (should APPROVE)
  // -------------------------------------------------------------------------

  console.log('\n📋 SCENARIO 1: Normal Transaction\n');
  console.log('   Agent wants to send $50 USDC to a known address');
  console.log('   Policy: Allow transfers under $1000 to verified addresses\n');

  try {
    const result1 = await safeTransfer({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f3C123',
      amount: '50',
      asset: 'USDC',
    });

    console.log('\n   📊 RESULT:');
    console.log(`   ├─ Decision: ${result1.guardrail.decision.toUpperCase()}`);
    console.log(`   ├─ Confidence: ${(result1.guardrail.confidence * 100).toFixed(1)}%`);
    console.log(`   ├─ Proof: ${result1.guardrail.proof ? '✓ Generated' : '✗ None'}`);
    console.log(`   └─ TX Hash: ${result1.result.txHash.slice(0, 20)}...`);
  } catch (error) {
    console.log(`   ❌ Blocked: ${(error as Error).message}`);
  }

  console.log('\n' + '─'.repeat(70));

  // -------------------------------------------------------------------------
  // Scenario 2: Large transaction (should REVIEW or REJECT)
  // -------------------------------------------------------------------------

  console.log('\n📋 SCENARIO 2: Large Transaction\n');
  console.log('   Agent wants to send $50,000 USDC');
  console.log('   Policy: Flag transactions over $10,000 for review\n');

  try {
    const result2 = await safeTransfer({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f3C456',
      amount: '50000',
      asset: 'USDC',
    });

    console.log('\n   📊 RESULT:');
    console.log(`   ├─ Decision: ${result2.guardrail.decision.toUpperCase()}`);
    console.log(`   ├─ Confidence: ${(result2.guardrail.confidence * 100).toFixed(1)}%`);
    console.log(`   └─ Proof: ${result2.guardrail.proof ? '✓ Generated' : '✗ None'}`);
  } catch (error: any) {
    console.log(`\n   📊 RESULT:`);
    console.log(`   ├─ Decision: BLOCKED`);
    console.log(`   └─ Reason: ${error.message || 'Policy rejected transaction'}`);
  }

  console.log('\n' + '─'.repeat(70));

  // -------------------------------------------------------------------------
  // Scenario 3: Check without executing
  // -------------------------------------------------------------------------

  console.log('\n📋 SCENARIO 3: Pre-flight Check (No Execution)\n');
  console.log('   Check if an action would be allowed before executing');
  console.log('   Useful for: UI warnings, multi-step approvals\n');

  const preflightResult = await checkAction(
    {
      action: 'transfer',
      params: { to: '0x...', amount: '500', asset: 'ETH' },
    },
    {
      policyModel: './models/spending-policy.onnx',
      extractFeatures: (ctx) => ({
        amount: parseFloat(ctx.params.amount as string),
        limit: 1000,
        trust_score: 0.8,
      }),
    }
  );

  console.log('   📊 PRE-FLIGHT RESULT:');
  console.log(`   ├─ Would be allowed: ${preflightResult.decision === 'approve' ? 'YES ✓' : 'NO ✗'}`);
  console.log(`   ├─ Decision: ${preflightResult.decision}`);
  console.log(`   ├─ Confidence: ${(preflightResult.confidence * 100).toFixed(1)}%`);
  console.log(`   └─ Proof available: ${preflightResult.proof ? 'Yes' : 'No'}`);

  console.log('\n' + '─'.repeat(70));

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                           WHAT HAPPENED                              ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  1. AgentKit action wrapped with withZkGuardrail()                   ║
║  2. Policy model evaluated each transaction                          ║
║  3. zkML proof generated for every decision                          ║
║  4. Proof can be verified on-chain (Base Sepolia)                    ║
║                                                                       ║
║  WHY THIS MATTERS FOR AGENTIC COMMERCE:                              ║
║                                                                       ║
║  • Users can verify their agent followed spending rules              ║
║  • Agents can prove policy compliance to other agents                ║
║  • Trust without trusting the operator                               ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝

📚 Next steps:
   • Train your own policy model (ONNX format)
   • Deploy contracts to Base: forge script script/Deploy.s.sol
   • Post attestations on-chain for permanent proof
   • See: https://github.com/hshadab/coinbase

`);
}

// Run the demo
demo().catch(console.error);
