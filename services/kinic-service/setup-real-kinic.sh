#!/bin/bash
#
# Real Kinic Setup Script - Run this on your local machine
# This will set up everything needed to connect to IC mainnet
#
# Requirements:
#   - Linux, Mac, or Windows WSL
#   - Internet connection
#   - ~30 minutes
#   - KINIC tokens (get from https://kinic.io)
#
# Usage:
#   chmod +x setup-real-kinic.sh
#   ./setup-real-kinic.sh
#

set -e

echo "=============================================="
echo "  REAL KINIC SETUP - IC Mainnet Connection"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

IDENTITY_NAME="jolt-atlas"

# Step 1: Check/Install Rust
echo -e "${YELLOW}[1/6] Checking Rust...${NC}"
if command -v rustc &> /dev/null; then
    echo -e "${GREEN}  ✓ Rust installed: $(rustc --version)${NC}"
else
    echo -e "${YELLOW}  Installing Rust...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo -e "${GREEN}  ✓ Rust installed${NC}"
fi

# Step 2: Check/Install dfx
echo ""
echo -e "${YELLOW}[2/6] Checking dfx CLI...${NC}"
if command -v dfx &> /dev/null; then
    echo -e "${GREEN}  ✓ dfx installed: $(dfx --version)${NC}"
else
    echo -e "${YELLOW}  Installing dfx...${NC}"
    sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
    export PATH="$HOME/.local/share/dfx/bin:$PATH"
    echo 'export PATH="$HOME/.local/share/dfx/bin:$PATH"' >> ~/.bashrc
    echo -e "${GREEN}  ✓ dfx installed${NC}"
fi

# Step 3: Create identity with plaintext storage
echo ""
echo -e "${YELLOW}[3/6] Setting up dfx identity...${NC}"
if dfx identity list 2>/dev/null | grep -q "^${IDENTITY_NAME}$"; then
    echo -e "${GREEN}  ✓ Identity '${IDENTITY_NAME}' already exists${NC}"
else
    echo -e "${YELLOW}  Creating identity with plaintext storage...${NC}"
    dfx identity new "$IDENTITY_NAME" --storage-mode=plaintext
    echo -e "${GREEN}  ✓ Identity created${NC}"
fi

dfx identity use "$IDENTITY_NAME"
PRINCIPAL=$(dfx identity get-principal)
echo -e "${GREEN}  ✓ Using identity: ${IDENTITY_NAME}${NC}"
echo -e "${BLUE}  Principal: ${PRINCIPAL}${NC}"

# Step 4: Install kinic-py
echo ""
echo -e "${YELLOW}[4/6] Installing kinic-py (this takes 10-15 minutes to compile)...${NC}"
if python3 -c "import kinic_py" 2>/dev/null; then
    echo -e "${GREEN}  ✓ kinic-py already installed${NC}"
else
    echo -e "${YELLOW}  Compiling kinic-py from source...${NC}"
    pip install git+https://github.com/ICME-Lab/kinic-cli.git
    echo -e "${GREEN}  ✓ kinic-py installed${NC}"
fi

# Step 5: Setup keyring (for kinic-py)
echo ""
echo -e "${YELLOW}[5/6] Configuring keyring for kinic-py...${NC}"

# Check if we need keyring setup
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${GREEN}  ✓ macOS - keyring should work automatically${NC}"
elif command -v secret-tool &> /dev/null; then
    # Linux with secret-tool
    echo -e "${YELLOW}  Storing identity in keyring...${NC}"

    # Start D-Bus if needed
    if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
        eval $(dbus-launch --sh-syntax)
        export DBUS_SESSION_BUS_ADDRESS
    fi

    # Start keyring if needed
    if [ -z "$GNOME_KEYRING_CONTROL" ]; then
        echo "" | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null || true
    fi

    # Store hex-encoded PEM in keyring
    PEM_FILE="$HOME/.config/dfx/identity/${IDENTITY_NAME}/identity.pem"
    if [ -f "$PEM_FILE" ]; then
        cat "$PEM_FILE" | xxd -p | tr -d '\n' | \
            secret-tool store --label="ic:${IDENTITY_NAME}" \
                service internet_computer_identities \
                username "internet_computer_identity_${IDENTITY_NAME}" 2>/dev/null || true
        echo -e "${GREEN}  ✓ Identity stored in keyring${NC}"
    fi
else
    echo -e "${YELLOW}  No keyring available - kinic-py may need manual configuration${NC}"
    echo -e "${YELLOW}  Install: sudo apt install gnome-keyring dbus-x11 libsecret-tools${NC}"
fi

# Step 6: Install Python dependencies
echo ""
echo -e "${YELLOW}[6/6] Installing Python dependencies...${NC}"
pip install fastapi uvicorn pydantic python-dotenv httpx 2>/dev/null
echo -e "${GREEN}  ✓ Dependencies installed${NC}"

# Create .env file
echo ""
echo -e "${YELLOW}Creating .env configuration...${NC}"
cat > .env << EOF
# Kinic Memory Service Configuration
PORT=3002
KINIC_IDENTITY=${IDENTITY_NAME}
KINIC_USE_IC=true
EOF
echo -e "${GREEN}  ✓ .env created${NC}"

# Summary
echo ""
echo "=============================================="
echo -e "${GREEN}  SETUP COMPLETE!${NC}"
echo "=============================================="
echo ""
echo -e "Your Principal Address (send KINIC tokens here):"
echo -e "${BLUE}  ${PRINCIPAL}${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo ""
echo "  1. Get KINIC tokens from https://kinic.io"
echo "     Send tokens to: ${PRINCIPAL}"
echo ""
echo "  2. Test the connection:"
echo "     python3 -c \"from kinic_py import KinicMemories; km = KinicMemories('${IDENTITY_NAME}', ic=True); print(km.list())\""
echo ""
echo "  3. Start the service:"
echo "     python main.py"
echo ""
echo "  4. Test the API:"
echo "     curl http://localhost:3002/health"
echo ""
echo "=============================================="

# Quick test
echo ""
echo -e "${YELLOW}Running quick test...${NC}"
python3 << EOF
try:
    from kinic_py import KinicMemories
    print("  ✓ kinic-py import works")
    km = KinicMemories('${IDENTITY_NAME}', ic=True)
    print("  ✓ KinicMemories initialized")
    try:
        memories = km.list()
        print(f"  ✓ Connected to IC! Memories: {memories}")
    except Exception as e:
        if "KINIC" in str(e) or "balance" in str(e).lower():
            print("  ! Need KINIC tokens - send to principal above")
        else:
            print(f"  ! Connection test: {e}")
except Exception as e:
    print(f"  ✗ Error: {e}")
EOF

echo ""
echo "Done! See above for any remaining steps."
