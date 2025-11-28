/**
 * Trustless AgentKit Demo
 *
 * Demonstrates both pillars of trustless agent behavior:
 * - Verifiable Compute: zkML proofs via Jolt Atlas
 * - Verifiable Memory: On-chain storage via Kinic
 *
 * Run: npx tsx examples/agentkit-demo/index.ts
 */

// ============================================================================
// Mock Implementations (replace with real SDK imports in production)
// ============================================================================

// Mock policy decision
enum PolicyDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  REVIEW = 'review',
}

// Mock guardrail result
interface GuardrailResult {
  decision: PolicyDecision;
  confidence: number;
  proof: string | null;
  modelCommitment: string;
}

// Mock memory entry
interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, string>;
  embedding?: number[];
}

// Mock search result
interface SearchResult {
  results: Array<{ content: string; score: number }>;
}

// Simulated zkML guardrail check
async function mockGuardrailCheck(params: {
  amount: number;
  recipient: string;
}): Promise<GuardrailResult> {
  await new Promise(r => setTimeout(r, 800)); // Simulate proof generation

  const approved = params.amount < 10000;
  return {
    decision: approved ? PolicyDecision.APPROVE : PolicyDecision.REJECT,
    confidence: approved ? 0.95 : 0.88,
    proof: approved ? '0x' + 'a'.repeat(64) : null,
    modelCommitment: '0x' + 'b'.repeat(64),
  };
}

// Simulated Kinic memory operations
const mockMemoryStore: MemoryEntry[] = [];

async function mockMemoryInsert(entry: Omit<MemoryEntry, 'id'>): Promise<string> {
  await new Promise(r => setTimeout(r, 400)); // Simulate embedding generation
  const id = 'mem_' + Math.random().toString(36).slice(2, 10);
  mockMemoryStore.push({ ...entry, id });
  return id;
}

async function mockMemorySearch(query: string): Promise<SearchResult> {
  await new Promise(r => setTimeout(r, 200)); // Simulate vector search
  const results = mockMemoryStore
    .filter(e => e.content.toLowerCase().includes(query.toLowerCase().split(' ')[0]))
    .map(e => ({ content: e.content, score: 0.85 + Math.random() * 0.1 }));
  return { results };
}

// ============================================================================
// Demo
// ============================================================================

async function demo() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                          TRUSTLESS AGENTKIT DEMO                             ║
║                                                                               ║
║  Verifiable Compute (zkML) + Verifiable Memory (Kinic)                       ║
║                                                                               ║
║  Every AI agent deserves a wallet.                                           ║
║  Every wallet deserves verifiable behavior.                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  // -------------------------------------------------------------------------
  // PILLAR 1: Verifiable Compute (zkML)
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ PILLAR 1: VERIFIABLE COMPUTE (zkML)                                          │');
  console.log('│ Cryptographic proof that agent ran its policy correctly                      │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  console.log('   Scenario: Agent wants to transfer $500 USDC\n');

  process.stdout.write('   ⏳ Running policy model + generating zkML proof...');
  const guardrailResult = await mockGuardrailCheck({
    amount: 500,
    recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f3C123',
  });
  console.log(' ✓\n');

  console.log('   📊 zkML Guardrail Result:');
  console.log(`      ├─ Decision: ${guardrailResult.decision.toUpperCase()}`);
  console.log(`      ├─ Confidence: ${(guardrailResult.confidence * 100).toFixed(1)}%`);
  console.log(`      ├─ Proof: ${guardrailResult.proof ? guardrailResult.proof.slice(0, 20) + '...' : 'None'}`);
  console.log(`      └─ Model: ${guardrailResult.modelCommitment.slice(0, 20)}...`);

  console.log('\n   ✅ VERIFIABLE: Anyone can verify this proof on-chain\n');

  // -------------------------------------------------------------------------
  // PILLAR 2: Verifiable Memory (Kinic)
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ PILLAR 2: VERIFIABLE MEMORY (Kinic)                                          │');
  console.log('│ On-chain vector database with zkML-proven embeddings                         │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  console.log('   Scenario: Store the transaction decision in verifiable memory\n');

  process.stdout.write('   ⏳ Generating embedding + storing in Kinic...');
  const memoryId = await mockMemoryInsert({
    content: JSON.stringify({
      action: 'transfer',
      amount: 500,
      asset: 'USDC',
      decision: guardrailResult.decision,
      proof: guardrailResult.proof,
      timestamp: Date.now(),
    }),
    metadata: {
      type: 'transaction',
      decision: guardrailResult.decision,
      hasProof: 'true',
    },
  });
  console.log(' ✓\n');

  console.log('   📊 Kinic Memory Entry:');
  console.log(`      ├─ ID: ${memoryId}`);
  console.log('      ├─ Type: transaction');
  console.log('      ├─ Has zkML Proof: true');
  console.log('      └─ Storage: Internet Computer (on-chain)');

  // Store a few more entries for search demo
  await mockMemoryInsert({
    content: JSON.stringify({ action: 'transfer', amount: 1200, asset: 'USDC', decision: 'approve' }),
    metadata: { type: 'transaction', decision: 'approve' },
  });
  await mockMemoryInsert({
    content: JSON.stringify({ action: 'swap', amount: 0.5, asset: 'ETH', decision: 'approve' }),
    metadata: { type: 'transaction', decision: 'approve' },
  });
  await mockMemoryInsert({
    content: JSON.stringify({ action: 'transfer', amount: 50000, asset: 'USDC', decision: 'reject' }),
    metadata: { type: 'transaction', decision: 'reject' },
  });

  console.log('\n   ✅ VERIFIABLE: Memory entries have zkML embedding proofs\n');

  // -------------------------------------------------------------------------
  // PILLAR 1+2: Semantic Search with Verified Results
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ COMBINED: SEMANTIC SEARCH OVER VERIFIED HISTORY                              │');
  console.log('│ Query agent memory with natural language                                     │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const searchQuery = 'transfer transactions';
  console.log(`   Query: "${searchQuery}"\n`);

  process.stdout.write('   ⏳ Searching Kinic vector database...');
  const searchResults = await mockMemorySearch(searchQuery);
  console.log(' ✓\n');

  console.log(`   📊 Search Results (${searchResults.results.length} matches):\n`);

  searchResults.results.forEach((result, i) => {
    try {
      const data = JSON.parse(result.content);
      console.log(`      ${i + 1}. ${data.action} $${data.amount} ${data.asset}`);
      console.log(`         Decision: ${data.decision.toUpperCase()} | Relevance: ${(result.score * 100).toFixed(0)}%`);
    } catch {
      console.log(`      ${i + 1}. ${result.content.slice(0, 50)}...`);
    }
  });

  console.log('\n   ✅ VERIFIABLE: Search results come from verified embeddings\n');

  // -------------------------------------------------------------------------
  // PILLAR 1+2: Large Transaction (Rejected)
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SCENARIO: LARGE TRANSACTION (Policy Rejection)                               │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  console.log('   Agent wants to transfer $50,000 USDC\n');

  process.stdout.write('   ⏳ Running policy model...');
  const rejectResult = await mockGuardrailCheck({
    amount: 50000,
    recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f3C456',
  });
  console.log(' ✓\n');

  console.log('   📊 Result:');
  console.log(`      ├─ Decision: ${rejectResult.decision.toUpperCase()} ❌`);
  console.log(`      ├─ Confidence: ${(rejectResult.confidence * 100).toFixed(1)}%`);
  console.log('      └─ Reason: Exceeds policy limit');

  console.log('\n   Recording rejection in Kinic memory...');
  await mockMemoryInsert({
    content: JSON.stringify({
      action: 'transfer',
      amount: 50000,
      asset: 'USDC',
      decision: 'reject',
      reason: 'exceeds_limit',
      timestamp: Date.now(),
    }),
    metadata: { type: 'transaction', decision: 'reject' },
  });
  console.log('   ✓ Rejection recorded (auditable history)\n');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                              TRUSTLESS AGENTKIT                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  VERIFIABLE COMPUTE (zkML - Jolt Atlas)                                      ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ • Policy model runs in zkVM                                            │  ║
║  │ • SNARK proof generated (~2.4s)                                        │  ║
║  │ • Proof verifiable on-chain                                            │  ║
║  │ • No trust in operator required                                        │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║  VERIFIABLE MEMORY (Kinic - Internet Computer)                               ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ • Agent memory stored on-chain                                         │  ║
║  │ • Embeddings have zkML proofs                                          │  ║
║  │ • Semantic search across history                                       │  ║
║  │ • Auditable and tamper-proof                                           │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║  TOGETHER: TRUSTLESS AGENT BEHAVIOR                                          ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ • Every action has a cryptographic proof                               │  ║
║  │ • Every decision is recorded and searchable                            │  ║
║  │ • Agents can verify each other (A2A commerce)                          │  ║
║  │ • Users can audit their agent's behavior                               │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

📚 Next steps:
   • Run marketplace demo: pnpm --filter trustless-agentkit-demo marketplace
   • Full A2A commerce with x402 payments
   • See: https://github.com/hshadab/coinbase

`);
}

// Run the demo
demo().catch(console.error);
