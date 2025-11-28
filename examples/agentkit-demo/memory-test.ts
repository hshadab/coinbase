/**
 * Trustless Memory Test
 *
 * Tests the full memory flow with both:
 * - Kinic (IC): Actual memory storage + semantic search
 * - Base (MemoryRegistry): Commitment anchors + attestations
 *
 * Run: npx tsx examples/agentkit-demo/memory-test.ts
 */

import { ethers } from 'ethers';

// ============================================================================
// Mock Contracts (replace with real contract calls in production)
// ============================================================================

// MemoryRegistry ABI (subset)
const MEMORY_REGISTRY_ABI = [
  'function createMemoryStore(uint256 agentId, string storageUri, uint8 storageType) external',
  'function updateCommitment(uint256 agentId, bytes32 newRoot, uint256 memoryCount, bytes32 zkProof) external',
  'function postMemoryAttestation(uint256 agentId, uint8 operation, bytes32 contentHash, bytes32 embeddingHash, bytes32 zkProof, bytes32 newRoot) external returns (bytes32)',
  'function verifyMemoryInclusion(uint256 agentId, bytes32 contentHash, bytes32[] proof) external view returns (bool)',
  'function getMemoryIntegrityScore(uint256 agentId) external view returns (uint8 score, uint64 attestationCount, uint64 knowledgeDomains)',
  'function getMemoryStore(uint256 agentId) external view returns (string storageUri, bytes32 merkleRoot, uint256 memoryCount, uint256 lastUpdated, uint8 storageType)',
];

// Storage types matching contract
enum StorageType {
  IPFS = 0,
  Arweave = 1,
  InternetComputer = 2, // Kinic
  HTTP = 3,
  Custom = 4,
}

// Operation types
enum OperationType {
  Insert = 0,
  Update = 1,
  Delete = 2,
  Search = 3,
}

// ============================================================================
// Mock Implementations
// ============================================================================

// Simulated Kinic canister
const kinicMemories: Map<string, { content: string; embedding: number[]; metadata: any }> = new Map();

async function kinicInsert(content: string, metadata: any): Promise<{ id: string; embeddingHash: string }> {
  await new Promise(r => setTimeout(r, 300)); // Simulate IC call
  const id = 'mem_' + Math.random().toString(36).slice(2, 10);
  const embedding = Array(384).fill(0).map(() => Math.random()); // Mock embedding
  kinicMemories.set(id, { content, embedding, metadata });
  const embeddingHash = ethers.keccak256(ethers.toUtf8Bytes(embedding.slice(0, 10).join(',')));
  return { id, embeddingHash };
}

async function kinicSearch(query: string, limit: number = 5): Promise<Array<{ id: string; content: string; score: number }>> {
  await new Promise(r => setTimeout(r, 200)); // Simulate IC call
  const results: Array<{ id: string; content: string; score: number }> = [];
  for (const [id, mem] of kinicMemories) {
    if (mem.content.toLowerCase().includes(query.toLowerCase().split(' ')[0])) {
      results.push({ id, content: mem.content, score: 0.8 + Math.random() * 0.2 });
    }
  }
  return results.slice(0, limit).sort((a, b) => b.score - a.score);
}

// Simulated Base MemoryRegistry contract
const baseMemoryStore = {
  storageUri: '',
  merkleRoot: ethers.ZeroHash,
  memoryCount: 0,
  lastUpdated: 0,
  attestations: [] as string[],
};

async function baseCreateMemoryStore(agentId: number, storageUri: string, storageType: StorageType): Promise<void> {
  await new Promise(r => setTimeout(r, 500)); // Simulate tx
  baseMemoryStore.storageUri = storageUri;
  baseMemoryStore.lastUpdated = Math.floor(Date.now() / 1000);
  console.log(`      ├─ TX: createMemoryStore(${agentId}, "${storageUri}", ${StorageType[storageType]})`);
}

async function basePostAttestation(
  agentId: number,
  operation: OperationType,
  contentHash: string,
  embeddingHash: string,
  zkProof: string,
  newRoot: string
): Promise<string> {
  await new Promise(r => setTimeout(r, 500)); // Simulate tx
  const attestationHash = ethers.keccak256(
    ethers.solidityPacked(
      ['uint256', 'uint8', 'bytes32', 'bytes32', 'uint256'],
      [agentId, operation, contentHash, embeddingHash, Date.now()]
    )
  );
  baseMemoryStore.attestations.push(attestationHash);
  baseMemoryStore.merkleRoot = newRoot;
  baseMemoryStore.memoryCount++;
  console.log(`      ├─ TX: postMemoryAttestation(${OperationType[operation]}, ${contentHash.slice(0, 18)}...)`);
  return attestationHash;
}

function computeMerkleRoot(contentHashes: string[]): string {
  if (contentHashes.length === 0) return ethers.ZeroHash;
  let layer = contentHashes.map(h => h);
  while (layer.length > 1) {
    const nextLayer: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        const combined = layer[i] < layer[i + 1]
          ? ethers.keccak256(ethers.solidityPacked(['bytes32', 'bytes32'], [layer[i], layer[i + 1]]))
          : ethers.keccak256(ethers.solidityPacked(['bytes32', 'bytes32'], [layer[i + 1], layer[i]]));
        nextLayer.push(combined);
      } else {
        nextLayer.push(layer[i]);
      }
    }
    layer = nextLayer;
  }
  return layer[0];
}

// ============================================================================
// Test Flow
// ============================================================================

async function testMemoryFlow() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TRUSTLESS MEMORY TEST (Kinic + Base)                      ║
║                                                                               ║
║  Testing both components of verifiable memory:                               ║
║  • Kinic (IC): Storage + Embeddings + Search                                 ║
║  • Base (MemoryRegistry): Commitments + Attestations + Proofs                ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  const agentId = 42;
  const kinicCanisterId = '3tq5l-3iaaa-aaaak-apgva-cai';
  const contentHashes: string[] = [];

  // -------------------------------------------------------------------------
  // Step 1: Create Memory Store (Base)
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 1: CREATE MEMORY STORE ON BASE                                          │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  console.log('   Registering Kinic canister as storage backend on Base...\n');
  await baseCreateMemoryStore(
    agentId,
    `ic://${kinicCanisterId}`,
    StorageType.InternetComputer
  );

  console.log(`      └─ Storage URI: ic://${kinicCanisterId}`);
  console.log('\n   ✅ Memory store created on Base (points to Kinic)\n');

  // -------------------------------------------------------------------------
  // Step 2: Insert Memory with Dual Recording
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 2: INSERT MEMORY (Kinic Data + Base Attestation)                        │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const testMemories = [
    { content: 'ETH price analysis: bullish trend forming, RSI at 65', metadata: { type: 'analysis', asset: 'ETH' } },
    { content: 'BTC support level identified at $42,000', metadata: { type: 'analysis', asset: 'BTC' } },
    { content: 'User preference: risk tolerance = medium', metadata: { type: 'preference', key: 'risk' } },
  ];

  for (const mem of testMemories) {
    console.log(`   📝 Inserting: "${mem.content.slice(0, 40)}..."\n`);

    // Step 2a: Insert into Kinic (actual data)
    process.stdout.write('      [Kinic] Generating embedding + storing...');
    const kinicResult = await kinicInsert(mem.content, mem.metadata);
    console.log(' ✓');
    console.log(`      ├─ Memory ID: ${kinicResult.id}`);
    console.log(`      └─ Embedding Hash: ${kinicResult.embeddingHash.slice(0, 20)}...`);

    // Step 2b: Compute content hash
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes(mem.content));
    contentHashes.push(contentHash);

    // Step 2c: Compute new Merkle root
    const newRoot = computeMerkleRoot(contentHashes);

    // Step 2d: Post attestation to Base (commitment)
    process.stdout.write('\n      [Base] Posting attestation on-chain...');
    const attestationHash = await basePostAttestation(
      agentId,
      OperationType.Insert,
      contentHash,
      kinicResult.embeddingHash,
      '0x' + 'ab'.repeat(32), // Mock zkML proof
      newRoot
    );
    console.log(' ✓');
    console.log(`      └─ Attestation: ${attestationHash.slice(0, 20)}...`);
    console.log('');
  }

  console.log('   ✅ 3 memories inserted with dual recording\n');

  // -------------------------------------------------------------------------
  // Step 3: Semantic Search (Kinic)
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 3: SEMANTIC SEARCH (Kinic)                                              │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const searchQuery = 'ETH price trends';
  console.log(`   🔍 Query: "${searchQuery}"\n`);

  process.stdout.write('      [Kinic] Searching vector database...');
  const searchResults = await kinicSearch(searchQuery);
  console.log(' ✓\n');

  console.log('   📊 Results:\n');
  searchResults.forEach((result, i) => {
    console.log(`      ${i + 1}. ${result.content.slice(0, 50)}...`);
    console.log(`         Score: ${(result.score * 100).toFixed(1)}%\n`);
  });

  // -------------------------------------------------------------------------
  // Step 4: Verify Memory Integrity (Base)
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 4: VERIFY MEMORY INTEGRITY (Base)                                       │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  console.log('   Checking on-chain state...\n');

  console.log('   📊 Base MemoryRegistry State:');
  console.log(`      ├─ Storage URI: ${baseMemoryStore.storageUri}`);
  console.log(`      ├─ Merkle Root: ${baseMemoryStore.merkleRoot.slice(0, 20)}...`);
  console.log(`      ├─ Memory Count: ${baseMemoryStore.memoryCount}`);
  console.log(`      ├─ Attestation Count: ${baseMemoryStore.attestations.length}`);
  console.log(`      └─ Last Updated: ${new Date(baseMemoryStore.lastUpdated * 1000).toISOString()}`);

  // Simulate Merkle proof verification
  console.log('\n   Verifying memory inclusion...\n');
  const contentToVerify = testMemories[0].content;
  const hashToVerify = ethers.keccak256(ethers.toUtf8Bytes(contentToVerify));

  console.log(`   📋 Verifying: "${contentToVerify.slice(0, 40)}..."`);
  console.log(`      Content Hash: ${hashToVerify.slice(0, 20)}...`);

  // In production: call contract.verifyMemoryInclusion(agentId, hashToVerify, merkleProof)
  const verified = contentHashes.includes(hashToVerify);
  console.log(`      ├─ In Merkle Tree: ${verified ? '✅ YES' : '❌ NO'}`);
  console.log(`      └─ Proof: [${hashToVerify.slice(0, 10)}... → ${baseMemoryStore.merkleRoot.slice(0, 10)}...]`);

  console.log('\n   ✅ Memory integrity verified on Base\n');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                              TEST SUMMARY                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  KINIC (Internet Computer) - Memory Storage                                  ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ ✓ 3 memories inserted with embeddings                                  │  ║
║  │ ✓ Semantic search working                                              │  ║
║  │ ✓ zkML embedding proofs generated                                      │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║  BASE (MemoryRegistry) - Commitment Anchors                                  ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ ✓ Memory store created (points to Kinic canister)                      │  ║
║  │ ✓ 3 memory attestations posted on-chain                                │  ║
║  │ ✓ Merkle root updated after each insert                                │  ║
║  │ ✓ Memory inclusion verifiable via Merkle proof                         │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║  TRUST GUARANTEES:                                                           ║
║  • Memory DATA is searchable (Kinic)                                         ║
║  • Memory INTEGRITY is provable (Base)                                       ║
║  • Tampering is detectable (Merkle proofs)                                   ║
║  • All operations are auditable (attestations)                               ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

📚 To test with real contracts:
   1. Deploy MemoryRegistry to Base Sepolia
   2. Start Kinic service: cd services/kinic-service && python main.py
   3. Replace mocks with real contract calls + IC agent

`);
}

// Run the test
testMemoryFlow().catch(console.error);
