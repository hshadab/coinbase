/**
 * LangChain + AgentKit + Jolt Atlas Guardrails Example
 *
 * This example shows how to integrate zkML guardrails with a LangChain agent
 * using Coinbase AgentKit for onchain actions.
 */

import {
  withZkGuardrail,
  createGuardrail,
  type GuardrailConfig,
  type ActionContext,
  type GuardrailResult,
} from '@jolt-atlas/agentkit-guardrails';

// NOTE: In production, you would import these from the actual packages:
// import { AgentKit } from '@coinbase/agentkit';
// import { AgentKitToolkit } from '@coinbase/agentkit-langchain';
// import { ChatOpenAI } from '@langchain/openai';
// import { createReactAgent } from '@langchain/langgraph/prebuilt';

/**
 * Configuration for the guardrailed agent
 */
interface GuardrailedAgentConfig {
  /** Policy model for transaction authorization */
  transferPolicy: string;
  /** Policy model for swap authorization */
  swapPolicy?: string;
  /** Whether to block on policy rejection */
  blockOnReject: boolean;
  /** Callback when action is checked */
  onActionChecked?: (action: ActionContext, result: GuardrailResult) => void;
}

/**
 * Create a LangChain tool wrapper that adds guardrails to AgentKit actions
 */
function createGuardrailedTool<TInput, TOutput>(
  name: string,
  description: string,
  action: (input: TInput) => Promise<TOutput>,
  config: GuardrailConfig,
  extractAction: (input: TInput) => ActionContext
) {
  const guardrailedAction = withZkGuardrail(action, config, {
    getActionType: () => name,
  });

  return {
    name,
    description,
    invoke: async (input: TInput) => {
      const result = await guardrailedAction(input as any);
      return {
        output: result.result,
        guardrail: result.guardrail,
      };
    },
  };
}

/**
 * Example: Setting up a guardrailed LangChain agent
 */
async function setupGuardrailedAgent(config: GuardrailedAgentConfig) {
  console.log('\n=== Setting Up Guardrailed LangChain Agent ===\n');

  // In production, initialize AgentKit:
  // const agentKit = await AgentKit.from({
  //   cdpApiKeyName: process.env.CDP_API_KEY_NAME,
  //   cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
  //   networkId: 'base-mainnet',
  // });

  // Define guardrail configs
  const transferGuardrailConfig: GuardrailConfig = {
    policyModel: config.transferPolicy,
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: config.blockOnReject ? 'block' : 'warn',
    attestation: {
      enabled: true,
      chainId: 8453, // Base
    },
  };

  const swapGuardrailConfig: GuardrailConfig = {
    policyModel: config.swapPolicy || config.transferPolicy,
    proofMode: 'on-reject',
    onProofFail: 'allow',
    onModelReject: config.blockOnReject ? 'block' : 'warn',
  };

  // Create guardrailed tools
  // In production, wrap the actual AgentKit actions:
  // const toolkit = new AgentKitToolkit(agentKit);
  // const tools = toolkit.getTools().map(tool => {
  //   if (tool.name === 'transfer') {
  //     return createGuardrailedTool(tool, transferGuardrailConfig);
  //   }
  //   if (tool.name === 'swap') {
  //     return createGuardrailedTool(tool, swapGuardrailConfig);
  //   }
  //   return tool;
  // });

  // Simulated tools for this example
  const simulatedTools = [
    createGuardrailedTool(
      'transfer',
      'Transfer tokens to an address',
      async (input: { to: string; amount: string; asset: string }) => {
        console.log(`[Simulated Transfer] ${input.amount} ${input.asset} to ${input.to}`);
        return { txHash: '0x' + '1'.repeat(64), success: true };
      },
      transferGuardrailConfig,
      (input) => ({
        actionType: 'transfer',
        params: input,
        timestamp: Date.now(),
      })
    ),
    createGuardrailedTool(
      'swap',
      'Swap tokens using a DEX',
      async (input: { fromToken: string; toToken: string; amount: string }) => {
        console.log(`[Simulated Swap] ${input.amount} ${input.fromToken} -> ${input.toToken}`);
        return { txHash: '0x' + '2'.repeat(64), success: true };
      },
      swapGuardrailConfig,
      (input) => ({
        actionType: 'swap',
        params: input,
        timestamp: Date.now(),
      })
    ),
  ];

  // In production, create the agent:
  // const llm = new ChatOpenAI({ model: 'gpt-4' });
  // const agent = createReactAgent({
  //   llm,
  //   tools,
  //   messageModifier: `You are an AI agent with onchain capabilities.
  //     All your transactions are protected by zkML guardrails.
  //     If an action is blocked, explain why and suggest alternatives.`,
  // });

  return {
    tools: simulatedTools,
    // agent, // In production
  };
}

/**
 * Example: Running the guardrailed agent
 */
async function runGuardrailedAgent() {
  console.log('\n=== Running Guardrailed Agent ===\n');

  const { tools } = await setupGuardrailedAgent({
    transferPolicy: './models/tx-authorization.onnx',
    blockOnReject: true,
    onActionChecked: (action, result) => {
      console.log(`[Audit] Action: ${action.actionType}, Decision: ${result.decision}`);
    },
  });

  // Simulate agent actions
  console.log('Agent executing transfer...');
  try {
    const transferResult = await tools[0].invoke({
      to: '0x1234567890123456789012345678901234567890',
      amount: '100',
      asset: 'USDC',
    });
    console.log('Transfer result:', transferResult.output);
    console.log('Guardrail decision:', transferResult.guardrail.decision);
    console.log('Proof generated:', !!transferResult.guardrail.proof);
  } catch (error) {
    console.log('Transfer blocked:', (error as Error).message);
  }

  console.log('\nAgent executing swap...');
  try {
    const swapResult = await tools[1].invoke({
      fromToken: 'ETH',
      toToken: 'USDC',
      amount: '1',
    });
    console.log('Swap result:', swapResult.output);
    console.log('Guardrail decision:', swapResult.guardrail.decision);
  } catch (error) {
    console.log('Swap blocked:', (error as Error).message);
  }
}

/**
 * Example: Custom guardrail with action history
 */
async function exampleWithHistory() {
  console.log('\n=== Example: Guardrail with Action History ===\n');

  // Track action history for rate limiting / pattern detection
  const actionHistory: ActionContext['history'] = [];

  const guardrail = createGuardrail({
    policyModel: './models/tx-authorization.onnx',
    proofMode: 'always',
    onProofFail: 'reject',
    onModelReject: 'block',
  });

  // Simulate multiple actions
  for (let i = 0; i < 5; i++) {
    const action: ActionContext = {
      actionType: 'transfer',
      params: { to: '0x...', amount: String((i + 1) * 100), asset: 'USDC' },
      timestamp: Date.now(),
      history: [...actionHistory], // Pass history to feature extractor
    };

    const result = await guardrail.check(action);
    console.log(`Action ${i + 1}: ${result.decision} (confidence: ${result.confidence.toFixed(3)})`);

    // Update history
    actionHistory.push({
      actionType: action.actionType,
      timestamp: action.timestamp,
      decision: result.decision,
      success: result.decision === 'approve',
    });
  }
}

// Main
async function main() {
  console.log('Jolt Atlas + LangChain + AgentKit Integration');
  console.log('==============================================');

  await setupGuardrailedAgent({
    transferPolicy: './models/tx-authorization.onnx',
    blockOnReject: true,
  });

  await runGuardrailedAgent();
  await exampleWithHistory();

  console.log('\n✅ LangChain integration examples completed!');
}

main().catch(console.error);
