# Kinic AI Memory Service

On-chain vector database for Coinbase AgentKit agents. Provides verifiable, tamper-proof memory storage with zkML embedding proofs.

## What is Kinic AI Memory?

Kinic provides an **on-chain vector database** on the Internet Computer that gives AI agents:
- **Verifiable memory** - All embeddings are cryptographically proven with zkML
- **Tamper-proof storage** - Immutable, decentralized storage
- **Semantic search** - Query agent knowledge with natural language
- **Trust anchoring** - Merkle roots can be anchored on Base for verification

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
│                        │ Internet     │                     │
│                        │ Computer     │                     │
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

No tokens needed - uses in-memory storage for development:

```bash
pip install fastapi uvicorn pydantic python-dotenv
python main.py
```

### Option 2: Windows WSL Setup (Verified Working)

**Tested and verified on Windows 11 with WSL2 Ubuntu.** Creates real on-chain memory canisters, inserts data with zkML proofs, and performs semantic search.

#### Prerequisites
- Windows 10/11 with WSL2 installed
- Ubuntu (from Microsoft Store)
- ~$5-10 of KINIC tokens from https://kinic.io

#### Step 1: Install Dependencies (in WSL terminal)

```bash
# Update and install required packages
sudo apt update && sudo apt install -y python3-pip python3-venv curl gnome-keyring dbus-x11 libsecret-tools xxd

# Install Rust (required for kinic-py compilation)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# Install dfx (Internet Computer SDK)
curl -fsSL https://internetcomputer.org/install.sh | sh
source ~/.bashrc
```

#### Step 2: Create dfx Identity

```bash
# Create identity with plaintext storage (no desktop keyring needed)
dfx identity new jolt-atlas --storage-mode=plaintext
dfx identity use jolt-atlas

# Get your principal address - send KINIC tokens here!
dfx identity get-principal
```

**Save the seed phrase!** It's shown when you create the identity.

#### Step 3: Create Python Virtual Environment and Install kinic-py

```bash
# Create and activate virtual environment
python3 -m venv ~/kinic-venv
source ~/kinic-venv/bin/activate

# Install kinic-py (takes ~15 minutes to compile from Rust)
pip install --upgrade pip
pip install git+https://github.com/ICME-Lab/kinic-cli.git
pip install fastapi uvicorn pydantic python-dotenv httpx
```

#### Step 4: Fund Your Principal

1. Go to https://kinic.io
2. Connect your wallet
3. Send KINIC tokens to your principal address (from Step 2)
4. ~2 KINIC is enough for testing

#### Step 5: Configure Keyring and Start Service

**Important:** kinic-py requires the identity in the system keyring. Run these commands in the terminal where you'll run the service:

```bash
# Start D-Bus and unlock keyring
eval $(dbus-launch --sh-syntax)
echo "" | gnome-keyring-daemon --unlock --components=secrets

# Store identity in keyring (hex-encoded PEM format)
cat ~/.config/dfx/identity/jolt-atlas/identity.pem | xxd -p | tr -d '\n' | \
  secret-tool store --label="ic:jolt-atlas" \
    service internet_computer_identities \
    username internet_computer_identity_jolt-atlas

# Verify it works
python3 -c "from kinic_py import KinicMemories; km = KinicMemories('jolt-atlas', ic=True); print(km.list())"
```

Should output `[]` (empty list) if successful.

#### Step 6: Start the Service

```bash
# Create .env file
cd ~/coinbase/services/kinic-service
echo "PORT=3002
KINIC_IDENTITY=jolt-atlas
KINIC_USE_IC=true" > .env

# Start the service (must be in same terminal with keyring active)
source ~/kinic-venv/bin/activate
python main.py
```

#### Step 7: Test the API

In another terminal:

```bash
# Health check
curl http://localhost:3002/health
# Should show: {"status":"healthy","kinic_available":true,"version":"0.1.0"}

# Create a memory canister (costs ~1 KINIC)
curl -X POST http://localhost:3002/memories \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent-memory", "description": "Test memory", "identity": "jolt-atlas", "use_ic": true}'

# Insert a memory (use the canister ID from above)
curl -X POST "http://localhost:3002/memories/YOUR_CANISTER_ID/insert" \
  -H "Content-Type: application/json" \
  -d '{"tag": "strategy", "content": "DeFi yield optimization: focus on stablecoin pools with APY over 5%"}'

# Search memories
curl -X POST "http://localhost:3002/memories/YOUR_CANISTER_ID/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "yield optimization", "limit": 5}'
```

### Option 3: Linux/Mac Setup

Same as WSL setup, but skip the WSL-specific parts. On Mac, the system keychain should work automatically.

```bash
# Install dependencies
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
curl -fsSL https://internetcomputer.org/install.sh | sh
source ~/.bashrc

# Create identity
dfx identity new jolt-atlas --storage-mode=plaintext
dfx identity use jolt-atlas
dfx identity get-principal  # Fund this with KINIC tokens

# Create venv and install
python3 -m venv ~/kinic-venv
source ~/kinic-venv/bin/activate
pip install git+https://github.com/ICME-Lab/kinic-cli.git
pip install fastapi uvicorn pydantic python-dotenv httpx

# Start service
cd services/kinic-service
python main.py
```

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
  "description": "Trading strategies and market analysis",
  "identity": "jolt-atlas",
  "use_ic": true
}
```
Creates a new on-chain vector database canister. Returns the canister ID.

### Insert Memory
```http
POST /memories/{canister_id}/insert
Content-Type: application/json

{
  "tag": "strategy",
  "content": "DeFi yield optimization: Focus on stable pools with >5% APY..."
}
```
Stores content with zkML-verified embeddings. Returns content hash, embedding hash, and zkML proof reference.

### Search Memories
```http
POST /memories/{canister_id}/search
Content-Type: application/json

{
  "query": "yield optimization strategy",
  "limit": 5
}
```
Semantic similarity search across agent knowledge. Returns matching content with similarity scores.

### Get Commitment
```http
GET /memories/{canister_id}/commitment
```
Returns current Merkle root for on-chain verification.

### List Memories
```http
GET /memories
```
Lists all memory canisters for the current identity.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3002 | Service port |
| `KINIC_IDENTITY` | jolt-atlas | dfx identity name for on-chain ops |
| `KINIC_USE_IC` | true | Enable on-chain storage (false = mock mode) |

## Token Requirements

| Operation | KINIC Cost |
|-----------|------------|
| Create memory canister | ~1 KINIC |
| Insert memory | ~0.01 KINIC |
| Search | ~0.001 KINIC |

Get KINIC tokens from: https://kinic.io

## Verified Working Setup

This setup has been tested and verified working on:
- **Windows 11 + WSL2 Ubuntu 24.04**
- **Canister ID:** `3tq5l-3iaaa-aaaak-apgva-cai`
- **Operations verified:** Create canister, insert memory with zkML proof, semantic search

## Troubleshooting

### "Keychain Error: NoEntry"
The identity isn't in the keyring. Re-run the keyring setup commands:
```bash
eval $(dbus-launch --sh-syntax)
echo "" | gnome-keyring-daemon --unlock --components=secrets
cat ~/.config/dfx/identity/jolt-atlas/identity.pem | xxd -p | tr -d '\n' | \
  secret-tool store --label="ic:jolt-atlas" service internet_computer_identities username internet_computer_identity_jolt-atlas
```

### "Cannot get secret of a locked object"
The keyring is locked. Unlock it:
```bash
killall gnome-keyring-daemon 2>/dev/null
eval $(dbus-launch --sh-syntax)
echo "" | gnome-keyring-daemon --unlock --components=secrets
```

### "mock-canister" in response
The service fell back to mock mode. Make sure:
1. D-Bus and keyring are running in the same terminal as main.py
2. The identity is stored in the keyring
3. You have KINIC tokens in your principal

### Service shows `kinic_available: false`
kinic-py isn't installed. Activate your venv and reinstall:
```bash
source ~/kinic-venv/bin/activate
pip install git+https://github.com/ICME-Lab/kinic-cli.git
```

## Security Notes

- **Plaintext identity:** The private key is stored in `~/.config/dfx/identity/jolt-atlas/identity.pem`. Set proper file permissions: `chmod 600 ~/.config/dfx/identity/jolt-atlas/identity.pem`
- **Seed phrase:** Save your seed phrase securely - it can recover your identity if the PEM file is lost
- **Don't commit secrets:** Never commit identity.pem or seed phrases to git

## License

MIT - Built for Coinbase AgentKit
