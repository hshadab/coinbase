#!/bin/bash
# Start Kinic service with real Internet Computer connection

# Kill existing processes
killall gnome-keyring-daemon 2>/dev/null
pkill -f "python.*main.py" 2>/dev/null
sleep 1

# Start D-Bus
eval $(dbus-launch --sh-syntax)
export DBUS_SESSION_BUS_ADDRESS

# Unlock keyring
echo "" | gnome-keyring-daemon --unlock --components=secrets

# Store identity in keyring (if not already there)
if ! secret-tool lookup service internet_computer_identities username internet_computer_identity_jolt-atlas >/dev/null 2>&1; then
    echo "Storing identity in keyring..."
    cat ~/.config/dfx/identity/jolt-atlas/identity.pem | xxd -p | tr -d '\n' | \
        secret-tool store --label="ic:jolt-atlas" \
        service internet_computer_identities \
        username internet_computer_identity_jolt-atlas
fi

# Activate venv and start service
cd /home/hshadab/coinbase/services/kinic-service
source ~/kinic-venv/bin/activate
echo "Starting Kinic service with real IC connection..."
python main.py
