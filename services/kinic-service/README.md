# Kinic Memory Service

HTTP API wrapper for [Kinic zkTAM](https://kinic.io) (Trustless Agentic Memory) on the Internet Computer.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KINIC + BASE HYBRID                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   AgentMemory SDK          Kinic Service                    │
│   (TypeScript)      ───▶   (Python:3002)                    │
│                                  │                          │
│                                  ▼                          │
│                            ┌──────────┐                     │
│                            │ kinic-py │                     │
│                            └────┬─────┘                     │
│                                 │                           │
│            ┌────────────────────┴────────────────────┐      │
│            ▼                                         ▼      │
│   ┌─────────────────┐                     ┌──────────────┐  │
│   │  Base Sepolia   │                     │ IC Canisters │  │
│   │  (Commitments)  │ ◀─── Merkle Root ───│ (zkTAM Data) │  │
│   └─────────────────┘                     └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Mock Mode (No Setup)

Just run without installing kinic-py:

```bash
pip install fastapi uvicorn pydantic python-dotenv
python main.py
```

Service runs with in-memory mock storage. Good for development.

### Option 2: Local IC Replica (Free Testing)

```bash
# Interactive setup
chmod +x setup-icp.sh
./setup-icp.sh --local

# Install dependencies
pip install -r requirements.txt

# Start local replica (in another terminal)
dfx start --background

# Start service
python main.py
```

### Option 3: IC Mainnet (Production)

**Requires KINIC tokens** from https://kinic.io

```bash
# Setup for mainnet
./setup-icp.sh --mainnet

# Install dependencies
pip install -r requirements.txt

# Start service
python main.py
```

## KINIC Token Requirements

| Feature | Tokens Needed |
|---------|---------------|
| Create memory canister | ~1 KINIC |
| Insert memory (with zkML) | ~0.01 KINIC |
| Search memories | ~0.001 KINIC |

**Kinic handles ICP cycles for you** - you just pay in KINIC tokens.

Get tokens: https://kinic.io

## API Endpoints

### Health Check
```
GET /health
```

### Create Memory Store
```
POST /memories
{
  "name": "agent-knowledge",
  "description": "Trading strategies",
  "identity": "jolt-atlas",
  "use_ic": true
}
```

### Insert Memory
```
POST /memories/{memory_id}/insert
{
  "tag": "strategy",
  "content": "Buy low, sell high..."
}
```

Returns zkML embedding proof.

### Search Memories
```
POST /memories/{memory_id}/search
{
  "query": "trading strategy",
  "limit": 5
}
```

Semantic similarity search with zkML-verified embeddings.

### Get Commitment
```
GET /memories/{memory_id}/commitment
```

Returns Merkle root for on-chain anchoring.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3002 | Service port |
| `KINIC_IDENTITY` | default | dfx identity name |
| `KINIC_USE_IC` | true | Use IC mainnet (false = local replica) |

## Integration with Base

The TypeScript SDK (`AgentMemory`) coordinates:

1. **Insert flow:**
   - Content → Kinic service → zkTAM canister
   - Get Merkle root → Post attestation to Base MemoryRegistry

2. **Verification flow:**
   - Query Kinic for Merkle proof
   - Verify against Base MemoryRegistry commitment

This provides **trustless agent memory**:
- Data stored on Internet Computer (decentralized)
- Commitments anchored on Base (verifiable)
- zkML proofs for embedding correctness

## Docker

```bash
docker build -t kinic-service .
docker run -p 3002:3002 -e KINIC_USE_IC=false kinic-service
```

## License

MIT
