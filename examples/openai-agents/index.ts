/**
 * OpenAI Agents SDK + AgentKit + Jolt Atlas Guardrails Example
 *
 * This example shows how to integrate zkML guardrails with OpenAI's Agents SDK
 * and Coinbase AgentKit for onchain actions.
 */

import {
  withZkGuardrail,
  createGuardrail,
  type GuardrailConfig,
  type ActionContext,
  type GuardrailResult,
} from '@jolt-atlas/agentkit-guardrails';

// NOTE: In production, import from actual packages:
// import { Agent, Tool } from 'openai/agents';
// import { AgentKit } from '@coinbase/agentkit';

/**
 * Create a guardrailed tool for OpenAI Agents SDK
 */
function createOpenAIAgentTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  execute: (params: Record<string, unknown>) => Promise<unknown>,
  guardrailConfig: GuardrailConfig
) {
  const guardrailedExecute = withZkGuardrail(execute, guardrailConfig, {
    getActionType: () => name,
  });

  return {
    type: 'function' as const,
    function: {
      name,
      description: `${description} [Protected by zkML guardrail]`,
      parameters,
    },
    execute: async (params: Record<string, unknown>) => {
      const result = await guardrailedExecute(params);
      return {
        ...result.result as object,
        _guardrail: {
          decision: result.guardrail.decision,
          confidence: result.guardrail.confidence,
          proofGenerated: !!result.guardrail.proof,
          attestationHash: result.guardrail.attestation?.hash,
        },
      };
    },
  };
}

/**
 * Setup guardrailed OpenAI agent with AgentKit actions
 */
async function setupOpenAIAgent() {
  console.log('\n=== Setting Up OpenAI Agent with Guardrails ===\n');

  // Guardrail configs for different risk levels
  const highRiskConfig: GuardrailConfig = {
    policyModel: './models/high-value-tx.onnx',
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: 'block',
    attestation: {
      enabled: true,
      postOnchain: true, // Post attestations for high-risk actions
      chainId: 8453,
    },
  };

  const lowRiskConfig: GuardrailConfig = {
    policyModel: './models/basic-tx.onnx',
    proofMode: 'on-reject',
    onProofFail: 'allow',
    onModelReject: 'warn',
  };

  // Define guardrailed tools
  const tools = [
    // High-value transfer tool (strict guardrails)
    createOpenAIAgentTool(
      'transfer_tokens',
      'Transfer tokens to another address. Use for payments and transfers.',
      {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient address' },
          amount: { type: 'string', description: 'Amount to transfer' },
          asset: { type: 'string', description: 'Token symbol (e.g., USDC, ETH)' },
        },
        required: ['to', 'amount', 'asset'],
      },
      async (params) => {
        const { to, amount, asset } = params as { to: string; amount: string; asset: string };
        console.log(`[Execute] Transferring ${amount} ${asset} to ${to}`);
        // In production: return await agentKit.transfer(params);
        return { txHash: '0x' + 'a'.repeat(64), status: 'confirmed' };
      },
      highRiskConfig
    ),

    // Swap tool (medium guardrails)
    createOpenAIAgentTool(
      'swap_tokens',
      'Swap one token for another using the best available DEX route.',
      {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Token to swap from' },
          toToken: { type: 'string', description: 'Token to swap to' },
          amount: { type: 'string', description: 'Amount of fromToken to swap' },
          slippage: { type: 'number', description: 'Max slippage percentage' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
      async (params) => {
        const { fromToken, toToken, amount, slippage = 0.5 } = params as {
          fromToken: string;
          toToken: string;
          amount: string;
          slippage?: number;
        };
        console.log(`[Execute] Swapping ${amount} ${fromToken} -> ${toToken} (slippage: ${slippage}%)`);
        return { txHash: '0x' + 'b'.repeat(64), status: 'confirmed', outputAmount: '1500' };
      },
      lowRiskConfig
    ),

    // Check balance (no guardrails needed for read-only)
    {
      type: 'function' as const,
      function: {
        name: 'get_balance',
        description: 'Get the balance of a token in the agent wallet.',
        parameters: {
          type: 'object',
          properties: {
            asset: { type: 'string', description: 'Token symbol' },
          },
          required: ['asset'],
        },
      },
      execute: async (params: Record<string, unknown>) => {
        const { asset } = params as { asset: string };
        console.log(`[Execute] Getting balance for ${asset}`);
        return { asset, balance: '1000.00', usdValue: '$1000.00' };
      },
    },
  ];

  // In production, create the OpenAI agent:
  // const agent = new Agent({
  //   name: 'crypto-agent',
  //   instructions: `You are an AI agent that can perform onchain actions.
  //     All your transactions are protected by zkML guardrails that ensure
  //     you're following the configured policy. If an action is blocked,
  //     explain the reason and suggest alternatives within policy limits.`,
  //   model: 'gpt-4-turbo',
  //   tools,
  // });

  return { tools };
}

/**
 * Simulate agent conversation with guardrailed actions
 */
async function simulateAgentConversation() {
  console.log('\n=== Simulating Agent Conversation ===\n');

  const { tools } = await setupOpenAIAgent();

  // Simulate: User asks to transfer tokens
  console.log('User: "Send 100 USDC to 0x1234..."');
  console.log('Agent: Let me process that transfer for you.\n');

  const transferTool = tools.find(t => t.function.name === 'transfer_tokens')!;
  try {
    const result = await transferTool.execute({
      to: '0x1234567890123456789012345678901234567890',
      amount: '100',
      asset: 'USDC',
    });
    console.log('Agent: Transfer completed!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('Agent: I apologize, but I cannot complete this transfer.');
    console.log('Reason:', (error as Error).message);
  }

  // Simulate: User asks for a swap
  console.log('\n---\n');
  console.log('User: "Swap 1 ETH for USDC"');
  console.log('Agent: Processing your swap...\n');

  const swapTool = tools.find(t => t.function.name === 'swap_tokens')!;
  try {
    const result = await swapTool.execute({
      fromToken: 'ETH',
      toToken: 'USDC',
      amount: '1',
    });
    console.log('Agent: Swap completed!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('Agent: Swap could not be completed.');
    console.log('Reason:', (error as Error).message);
  }
}

/**
 * Example: Guardrail with custom policy for OpenAI agents
 */
async function exampleCustomPolicy() {
  console.log('\n=== Custom Policy Example ===\n');

  // Custom guardrail that considers the agent's daily activity
  let dailySpendUsd = 0;
  const dailyLimitUsd = 1000;

  const customGuardrail = createGuardrail({
    policyModel: {
      path: './models/daily-limit.onnx',
      threshold: 0.6,
    },
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: 'block',
    featureExtractor: async (action) => {
      // Extract amount and convert to USD estimate
      const amount = parseFloat(action.params.amount as string) || 0;
      const asset = action.params.asset as string;

      // Simple USD estimation (in production, use price oracle)
      const usdPrices: Record<string, number> = {
        USDC: 1,
        ETH: 2000,
        BTC: 40000,
      };
      const amountUsd = amount * (usdPrices[asset] || 1);

      return {
        amount_usd: amountUsd,
        daily_spend: dailySpendUsd,
        daily_limit: dailyLimitUsd,
        budget_remaining: dailyLimitUsd - dailySpendUsd,
        would_exceed_limit: dailySpendUsd + amountUsd > dailyLimitUsd ? 1 : 0,
      };
    },
  });

  // Test transactions
  const transactions = [
    { amount: '200', asset: 'USDC' },
    { amount: '300', asset: 'USDC' },
    { amount: '600', asset: 'USDC' }, // Would exceed daily limit
  ];

  for (const tx of transactions) {
    const result = await customGuardrail.check({
      actionType: 'transfer',
      params: { to: '0x...', ...tx },
      timestamp: Date.now(),
    });

    console.log(
      `Transfer ${tx.amount} ${tx.asset}: ${result.decision} ` +
        `(confidence: ${result.confidence.toFixed(3)})`
    );

    if (result.decision === 'approve') {
      // Update daily spend
      dailySpendUsd += parseFloat(tx.amount);
      console.log(`  -> Daily spend now: $${dailySpendUsd}`);
    }
  }
}

// Main
async function main() {
  console.log('Jolt Atlas + OpenAI Agents SDK + AgentKit Integration');
  console.log('======================================================');

  await setupOpenAIAgent();
  await simulateAgentConversation();
  await exampleCustomPolicy();

  console.log('\n✅ OpenAI Agents integration examples completed!');
}

main().catch(console.error);
