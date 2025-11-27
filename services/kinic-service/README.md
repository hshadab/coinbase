# Kinic AI Memory Service

On-chain vector database for Coinbase AgentKit agents. Provides verifiable, tamper-proof memory storage with zkML embedding proofs.

## What is Kinic AI Memory?

Kinic provides an **on-chain vector database** that gives AI agents:
- **Verifiable memory** - All embeddings are cryptographically proven
- **Tamper-proof storage** - Immutable, decentralized storage
- **Semantic search** - Query agent knowledge with natural language
- **Trust anchoring** - Merkle roots anchored on Base for verification

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 KINIC AI MEMORY + BASE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   AgentKit SDK           Kinic Memory Service               │
│   (TypeScript)    ───▶   (Python:3002)                      │
│                                │                            │
│                                ▼                            │
│                        ┌──────────────┐                     │
│                        │ On-chain     │                     │
│                        │ Vector DB    │                     │
│                        └──────┬───────┘                     │
│                               │                             │
│         ┌─────────────────────┴─────────────────────┐       │
│         ▼                                           ▼       │
│   ┌───────────────┐                      ┌──────────────┐   │
│   │ Base Sepolia  │                      │ Kinic zkTAM  │   │
│   │ (Commitments) │ ◀── Merkle Root ──── │ (Embeddings) │   │
│   └───────────────┘                      └──────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Mock Mode (Development)

No tokens needed - uses in-memory storage:

```bash
pip install fastapi uvicorn pydantic python-dotenv
python main.py
```

### Option 2: Production Mode (Desktop Environment)

Requires KINIC tokens and a desktop environment with D-Bus/keyring:

```bash
# 1. Setup identity
./setup-icp.sh --mainnet

# 2. Fund your principal with KINIC tokens
#    Get tokens from: https://kinic.io

# 3. Install dependencies
pip install git+https://github.com/ICME-Lab/kinic-cli.git
pip install fastapi uvicorn pydantic python-dotenv

# 4. Start service (requires D-Bus for keyring)
KINIC_USE_IC=true python main.py
```

**Note:** The kinic-py SDK requires a desktop environment with D-Bus/keyring support for secure key storage. On headless servers, the service automatically falls back to mock mode.

## API Reference

### Health Check
```http
GET /health
```
Returns service status and whether on-chain storage is available.

### Create Memory Store
```http
POST /memories
Content-Type: application/json

{
  "name": "agent-knowledge",
  "description": "Trading strategies and market analysis"
}
```
Creates a new on-chain vector database for an agent.

### Insert Memory
```http
POST /memories/{memory_id}/insert
Content-Type: application/json

{
  "tag": "strategy",
  "content": "DeFi yield optimization: Focus on stable pools with >5% APY..."
}
```
Stores content with zkML-verified embeddings. Returns proof hash.

### Search Memories
```http
POST /memories/{memory_id}/search
Content-Type: application/json

{
  "query": "yield optimization strategy",
  "limit": 5
}
```
Semantic similarity search across agent knowledge.

### Get Commitment
```http
GET /memories/{memory_id}/commitment
```
Returns current Merkle root for on-chain verification.

## Integration with Base

The TypeScript SDK (`AgentMemory`) coordinates between Kinic and Base:

1. **Store**: Content → Kinic → zkML embedding → On-chain vector DB
2. **Anchor**: Merkle root → Base MemoryRegistry contract
3. **Verify**: Query Kinic proof → Verify against Base commitment

This enables **trustless agent memory**:
- Data stored in decentralized vector database
- Commitments anchored on Base (verifiable)
- zkML proofs guarantee embedding correctness

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3002 | Service port |
| `KINIC_IDENTITY` | jolt-atlas | Identity name for on-chain ops |
| `KINIC_USE_IC` | true | Enable on-chain storage |

## Token Requirements

| Operation | KINIC Cost |
|-----------|------------|
| Create memory store | ~1 KINIC |
| Insert memory | ~0.01 KINIC |
| Search | ~0.001 KINIC |

## Docker

```bash
docker build -t kinic-memory .
docker run -p 3002:3002 -e KINIC_USE_IC=true kinic-memory
```

## License

MIT - Built for Coinbase AgentKit
