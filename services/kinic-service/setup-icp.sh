#!/bin/bash
#
# Kinic ICP Setup Script
# Sets up dfx CLI and identity for Internet Computer storage
#
# Usage:
#   ./setup-icp.sh              # Interactive setup
#   ./setup-icp.sh --local      # Local replica (free testing)
#   ./setup-icp.sh --mainnet    # Mainnet with KINIC tokens
#

set -e

echo "========================================="
echo "  Kinic ICP Setup for Jolt Atlas"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
MODE=""
IDENTITY_NAME="jolt-atlas"

while [[ $# -gt 0 ]]; do
    case $1 in
        --local)
            MODE="local"
            shift
            ;;
        --mainnet)
            MODE="mainnet"
            shift
            ;;
        --identity)
            IDENTITY_NAME="$2"
            shift 2
            ;;
        *)
            IDENTITY_NAME="$1"
            shift
            ;;
    esac
done

# Interactive mode selection if not specified
if [ -z "$MODE" ]; then
    echo "Select deployment mode:"
    echo ""
    echo -e "  ${GREEN}1) Local Replica${NC} - Free testing, no tokens needed"
    echo -e "  ${BLUE}2) IC Mainnet${NC}    - Production, requires KINIC tokens"
    echo ""
    read -p "Enter choice [1/2]: " choice
    case $choice in
        1) MODE="local" ;;
        2) MODE="mainnet" ;;
        *) echo "Invalid choice"; exit 1 ;;
    esac
fi

echo ""
echo -e "Mode: ${GREEN}$MODE${NC}"
echo ""

# ============================================================================
# Install dfx CLI
# ============================================================================

if command -v dfx &> /dev/null; then
    echo -e "${GREEN}✓ dfx is already installed${NC}"
    dfx --version
else
    echo -e "${YELLOW}Installing dfx CLI...${NC}"
    sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"

    # Add to PATH
    export PATH="$HOME/.local/share/dfx/bin:$PATH"
    echo 'export PATH="$HOME/.local/share/dfx/bin:$PATH"' >> ~/.bashrc
    echo -e "${GREEN}✓ dfx installed${NC}"
fi

echo ""

# ============================================================================
# Setup Identity
# ============================================================================

if dfx identity list 2>/dev/null | grep -q "^$IDENTITY_NAME$"; then
    echo -e "${GREEN}✓ Identity '$IDENTITY_NAME' already exists${NC}"
else
    echo -e "${YELLOW}Creating new identity: $IDENTITY_NAME${NC}"
    dfx identity new "$IDENTITY_NAME" --storage-mode=plaintext || true
    echo -e "${GREEN}✓ Identity created${NC}"
fi

dfx identity use "$IDENTITY_NAME"
PRINCIPAL=$(dfx identity get-principal)
echo -e "${GREEN}✓ Using identity: $IDENTITY_NAME${NC}"
echo -e "  Principal: ${BLUE}$PRINCIPAL${NC}"

echo ""

# ============================================================================
# Mode-specific setup
# ============================================================================

if [ "$MODE" = "local" ]; then
    echo "========================================="
    echo "  LOCAL REPLICA SETUP"
    echo "========================================="
    echo ""

    # Check if replica is running
    if dfx ping 2>/dev/null; then
        echo -e "${GREEN}✓ Local replica is running${NC}"
    else
        echo -e "${YELLOW}Starting local replica...${NC}"
        dfx start --background --clean 2>/dev/null || true
        sleep 3

        if dfx ping 2>/dev/null; then
            echo -e "${GREEN}✓ Local replica started${NC}"
        else
            echo -e "${RED}! Could not start replica. Start manually with: dfx start --background${NC}"
        fi
    fi

    # Create .env for local mode
    cat > .env << EOF
# Kinic Memory Service Configuration (LOCAL MODE)
PORT=3002
KINIC_IDENTITY=$IDENTITY_NAME
KINIC_USE_IC=false

# Local replica - no tokens needed!
# Start replica: dfx start --background
EOF

    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Local Setup Complete!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "Your local environment is ready for FREE testing."
    echo ""
    echo "To start:"
    echo "  1. Ensure replica is running: dfx start --background"
    echo "  2. Install dependencies: pip install -r requirements.txt"
    echo "  3. Start service: python main.py"
    echo ""
    echo -e "${YELLOW}Note: Local mode uses dfx local replica.${NC}"
    echo -e "${YELLOW}No KINIC tokens or ICP cycles needed!${NC}"

else
    echo "========================================="
    echo "  MAINNET SETUP"
    echo "========================================="
    echo ""

    # Create .env for mainnet mode
    cat > .env << EOF
# Kinic Memory Service Configuration (MAINNET)
PORT=3002
KINIC_IDENTITY=$IDENTITY_NAME
KINIC_USE_IC=true

# Mainnet requires KINIC tokens
# Get tokens from: https://kinic.io
EOF

    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Mainnet Setup Complete!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "Identity: $IDENTITY_NAME"
    echo -e "Principal: ${BLUE}$PRINCIPAL${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: You need KINIC tokens to use Kinic on mainnet${NC}"
    echo ""
    echo "┌─────────────────────────────────────────────────────┐"
    echo "│  KINIC TOKEN REQUIREMENTS                           │"
    echo "├─────────────────────────────────────────────────────┤"
    echo "│                                                     │"
    echo "│  1. Visit: https://kinic.io                         │"
    echo "│  2. Connect your wallet                             │"
    echo "│  3. Purchase KINIC tokens                           │"
    echo "│  4. Tokens pay for:                                 │"
    echo "│     - Memory canister deployment                    │"
    echo "│     - zkML embedding generation                     │"
    echo "│     - Storage on Internet Computer                  │"
    echo "│                                                     │"
    echo "│  Kinic handles ICP cycles for you!                  │"
    echo "│                                                     │"
    echo "└─────────────────────────────────────────────────────┘"
    echo ""
    echo "To start (after getting KINIC tokens):"
    echo "  1. pip install -r requirements.txt"
    echo "  2. python main.py"
fi

echo ""
