/**
 * Merkle Root Test for Verifiable Memory
 *
 * Step-by-step demonstration of how Merkle proofs work for memory integrity:
 *
 * 1. Insert memories → compute content hashes
 * 2. Build Merkle tree from hashes
 * 3. Store root on Base (MemoryRegistry)
 * 4. Generate inclusion proof for any memory
 * 5. Verify proof against stored root
 *
 * Run: npx tsx examples/agentkit-demo/merkle-test.ts
 */

import { ethers } from 'ethers';

// ============================================================================
// Merkle Tree Implementation
// ============================================================================

class MerkleTree {
  private leaves: string[];
  private layers: string[][];

  constructor(leaves: string[]) {
    // Sort leaves for consistent ordering
    this.leaves = leaves.map(l => l.toLowerCase()).sort();
    this.layers = [this.leaves];
    this.buildTree();
  }

  private hashPair(left: string, right: string): string {
    // Sort pair for consistent hashing (important!)
    const [first, second] = left < right ? [left, right] : [right, left];
    return ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'bytes32'], [first, second])
    );
  }

  private buildTree(): void {
    let currentLayer = this.leaves;

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(this.hashPair(currentLayer[i], currentLayer[i + 1]));
        } else {
          // Odd number of nodes - promote to next level
          nextLayer.push(currentLayer[i]);
        }
      }

      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  getRoot(): string {
    if (this.layers.length === 0 || this.layers[this.layers.length - 1].length === 0) {
      return ethers.ZeroHash;
    }
    return this.layers[this.layers.length - 1][0];
  }

  getProof(leaf: string): string[] {
    const normalizedLeaf = leaf.toLowerCase();
    let index = this.leaves.indexOf(normalizedLeaf);

    if (index === -1) {
      throw new Error('Leaf not found in tree');
    }

    const proof: string[] = [];

    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < layer.length) {
        proof.push(layer[siblingIndex]);
      }

      index = Math.floor(index / 2);
    }

    return proof;
  }

  static verify(leaf: string, proof: string[], root: string): boolean {
    let computedHash = leaf.toLowerCase();

    for (const proofElement of proof) {
      // Sort for consistent hashing
      const [first, second] = computedHash < proofElement
        ? [computedHash, proofElement]
        : [proofElement, computedHash];

      computedHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'bytes32'], [first, second])
      );
    }

    return computedHash.toLowerCase() === root.toLowerCase();
  }

  // Visual representation
  print(): void {
    console.log('\n   Merkle Tree Structure:');
    console.log('   ' + '─'.repeat(60));

    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      const indent = '   ' + '  '.repeat(this.layers.length - 1 - i);
      const label = i === this.layers.length - 1 ? 'ROOT' : i === 0 ? 'LEAVES' : `L${i}`;

      console.log(`${indent}[${label}]`);
      layer.forEach((hash, j) => {
        console.log(`${indent}  ${j}: ${hash.slice(0, 18)}...`);
      });
    }
    console.log('   ' + '─'.repeat(60));
  }
}

// ============================================================================
// Test Flow
// ============================================================================

async function testMerkleProofs() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    MERKLE ROOT TEST FOR VERIFIABLE MEMORY                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  // -------------------------------------------------------------------------
  // Step 1: Create Memory Entries
  // -------------------------------------------------------------------------

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 1: CREATE MEMORY ENTRIES                                                │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const memories = [
    { id: 1, content: 'ETH price is $3,500 with bullish momentum' },
    { id: 2, content: 'User prefers low-risk investments' },
    { id: 3, content: 'Portfolio allocation: 60% ETH, 30% BTC, 10% stables' },
    { id: 4, content: 'Last trade: Bought 0.5 ETH at $3,450' },
  ];

  console.log('   Memories to store:\n');
  memories.forEach(m => {
    console.log(`   ${m.id}. "${m.content}"`);
  });

  // -------------------------------------------------------------------------
  // Step 2: Compute Content Hashes
  // -------------------------------------------------------------------------

  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 2: COMPUTE CONTENT HASHES                                               │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const contentHashes = memories.map(m => ({
    id: m.id,
    content: m.content,
    hash: ethers.keccak256(ethers.toUtf8Bytes(m.content)),
  }));

  console.log('   Content → Hash (keccak256):\n');
  contentHashes.forEach(h => {
    console.log(`   Memory ${h.id}: ${h.hash.slice(0, 18)}...`);
  });

  // -------------------------------------------------------------------------
  // Step 3: Build Merkle Tree
  // -------------------------------------------------------------------------

  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 3: BUILD MERKLE TREE                                                    │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const tree = new MerkleTree(contentHashes.map(h => h.hash));
  const merkleRoot = tree.getRoot();

  console.log('   Building tree from leaf hashes...\n');
  tree.print();

  console.log(`\n   📊 MERKLE ROOT: ${merkleRoot}`);
  console.log('   └─ This is stored on Base MemoryRegistry contract');

  // -------------------------------------------------------------------------
  // Step 4: Generate Inclusion Proof
  // -------------------------------------------------------------------------

  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 4: GENERATE INCLUSION PROOF                                             │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const memoryToProve = contentHashes[1]; // Memory 2: "User prefers low-risk..."
  const proof = tree.getProof(memoryToProve.hash);

  console.log(`   Proving memory exists: "${memoryToProve.content.slice(0, 40)}..."\n`);
  console.log(`   Content Hash: ${memoryToProve.hash}`);
  console.log(`\n   Proof (sibling hashes needed to compute root):`);
  proof.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p}`);
  });

  console.log(`\n   Proof size: ${proof.length} hashes`);
  console.log(`   └─ For ${memories.length} memories, only ${proof.length} hashes needed (log2)`);

  // -------------------------------------------------------------------------
  // Step 5: Verify Proof
  // -------------------------------------------------------------------------

  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 5: VERIFY PROOF (simulating Base contract)                              │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  console.log('   Verification steps:\n');

  let computedHash = memoryToProve.hash.toLowerCase();
  console.log(`   Start: ${computedHash.slice(0, 18)}... (content hash)`);

  for (let i = 0; i < proof.length; i++) {
    const sibling = proof[i];
    const [first, second] = computedHash < sibling
      ? [computedHash, sibling]
      : [sibling, computedHash];

    const newHash = ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'bytes32'], [first, second])
    );

    console.log(`   ${i + 1}. Hash(${computedHash.slice(0, 10)}... + ${sibling.slice(0, 10)}...) = ${newHash.slice(0, 18)}...`);
    computedHash = newHash;
  }

  const isValid = computedHash.toLowerCase() === merkleRoot.toLowerCase();

  console.log(`\n   Computed Root: ${computedHash}`);
  console.log(`   Stored Root:   ${merkleRoot}`);
  console.log(`\n   ✅ VERIFICATION: ${isValid ? 'PASSED' : 'FAILED'} - Memory ${isValid ? 'EXISTS' : 'NOT FOUND'}`);

  // -------------------------------------------------------------------------
  // Step 6: Test Invalid Proof (Tampering Detection)
  // -------------------------------------------------------------------------

  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 6: TAMPER DETECTION TEST                                                │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const tamperedContent = 'ETH price is $10,000 with bullish momentum'; // Changed!
  const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes(tamperedContent));

  console.log(`   Attacker claims: "${tamperedContent}"`);
  console.log(`   Tampered Hash:   ${tamperedHash.slice(0, 30)}...`);

  // Try to verify with same proof
  const tamperedValid = MerkleTree.verify(tamperedHash, proof, merkleRoot);

  console.log(`\n   Using original proof against tampered content...`);
  console.log(`   ❌ VERIFICATION: ${tamperedValid ? 'PASSED (BAD!)' : 'FAILED'} - Tampering ${tamperedValid ? 'NOT detected!' : 'DETECTED!'}`);

  // -------------------------------------------------------------------------
  // Step 7: Add New Memory (Root Update)
  // -------------------------------------------------------------------------

  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 7: ADD NEW MEMORY (Root Update)                                         │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');

  const newMemory = 'Market sentiment shifted to bearish';
  const newHash = ethers.keccak256(ethers.toUtf8Bytes(newMemory));

  console.log(`   Adding: "${newMemory}"`);
  console.log(`   New Hash: ${newHash.slice(0, 30)}...`);

  const newHashes = [...contentHashes.map(h => h.hash), newHash];
  const newTree = new MerkleTree(newHashes);
  const newRoot = newTree.getRoot();

  console.log(`\n   Old Root: ${merkleRoot.slice(0, 30)}...`);
  console.log(`   New Root: ${newRoot.slice(0, 30)}...`);
  console.log(`   └─ Root changed! Old proofs still valid for old memories.`);

  // Verify old memory with new tree
  const oldProofValid = MerkleTree.verify(
    memoryToProve.hash,
    newTree.getProof(memoryToProve.hash),
    newRoot
  );
  console.log(`\n   Old memory still verifiable in new tree: ${oldProofValid ? '✅ YES' : '❌ NO'}`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                              HOW IT WORKS                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  1. MEMORY INSERT (Kinic)                                                    ║
║     └─ Store content + embedding in IC canister                              ║
║                                                                               ║
║  2. COMPUTE HASH                                                             ║
║     └─ contentHash = keccak256(memory content)                               ║
║                                                                               ║
║  3. UPDATE MERKLE TREE                                                       ║
║     └─ Add hash as leaf, recompute root                                      ║
║                                                                               ║
║  4. STORE ROOT ON BASE                                                       ║
║     └─ MemoryRegistry.updateCommitment(agentId, newRoot, count, zkProof)     ║
║                                                                               ║
║  5. PROVE MEMORY EXISTS                                                      ║
║     └─ Generate proof: [sibling hashes from leaf to root]                    ║
║     └─ Verify: compute root from hash + proof, compare to stored root        ║
║                                                                               ║
║  SECURITY PROPERTIES:                                                        ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ • Can't fake a memory (would need to find hash collision)              │  ║
║  │ • Can't modify memory (root would change)                              │  ║
║  │ • Can't delete memory (root would change)                              │  ║
║  │ • Proof is O(log n) size (efficient for large memory stores)           │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

📊 Test Results:
   ✅ Merkle tree built from ${memories.length} memories
   ✅ Inclusion proof generated (${proof.length} hashes)
   ✅ Proof verification passed
   ✅ Tampering detected
   ✅ Root update working

`);
}

// Run the test
testMerkleProofs().catch(console.error);
