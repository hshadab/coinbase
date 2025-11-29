#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectName = process.argv[2] || 'my-trustless-agent';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║           CREATE TRUSTLESS AGENT                             ║
║                                                              ║
║  Verifiable Compute + Verifiable Memory for AI Agents        ║
╚══════════════════════════════════════════════════════════════╝
`);

console.log(`Creating ${projectName}...`);

const targetDir = path.join(process.cwd(), projectName);

if (fs.existsSync(targetDir)) {
  console.error(`Error: Directory ${projectName} already exists.`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });

// package.json
const packageJson = {
  name: projectName,
  version: '0.1.0',
  description: 'A trustless AI agent with verifiable compute and memory',
  main: 'dist/index.js',
  scripts: {
    dev: 'tsx src/index.ts',
    build: 'tsc',
    start: 'node dist/index.js',
  },
  dependencies: {
    '@trustless-agentkit/sdk': '^0.1.0',
    ethers: '^6.15.0',
  },
  devDependencies: {
    '@types/node': '^20.10.0',
    tsx: '^4.7.0',
    typescript: '^5.3.0',
  },
};

fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

// tsconfig.json
const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    outDir: './dist',
    rootDir: './src',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
  },
  include: ['src/**/*'],
};

fs.writeFileSync(
  path.join(targetDir, 'tsconfig.json'),
  JSON.stringify(tsconfig, null, 2)
);

// src/index.ts
const indexTs = `/**
 * Trustless Agent - Verifiable Compute + Verifiable Memory
 *
 * This agent uses zkML proofs to verify its decisions and
 * stores interactions in tamper-proof on-chain memory.
 */

import {
  withZkGuardrail,
  AgentMemory,
  StorageType,
  type GuardrailResult,
} from '@trustless-agentkit/sdk';

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  // Use in-memory storage for development (switch to Kinic for production)
  memoryType: StorageType.InMemory,

  // Proof mode: 'always' | 'on-demand' | 'never'
  proofMode: 'always' as const,
};

// =============================================================================
// VERIFIABLE MEMORY
// =============================================================================

const memory = new AgentMemory({
  stores: [{ type: config.memoryType }],
});

// =============================================================================
// YOUR AGENT LOGIC
// =============================================================================

// Example: A simple action your agent can take
async function transferAction(params: { to: string; amount: number; asset: string }) {
  console.log(\`Executing transfer: \${params.amount} \${params.asset} to \${params.to}\`);

  // Your actual transfer logic here
  return {
    success: true,
    txHash: '0x' + Math.random().toString(16).slice(2),
    ...params,
  };
}

// Wrap with zkML verification
const verifiableTransfer = withZkGuardrail(transferAction, {
  proofMode: config.proofMode,
});

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log(\`
╔══════════════════════════════════════════════════════════════╗
║           TRUSTLESS AGENT RUNNING                            ║
║                                                              ║
║  Every action is cryptographically verified                  ║
║  Every decision is stored in tamper-proof memory             ║
╚══════════════════════════════════════════════════════════════╝
\`);

  // Initialize memory
  await memory.initialize();
  console.log('✓ Verifiable memory initialized');

  // Example: Execute a verifiable action
  console.log('\\n--- Executing Verifiable Transfer ---\\n');

  const result = await verifiableTransfer({
    to: '0x742d35Cc6634C0532925a3b844Bc9e7595f3C123',
    amount: 100,
    asset: 'USDC',
  });

  console.log('Result:', result.result);
  console.log('Decision:', result.guardrail.decision);
  console.log('Confidence:', result.guardrail.confidence);
  console.log('Proof:', result.guardrail.proof ? result.guardrail.proof.slice(0, 20) + '...' : 'N/A');

  // Store in verifiable memory
  console.log('\\n--- Storing in Verifiable Memory ---\\n');

  const memoryEntry = await memory.insert({
    content: JSON.stringify({
      action: 'transfer',
      ...result.result,
      decision: result.guardrail.decision,
      timestamp: Date.now(),
    }),
    metadata: {
      type: 'transaction',
      decision: result.guardrail.decision,
    },
  });

  console.log('Memory ID:', memoryEntry.id);
  console.log('Content Hash:', memoryEntry.contentHash);

  // Search memory
  console.log('\\n--- Searching Memory ---\\n');

  const searchResults = await memory.search({
    query: 'transfer USDC',
    limit: 5,
  });

  console.log(\`Found \${searchResults.results.length} results:\`);
  searchResults.results.forEach((r, i) => {
    console.log(\`  \${i + 1}. \${r.content.slice(0, 50)}... (score: \${r.score.toFixed(2)})\`);
  });

  console.log(\`
╔══════════════════════════════════════════════════════════════╗
║                       COMPLETE                               ║
║                                                              ║
║  Your agent executed with cryptographic verification!        ║
║                                                              ║
║  Next steps:                                                 ║
║  • Add more actions with withZkGuardrail()                   ║
║  • Switch to StorageType.Kinic for on-chain memory           ║
║  • Deploy to production with real zkML proofs                ║
╚══════════════════════════════════════════════════════════════╝
\`);
}

main().catch(console.error);
`;

fs.writeFileSync(path.join(targetDir, 'src', 'index.ts'), indexTs);

// .gitignore
const gitignore = `node_modules/
dist/
.env
*.log
`;

fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignore);

// README.md
const readme = `# ${projectName}

A trustless AI agent with verifiable compute and memory.

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

## What's Included

- **Verifiable Actions**: All agent actions wrapped with zkML proofs
- **Verifiable Memory**: Tamper-proof storage for agent interactions
- **TypeScript**: Full type safety

## Learn More

- [Trustless AgentKit Documentation](https://github.com/hshadab/coinbase)
- [AgentKit Docs](https://docs.cdp.coinbase.com/agent-kit/welcome)
- [Jolt Atlas (zkML)](https://github.com/ICME-Lab/jolt-atlas)
- [Kinic CLI](https://github.com/ICME-Lab/kinic-cli)
`;

fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

console.log(`
✓ Created ${projectName}/
  ├── package.json
  ├── tsconfig.json
  ├── src/
  │   └── index.ts
  ├── .gitignore
  └── README.md

Next steps:

  cd ${projectName}
  npm install
  npm run dev

Happy building! 🚀
`);
