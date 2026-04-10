#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# GAC Kiosk Provisioning Script
#
# Configures a freshly-flashed Raspberry Pi as a GAC-Display kiosk.
# Run this from the server — it SSHes into the Pi and applies all
# settings automatically.
#
# Usage:
#   ./provision-kiosk.sh <PI_IP> [SERVER_IP] [PI_USER] [PI_PASS]
#
# Arguments:
#   PI_IP       IP address of the Raspberry Pi (required)
#   SERVER_IP   IP address of the GAC server (default: 192.168.10.3)
#   PI_USER     SSH username on the Pi (default: gac)
#   PI_PASS     SSH password on the Pi (default: gac12345)
#
# Prerequisites:
#   - sshpass installed on this machine (apt install sshpass)
#   - Pi is on the network with SSH enabled
#   - Pi is running Raspberry Pi OS (64-bit, Bookworm/Trixie)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Arguments ─────────────────────────────────────────────────────────
PI_IP="${1:-}"
SERVER_IP="${2:-192.168.10.3}"
PI_USER="${3:-gac}"
PI_PASS="${4:-gac12345}"
SHELL_PORT="8503"

if [[ -z "$PI_IP" ]]; then
    echo "GAC Kiosk Provisioning"
    echo ""
    echo "Usage: $0 <PI_IP> [SERVER_IP] [PI_USER] [PI_PASS]"
    echo ""
    echo "  PI_IP       Raspberry Pi IP address (required)"
    echo "  SERVER_IP   GAC server IP (default: 192.168.10.3)"
    echo "  PI_USER     SSH user (default: gac)"
    echo "  PI_PASS     SSH password (default: gac12345)"
    echo ""
    echo "Example: $0 192.168.10.70 192.168.10.3"
    exit 1
fi

# ── Resolve paths ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$SCRIPT_DIR/templates"

# ── Validate prerequisites ────────────────────────────────────────────
if ! command -v sshpass &>/dev/null; then
    echo "✗ sshpass not found. Install with: sudo apt install sshpass"
    exit 1
fi

for f in "$TEMPLATES/labwc-autostart" "$TEMPLATES/labwc-environment" \
         "$TEMPLATES/labwc-system-autostart" "$TEMPLATES/kanshi-config" \
         "$SCRIPT_DIR/kiosk-setup.sh" "$SCRIPT_DIR/kiosk-schedule.sh" \
         "$SCRIPT_DIR/kiosk.conf"; do
    if [[ ! -f "$f" ]]; then
        echo "✗ Missing file: $f"
        exit 1
    fi
done

# ── SSH helper ────────────────────────────────────────────────────────
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
ssh_cmd() {
    sshpass -p "$PI_PASS" ssh $SSH_OPTS "$PI_USER@$PI_IP" "$@"
}
scp_cmd() {
    sshpass -p "$PI_PASS" scp $SSH_OPTS "$@"
}

# ── Verify connectivity ──────────────────────────────────────────────
echo "════════════════════════════════════════════════════"
echo "  GAC Kiosk Provisioning"
echo "════════════════════════════════════════════════════"
echo ""
echo "  Pi:       $PI_USER@$PI_IP"
echo "  Server:   $SERVER_IP:$SHELL_PORT"
echo ""

echo "Connecting to Pi..."
if ! ssh_cmd "echo OK" &>/dev/null; then
    echo "✗ Cannot connect to $PI_USER@$PI_IP"
    echo "  Check: Pi is on, SSH is enabled, IP/credentials are correct"
    exit 1
fi
echo "✓ Connected"
echo ""

# ── Gather system info ───────────────────────────────────────────────
echo "── System Info ─────────────────────────────────────"
ssh_cmd "uname -a | cut -d' ' -f1-3,12-13; echo 'RAM:' \$(free -h | awk '/Mem/{print \$2}'); echo 'GPU:' \$(vcgencmd get_mem gpu 2>/dev/null || echo 'unknown')"
echo ""

# ── Step 1: Install packages ─────────────────────────────────────────
echo "── Step 1: Install packages ──────────────────────────"
ssh_cmd "sudo apt-get update -qq 2>/dev/null && sudo apt-get install -y -qq unclutter 2>/dev/null | tail -1"
echo "✓ Packages installed"
echo ""

# ── Step 2: GPU memory ───────────────────────────────────────────────
echo "── Step 2: GPU memory ────────────────────────────────"
ssh_cmd "
    if grep -q '^gpu_mem=' /boot/firmware/config.txt 2>/dev/null; then
        sudo sed -i 's/^gpu_mem=.*/gpu_mem=128/' /boot/firmware/config.txt
    else
        echo 'gpu_mem=128' | sudo tee -a /boot/firmware/config.txt > /dev/null
    fi
"
echo "✓ GPU memory set to 128 MB"
echo ""

# ── Step 3: Force 1920×1080@60Hz ──────────────────────────────────────
echo "── Step 3: Force 1920×1080@60Hz ─────────────────────"
ssh_cmd "
    # Firmware-level HDMI force (applied at boot)
    sudo sed -i '/^hdmi_group=/d; /^hdmi_mode=/d; /^hdmi_drive=/d; /Force 1920x1080/d' /boot/firmware/config.txt
    cat <<'HDMI' | sudo tee -a /boot/firmware/config.txt > /dev/null

# Force 1920x1080@60Hz for kiosk display
hdmi_group=1
hdmi_mode=16
hdmi_drive=2
HDMI
"
# Deploy kanshi config (Wayland-level resolution lock)
ssh_cmd "mkdir -p ~/.config/kanshi"
scp_cmd "$TEMPLATES/kanshi-config" "$PI_USER@$PI_IP:~/.config/kanshi/config"
echo "✓ Display forced to 1920×1080@60Hz (firmware + kanshi)"
echo ""

# ── Step 4: Disable desktop and taskbar ──────────────────────────────
echo "── Step 4: Disable desktop and taskbar ───────────────"
scp_cmd "$TEMPLATES/labwc-system-autostart" "$PI_USER@$PI_IP:/tmp/labwc-system-autostart"
ssh_cmd "
    if [[ -f /etc/xdg/labwc/autostart ]]; then
        sudo cp /etc/xdg/labwc/autostart /etc/xdg/labwc/autostart.bak 2>/dev/null || true
    fi
    sudo cp /tmp/labwc-system-autostart /etc/xdg/labwc/autostart
    rm /tmp/labwc-system-autostart
"
echo "✓ Desktop and taskbar disabled"
echo ""

# ── Step 5: Remove Chromium accessibility overhead ───────────────────
echo "── Step 5: Remove Chromium accessibility overhead ────"
ssh_cmd "
    if [[ -f /etc/chromium.d/00-rpi-vars ]]; then
        sudo sed -i 's/--force-renderer-accessibility//' /etc/chromium.d/00-rpi-vars
    fi
"
echo "✓ Accessibility flag removed"
echo ""

# ── Step 6: Configure labwc autostart ────────────────────────────────
echo "── Step 6: Configure kiosk autostart ─────────────────"
ssh_cmd "mkdir -p ~/.config/labwc"
scp_cmd "$TEMPLATES/labwc-autostart" "$PI_USER@$PI_IP:~/.config/labwc/autostart"
echo "✓ Kiosk autostart configured (uses ~/kiosk-schedule.sh)"
echo ""

# ── Step 7: Disable Xwayland ─────────────────────────────────────────
echo "── Step 7: Disable Xwayland ──────────────────────────"
scp_cmd "$TEMPLATES/labwc-environment" "$PI_USER@$PI_IP:~/.config/labwc/environment"
echo "✓ Xwayland disabled"
echo ""

# ── Step 8: Reduce swap pressure ─────────────────────────────────────
echo "── Step 8: Reduce swap pressure ──────────────────────"
ssh_cmd "
    echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-kiosk.conf > /dev/null
    sudo sysctl -p /etc/sysctl.d/99-kiosk.conf > /dev/null 2>&1 || true
"
echo "✓ Swappiness set to 10"
echo ""

# ── Step 9: Disable packagekit ────────────────────────────────────────
echo "── Step 9: Disable package update daemon ─────────────"
ssh_cmd "sudo systemctl mask packagekit.service 2>/dev/null || true" 2>/dev/null
echo "✓ PackageKit disabled"
echo ""

# ── Step 10: Deploy kiosk management scripts ─────────────────────────
echo "── Step 10: Deploy management scripts ────────────────"
scp_cmd "$SCRIPT_DIR/kiosk-setup.sh" "$PI_USER@$PI_IP:~/kiosk-setup.sh"
scp_cmd "$SCRIPT_DIR/kiosk-schedule.sh" "$PI_USER@$PI_IP:~/kiosk-schedule.sh"
scp_cmd "$SCRIPT_DIR/kiosk.conf" "$PI_USER@$PI_IP:~/kiosk.conf"
ssh_cmd "
    chmod +x ~/kiosk-setup.sh ~/kiosk-schedule.sh
    sed -i 's/^SERVER_IP=.*/SERVER_IP=${SERVER_IP}/' ~/kiosk.conf
    sed -i 's/^SHELL_PORT=.*/SHELL_PORT=${SHELL_PORT}/' ~/kiosk.conf
"
echo "✓ kiosk-setup.sh, kiosk-schedule.sh, and kiosk.conf deployed"
echo ""

# ── Step 11: Configure display schedule ──────────────────────────────
echo "── Step 11: Configure display schedule ───────────────"
ssh_cmd "~/kiosk-schedule.sh apply"
echo ""

# ── Step 12: Disable screen blanking ─────────────────────────────────
echo "── Step 12: Disable screen blanking ──────────────────"
ssh_cmd "
    sudo raspi-config nonint do_blanking 1 2>/dev/null || true
"
echo "✓ Screen blanking disabled"
echo ""

# ── Summary ──────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════"
echo "  Provisioning complete!"
echo "════════════════════════════════════════════════════"
echo ""
echo "  Kiosk URL:  http://${SERVER_IP}:${SHELL_PORT}"
echo ""
echo "  Reboot the Pi to activate:"
echo "    ssh ${PI_USER}@${PI_IP} 'sudo reboot'"
echo ""
echo "  After reboot, verify with:"
echo "    ssh ${PI_USER}@${PI_IP} '~/kiosk-setup.sh status'"
echo ""
echo "  To change server IP later:"
echo "    ssh ${PI_USER}@${PI_IP} '~/kiosk-setup.sh set-ip NEW_IP'"
echo ""
