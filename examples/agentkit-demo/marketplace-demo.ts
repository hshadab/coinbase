/**
 * Trustless Agent Marketplace Demo
 *
 * Demonstrates the full Option 3 flow: Agent-to-Agent Commerce
 *
 * Components:
 * - ERC-8004: Agent identity, reputation, and validation registries
 * - x402: HTTP micropayments via 402 Payment Required
 * - Kinic: On-chain memory for discovery and history
 * - zkML: Verifiable proof of execution
 *
 * Run: npx tsx examples/agentkit-demo/marketplace-demo.ts
 */

// ============================================================================
// Mock implementations for demo (replace with real in production)
// ============================================================================

// Mock ethers signer
const mockSigner = {
  getAddress: async () => '0x1234567890123456789012345678901234567890',
  provider: {
    getNetwork: async () => ({ chainId: 84532n }),
    getBalance: async () => 1000000000000000000n,
  },
  signTypedData: async () => '0x' + 'ab'.repeat(65),
  sendTransaction: async () => ({ wait: async () => ({ hash: '0x' + 'cd'.repeat(32) }) }),
};

// ============================================================================
// Demo Data
// ============================================================================

interface AgentProfile {
  id: number;
  name: string;
  type: string;
  wallet: string;
  trustScore: number;
  services: string[];
}

const DEMO_AGENTS: AgentProfile[] = [
  {
    id: 1,
    name: 'DataAnalyst-Agent',
    type: 'data-analysis',
    wallet: '0xAgent1...111',
    trustScore: 95,
    services: ['sentiment-analysis', 'market-trends', 'data-aggregation'],
  },
  {
    id: 2,
    name: 'ContentGen-Agent',
    type: 'content-generation',
    wallet: '0xAgent2...222',
    trustScore: 88,
    services: ['blog-writing', 'social-media', 'summarization'],
  },
  {
    id: 3,
    name: 'TradingBot-Agent',
    type: 'trading',
    wallet: '0xAgent3...333',
    trustScore: 72,
    services: ['price-alerts', 'dex-aggregation', 'portfolio-tracking'],
  },
];

// ============================================================================
// Demo Functions
// ============================================================================

async function printHeader() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TRUSTLESS AGENT MARKETPLACE DEMO                          ║
║                                                                               ║
║  x402 + ERC-8004 + Kinic + zkML = Trustless Agent Commerce                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
}

async function printStep(step: number, title: string, description: string) {
  console.log(`
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP ${step}: ${title.padEnd(67)}│
├──────────────────────────────────────────────────────────────────────────────┤
│ ${description.padEnd(76)}│
└──────────────────────────────────────────────────────────────────────────────┘
`);
}

async function simulateDelay(ms: number, message: string) {
  process.stdout.write(`   ⏳ ${message}...`);
  await new Promise(r => setTimeout(r, ms));
  console.log(' ✓');
}

// ============================================================================
// Step 1: Agent Registration (ERC-8004)
// ============================================================================

async function step1_registerAgent() {
  printStep(1, 'AGENT REGISTRATION', 'Register your agent identity on-chain via ERC-8004');

  console.log('   📋 What happens:');
  console.log('      - Agent mints NFT identity (IdentityRegistry)');
  console.log('      - Model commitment hash stored on-chain');
  console.log('      - Wallet address linked to agent ID\n');

  await simulateDelay(500, 'Registering agent on IdentityRegistry');

  const myAgentId = 42;
  const modelCommitment = '0x' + 'a1b2c3d4'.repeat(8);

  console.log('\n   ✅ Agent Registered:');
  console.log(`      ├─ Agent ID: ${myAgentId}`);
  console.log(`      ├─ Model Commitment: ${modelCommitment.slice(0, 20)}...`);
  console.log(`      ├─ Wallet: ${await mockSigner.getAddress()}`);
  console.log(`      └─ Identity NFT: AgentIdentity #${myAgentId}`);

  return myAgentId;
}

// ============================================================================
// Step 2: Service Registration (Kinic)
// ============================================================================

async function step2_registerService(agentId: number) {
  printStep(2, 'SERVICE REGISTRATION', 'List your services in the marketplace (stored in Kinic)');

  console.log('   📋 What happens:');
  console.log('      - Service details stored in Kinic on-chain memory');
  console.log('      - zkML embedding generated for semantic search');
  console.log('      - Metadata indexed for discovery\n');

  await simulateDelay(400, 'Generating service embedding');
  await simulateDelay(300, 'Storing in Kinic canister');

  const service = {
    agentId,
    serviceType: 'code-review',
    description: 'AI-powered code review with security analysis',
    basePrice: '1000000', // 1 USDC (6 decimals)
    endpoint: 'https://myagent.example/api/review',
    tags: ['code', 'security', 'review', 'ai'],
  };

  console.log('\n   ✅ Service Registered:');
  console.log(`      ├─ Type: ${service.serviceType}`);
  console.log(`      ├─ Description: ${service.description}`);
  console.log(`      ├─ Base Price: ${parseInt(service.basePrice) / 1e6} USDC`);
  console.log(`      ├─ Endpoint: ${service.endpoint}`);
  console.log(`      └─ Tags: [${service.tags.join(', ')}]`);

  return service;
}

// ============================================================================
// Step 3: Agent Discovery (Kinic Semantic Search)
// ============================================================================

async function step3_discoverAgents() {
  printStep(3, 'AGENT DISCOVERY', 'Find service providers via Kinic semantic search');

  console.log('   📋 What happens:');
  console.log('      - Query converted to embedding via zkML');
  console.log('      - Semantic search across all service listings');
  console.log('      - Results ranked by relevance + trust score\n');

  const searchQuery = 'data analysis with machine learning for market trends';
  console.log(`   🔍 Search Query: "${searchQuery}"\n`);

  await simulateDelay(300, 'Generating query embedding');
  await simulateDelay(400, 'Searching Kinic vector database');
  await simulateDelay(200, 'Fetching trust scores from ERC-8004');

  console.log('\n   📊 Discovery Results:\n');
  console.log('   ┌─────┬──────────────────────┬───────────────────┬─────────────┬───────────┐');
  console.log('   │ ID  │ Agent                │ Service Type      │ Trust Score │ Price     │');
  console.log('   ├─────┼──────────────────────┼───────────────────┼─────────────┼───────────┤');

  for (const agent of DEMO_AGENTS) {
    const score = agent.trustScore >= 90 ? '🟢' : agent.trustScore >= 75 ? '🟡' : '🟠';
    console.log(
      `   │ ${String(agent.id).padEnd(3)} │ ${agent.name.padEnd(20)} │ ${agent.type.padEnd(17)} │ ${score} ${String(agent.trustScore + '%').padEnd(8)} │ 0.50 USDC │`
    );
  }
  console.log('   └─────┴──────────────────────┴───────────────────┴─────────────┴───────────┘');

  console.log('\n   💡 Selected: DataAnalyst-Agent (highest trust score)');

  return DEMO_AGENTS[0];
}

// ============================================================================
// Step 4: Trust Verification (ERC-8004)
// ============================================================================

async function step4_verifyTrust(agent: AgentProfile) {
  printStep(4, 'TRUST VERIFICATION', 'Verify provider meets trust requirements via ERC-8004');

  console.log('   📋 What happens:');
  console.log('      - Check IdentityRegistry: Is agent registered?');
  console.log('      - Check ReputationRegistry: What is their feedback score?');
  console.log('      - Check ValidationRegistry: How many verified proofs?\n');

  await simulateDelay(200, 'Querying IdentityRegistry');
  await simulateDelay(200, 'Querying ReputationRegistry');
  await simulateDelay(200, 'Querying ValidationRegistry');

  console.log(`\n   📊 Trust Report for ${agent.name}:\n`);

  console.log('   ┌────────────────────────────────────────────────────────────────────┐');
  console.log('   │ ERC-8004 TRUST VERIFICATION                                        │');
  console.log('   ├────────────────────────────────────────────────────────────────────┤');
  console.log(`   │ IdentityRegistry                                                   │`);
  console.log(`   │   ├─ Registered: ✅ Yes (Agent #${agent.id})                            │`);
  console.log(`   │   ├─ Model Commitment: 0xa1b2c3...                                  │`);
  console.log(`   │   └─ Wallet Verified: ✅                                            │`);
  console.log('   ├────────────────────────────────────────────────────────────────────┤');
  console.log('   │ ReputationRegistry                                                 │');
  console.log(`   │   ├─ Feedback Count: 156 reviews                                   │`);
  console.log(`   │   ├─ Average Score: ${agent.trustScore}/100                                       │`);
  console.log('   │   └─ Recent: 98% positive (last 30 days)                           │');
  console.log('   ├────────────────────────────────────────────────────────────────────┤');
  console.log('   │ ValidationRegistry (zkML)                                          │');
  console.log('   │   ├─ Attestation Count: 423 proofs                                 │');
  console.log('   │   ├─ Approval Rate: 99.3%                                          │');
  console.log('   │   └─ Avg Confidence: 0.97                                          │');
  console.log('   ├────────────────────────────────────────────────────────────────────┤');
  console.log('   │ VERDICT: ✅ TRUSTED - Meets all requirements                       │');
  console.log('   └────────────────────────────────────────────────────────────────────┘');

  return { verified: true, trustScore: agent.trustScore };
}

// ============================================================================
// Step 5: x402 Payment + Service Execution
// ============================================================================

async function step5_executeWithPayment(agent: AgentProfile) {
  printStep(5, 'x402 PAYMENT + EXECUTION', 'Pay for service via HTTP 402 and get verified result');

  console.log('   📋 What happens:');
  console.log('      - Initial request returns 402 Payment Required');
  console.log('      - Create EIP-3009 USDC authorization signature');
  console.log('      - Retry request with X-PAYMENT header');
  console.log('      - Provider executes and returns result + zkML proof\n');

  console.log('   ───────────────────────────────────────────────────────────────────');
  console.log('   REQUEST FLOW:');
  console.log('   ───────────────────────────────────────────────────────────────────\n');

  // Step 5a: Initial request
  console.log('   [1] Initial Request:');
  console.log('       POST https://dataanalyst.agent/api/analyze');
  console.log('       Content-Type: application/json');
  console.log('       Body: { "task": "sentiment analysis", "data": [...] }');
  await simulateDelay(200, 'Sending request');

  // Step 5b: 402 response
  console.log('\n   [2] Response: 402 Payment Required');
  console.log('       X-Payment-Required: {');
  console.log('         "scheme": "exact",');
  console.log('         "network": "base-sepolia",');
  console.log('         "maxAmountRequired": "500000",  // 0.50 USDC');
  console.log('         "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",');
  console.log(`         "payTo": "${agent.wallet}"`);
  console.log('       }');

  // Step 5c: Create payment
  await simulateDelay(300, 'Creating EIP-3009 authorization');
  console.log('\n   [3] Create x402 Payment Header:');
  console.log('       X-PAYMENT: base64({');
  console.log('         "x402Version": 1,');
  console.log('         "scheme": "exact",');
  console.log('         "payload": {');
  console.log('           "signature": "0xabc...def",');
  console.log('           "authorization": {');
  console.log('             "from": "0x1234...7890",');
  console.log(`             "to": "${agent.wallet}",`);
  console.log('             "value": "500000",');
  console.log('             "validBefore": "1735689600"');
  console.log('           }');
  console.log('         }');
  console.log('       })');

  // Step 5d: Paid request
  await simulateDelay(400, 'Executing paid request');
  console.log('\n   [4] Retry with Payment:');
  console.log('       POST https://dataanalyst.agent/api/analyze');
  console.log('       X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSw...');
  console.log('       X-Require-Proof: true');

  // Step 5e: Success response
  await simulateDelay(500, 'Provider executing + generating proof');
  console.log('\n   [5] Response: 200 OK');
  console.log('       Content-Type: application/json');
  console.log('       X-Proof: 0x7a6b5c4d... (zkML SNARK)');
  console.log('       X-Attestation-Hash: 0x9e8f7d6c...');
  console.log('       Body: {');
  console.log('         "sentiment": "bullish",');
  console.log('         "confidence": 0.87,');
  console.log('         "analysis": "Strong positive signals..."');
  console.log('       }');

  console.log('\n   ───────────────────────────────────────────────────────────────────');

  return {
    result: { sentiment: 'bullish', confidence: 0.87 },
    proof: '0x7a6b5c4d' + 'e'.repeat(56),
    attestationHash: '0x9e8f7d6c' + 'a'.repeat(56),
    txHash: '0x' + 'f'.repeat(64),
  };
}

// ============================================================================
// Step 6: Record Interaction (Kinic + ERC-8004)
// ============================================================================

async function step6_recordInteraction(agent: AgentProfile, result: any) {
  printStep(6, 'RECORD INTERACTION', 'Store interaction in Kinic and update reputation');

  console.log('   📋 What happens:');
  console.log('      - Full interaction stored in Kinic (searchable history)');
  console.log('      - zkML proof posted to ValidationRegistry (on-chain record)');
  console.log('      - Positive feedback submitted to ReputationRegistry\n');

  await simulateDelay(300, 'Recording in Kinic memory');
  await simulateDelay(200, 'Posting attestation to ValidationRegistry');
  await simulateDelay(200, 'Submitting feedback to ReputationRegistry');

  console.log('\n   ✅ Interaction Recorded:\n');

  console.log('   ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('   │ KINIC MEMORY ENTRY                                                  │');
  console.log('   ├─────────────────────────────────────────────────────────────────────┤');
  console.log(`   │ Request ID: req_${Date.now().toString(16)}                              │`);
  console.log(`   │ From: Agent #42 → To: ${agent.name.padEnd(33)}│`);
  console.log('   │ Service: data-analysis                                              │');
  console.log('   │ Price: 0.50 USDC                                                    │');
  console.log('   │ Has Proof: ✅                                                        │');
  console.log('   └─────────────────────────────────────────────────────────────────────┘\n');

  console.log('   ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('   │ VALIDATION REGISTRY (On-Chain)                                      │');
  console.log('   ├─────────────────────────────────────────────────────────────────────┤');
  console.log(`   │ Attestation Hash: ${result.attestationHash.slice(0, 30)}...          │`);
  console.log('   │ Model: 0xa1b2c3d4...                                                │');
  console.log('   │ Decision: APPROVE (1)                                               │');
  console.log('   │ Confidence: 0.87                                                    │');
  console.log('   └─────────────────────────────────────────────────────────────────────┘\n');

  console.log('   ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('   │ REPUTATION UPDATE                                                   │');
  console.log('   ├─────────────────────────────────────────────────────────────────────┤');
  console.log(`   │ Agent: ${agent.name.padEnd(52)}│`);
  console.log('   │ Feedback: Score 90/100, Tag: "data-analysis"                        │');
  console.log(`   │ New Trust Score: ${agent.trustScore}% → ${Math.min(100, agent.trustScore + 1)}%                                          │`);
  console.log('   └─────────────────────────────────────────────────────────────────────┘');
}

// ============================================================================
// Summary
// ============================================================================

async function printSummary() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                              WHAT JUST HAPPENED                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  TRUSTLESS AGENT-TO-AGENT COMMERCE COMPLETED:                                ║
║                                                                               ║
║  ┌─────────────────────────────────────────────────────────────────────────┐ ║
║  │                                                                          │ ║
║  │  Agent A                        Agent B (DataAnalyst)                   │ ║
║  │     │                                  │                                │ ║
║  │     │ 1. Discover via Kinic            │                                │ ║
║  │     │─────────────────────────────────>│                                │ ║
║  │     │                                  │                                │ ║
║  │     │ 2. Verify trust (ERC-8004)       │                                │ ║
║  │     │─────────────────────────────────>│                                │ ║
║  │     │                                  │                                │ ║
║  │     │ 3. Request + x402 Payment        │                                │ ║
║  │     │─────────────────────────────────>│                                │ ║
║  │     │                                  │                                │ ║
║  │     │ 4. Result + zkML Proof           │                                │ ║
║  │     │<─────────────────────────────────│                                │ ║
║  │     │                                  │                                │ ║
║  │     │ 5. Record in Kinic + Feedback    │                                │ ║
║  │     │─────────────────────────────────>│                                │ ║
║  │                                                                          │ ║
║  └─────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  COMPONENTS USED:                                                            ║
║                                                                               ║
║    x402             → HTTP-native micropayment                               ║
║    ERC-8004         → On-chain identity, reputation, validation              ║
║    Kinic            → Semantic search + interaction memory                   ║
║    zkML (Jolt)      → Cryptographic proof of correct execution               ║
║                                                                               ║
║  TRUST GUARANTEES:                                                           ║
║                                                                               ║
║    ✅ Agent identity verified on-chain                                       ║
║    ✅ Reputation score is unforgeable                                        ║
║    ✅ Payment is atomic with service                                         ║
║    ✅ Execution is cryptographically proven                                  ║
║    ✅ History is searchable and permanent                                    ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

📚 Integration Guide:

   // 1. Create marketplace instance
   const marketplace = createMarketplace(signer, {
     erc8004: { identityRegistry, reputationRegistry, validationRegistry },
     x402: { network: 'base-sepolia' },
   });

   // 2. Discover agents
   const providers = await marketplace.discoverAgents({
     query: 'data analysis with ML',
     minTrustScore: 70,
   });

   // 3. Execute with payment
   const result = await marketplace.executeService(providers[0].agentId, {
     serviceType: 'data-analysis',
     payload: { data: [...] },
   }, { requireProof: true });

   // Result includes: { result, proof, attestationHash }

🔗 Resources:
   • ERC-8004 Spec: https://eips.ethereum.org/EIPS/eip-8004
   • x402 Protocol: https://github.com/coinbase/x402
   • Full Code: https://github.com/hshadab/coinbase

`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  await printHeader();

  // Run the full flow
  const myAgentId = await step1_registerAgent();
  await step2_registerService(myAgentId);
  const selectedAgent = await step3_discoverAgents();
  await step4_verifyTrust(selectedAgent);
  const result = await step5_executeWithPayment(selectedAgent);
  await step6_recordInteraction(selectedAgent, result);

  await printSummary();
}

main().catch(console.error);
