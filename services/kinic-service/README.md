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

### Option 2: Production Mode with Plaintext Identity (Recommended)

Uses file-based identity storage - **no keyring/D-Bus required**. Works on any Linux environment including WSL, VMs, and servers.

```bash
# 1. Install dfx (Internet Computer SDK)
curl -fsSL https://internetcomputer.org/install.sh | sh
source ~/.bashrc

# 2. Create identity with PLAINTEXT storage (key stored in ~/.config/dfx/identity/)
dfx identity new jolt-atlas --storage-mode=plaintext
dfx identity use jolt-atlas

# 3. Get your principal (send KINIC tokens here)
dfx identity get-principal

# 4. Install Rust (required for kinic-py)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# 5. Install kinic-py
pip install git+https://github.com/ICME-Lab/kinic-cli.git

# 6. Test the connection
python3 -c "from kinic_py import KinicMemories; km = KinicMemories('jolt-atlas', ic=True); print('SUCCESS')"

# 7. Start the service
KINIC_USE_IC=true KINIC_IDENTITY=jolt-atlas python main.py
```

**Key insight:** The `--storage-mode=plaintext` flag stores your identity's private key in a PEM file at `~/.config/dfx/identity/<name>/identity.pem` instead of the system keyring. This eliminates the need for D-Bus, gnome-keyring, or a desktop environment.

### Option 3: Windows Setup with Multipass (Verified Working)

For Windows users, use Multipass to run an Ubuntu VM with full Kinic support:

```powershell
# 1. Install Multipass (in PowerShell as Admin)
winget install Canonical.Multipass

# 2. Restart PowerShell, then create Ubuntu VM
multipass launch --name kinic --cpus 1 --memory 2G --disk 10G --timeout 600

# 3. Access the VM
multipass shell kinic
```

Inside the VM, run the complete setup:

```bash
# Install dependencies
sudo apt update && sudo apt install -y python3-pip curl gnome-keyring dbus-x11 libsecret-tools

# Start D-Bus and keyring
eval $(dbus-launch --sh-syntax)
echo "" | gnome-keyring-daemon --unlock --components=secrets

# Install dfx
curl -fsSL https://internetcomputer.org/install.sh | sh
source ~/.bashrc

# Create identity with plaintext storage
dfx identity new jolt-atlas --storage-mode=plaintext
dfx identity use jolt-atlas
dfx identity get-principal  # Send KINIC tokens to this address

# Install Rust (required for kinic-py compilation)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# Install kinic-py (takes ~15-20 min to compile)
pip install git+https://github.com/ICME-Lab/kinic-cli.git --break-system-packages

# CRITICAL: Store identity in keyring with correct format
# Kinic expects hex-encoded PEM with specific service/username attributes
cat ~/.config/dfx/identity/jolt-atlas/identity.pem | xxd -p | tr -d '\n' | \
  secret-tool store --label="ic:jolt-atlas" \
    service internet_computer_identities \
    username internet_computer_identity_jolt-atlas

# Test CLI
~/.cargo/bin/kinic-cli --identity jolt-atlas --ic list

# Test Python API
python3 -c "from kinic_py import KinicMemories; km = KinicMemories('jolt-atlas', ic=True); print('SUCCESS')"
```

**Tested and verified:** Creates on-chain memory canisters, inserts data, and performs semantic search.

### Option 4: Production Mode with Keyring (Desktop Only)

For desktop Linux environments with full keyring support:

```bash
# 1. Setup identity (uses system keyring)
./setup-icp.sh --mainnet

# 2. Fund your principal with KINIC tokens
#    Get tokens from: https://kinic.io

# 3. Install dependencies
pip install git+https://github.com/ICME-Lab/kinic-cli.git
pip install fastapi uvicorn pydantic python-dotenv

# 4. Start service
KINIC_USE_IC=true python main.py
```

**Note:** This option requires a desktop environment with D-Bus/gnome-keyring. On headless servers or WSL, use Option 2 (plaintext identity) instead.

## Identity Storage Modes

| Mode | Storage Location | Requirements | Use Case |
|------|------------------|--------------|----------|
| **Plaintext** | `~/.config/dfx/identity/<name>/identity.pem` | None | Servers, WSL, VMs, CI/CD |
| **Keyring** | System keyring (gnome-keyring) | D-Bus, desktop environment | Desktop Linux with GUI |

**Security Note:** Plaintext mode stores the private key in a file. Ensure proper file permissions (`chmod 600`) and do not use for high-value accounts. For production with significant funds, use a hardware wallet or HSM.

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
