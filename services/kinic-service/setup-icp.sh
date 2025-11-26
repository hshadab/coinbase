#!/bin/bash
#
# Kinic ICP Setup Script
# Sets up dfx CLI and identity for Internet Computer storage
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
NC='\033[0m' # No Color

# Check if dfx is installed
if command -v dfx &> /dev/null; then
    echo -e "${GREEN}dfx is already installed${NC}"
    dfx --version
else
    echo -e "${YELLOW}Installing dfx CLI...${NC}"
    sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"

    # Add to PATH
    export PATH="$HOME/.local/share/dfx/bin:$PATH"
    echo 'export PATH="$HOME/.local/share/dfx/bin:$PATH"' >> ~/.bashrc
fi

echo ""

# Setup identity
IDENTITY_NAME="${1:-jolt-atlas}"

if dfx identity list 2>/dev/null | grep -q "^$IDENTITY_NAME$"; then
    echo -e "${GREEN}Identity '$IDENTITY_NAME' already exists${NC}"
else
    echo -e "${YELLOW}Creating new identity: $IDENTITY_NAME${NC}"
    dfx identity new "$IDENTITY_NAME" --storage-mode=plaintext || true
fi

# Use the identity
dfx identity use "$IDENTITY_NAME"
echo -e "${GREEN}Using identity: $IDENTITY_NAME${NC}"

# Show principal
PRINCIPAL=$(dfx identity get-principal)
echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "Identity: $IDENTITY_NAME"
echo "Principal: $PRINCIPAL"
echo ""
echo "Next steps:"
echo "1. Get KINIC tokens from https://kinic.io"
echo "2. Fund your principal with ICP cycles"
echo "3. Update .env with:"
echo ""
echo "   KINIC_IDENTITY=$IDENTITY_NAME"
echo "   KINIC_USE_IC=true"
echo ""
echo "4. Start the Kinic service:"
echo "   cd services/kinic-service"
echo "   pip install -r requirements.txt"
echo "   python main.py"
echo ""
