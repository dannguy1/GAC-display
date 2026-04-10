#!/bin/bash
# GAC Kiosk Setup Script
# Usage:
#   ~/kiosk-setup.sh apply              Apply settings from ~/kiosk.conf
#   ~/kiosk-setup.sh set-ip 10.0.1.50   Change server IP and apply
#   ~/kiosk-setup.sh status             Show current configuration

set -euo pipefail

CONF="$HOME/kiosk.conf"
AUTOSTART="$HOME/.config/labwc/autostart"

# ── Load config ───────────────────────────────────────────────────────
load_conf() {
    if [[ ! -f "$CONF" ]]; then
        echo "✗ Config not found: $CONF"
        exit 1
    fi
    source "$CONF"
    : "${SERVER_IP:?SERVER_IP not set in $CONF}"
    : "${SHELL_PORT:=8503}"
}

# ── Apply config to all targets ───────────────────────────────────────
do_apply() {
    load_conf
    local URL="http://${SERVER_IP}:${SHELL_PORT}"

    echo "Applying: SERVER_IP=$SERVER_IP  SHELL_PORT=$SHELL_PORT"
    echo "Kiosk URL: $URL"
    echo ""

    echo "✓ Config saved — kiosk-schedule.sh reads from ~/kiosk.conf at runtime"

    echo ""
    echo "Done. Reboot to take effect:  sudo reboot"
}

# ── Set IP shortcut ───────────────────────────────────────────────────
do_set_ip() {
    local NEW_IP="$1"
    # Validate IP format
    if ! [[ "$NEW_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "✗ Invalid IP address: $NEW_IP"
        exit 1
    fi
    sed -i "s/^SERVER_IP=.*/SERVER_IP=${NEW_IP}/" "$CONF"
    echo "✓ Updated $CONF → SERVER_IP=$NEW_IP"
    echo ""
    do_apply
}

# ── Status ────────────────────────────────────────────────────────────
do_status() {
    load_conf
    echo "GAC Kiosk Status"
    echo "────────────────────────────────────"
    echo "Config:     $CONF"
    echo "Server IP:  $SERVER_IP"
    echo "Shell Port: $SHELL_PORT"
    echo "Kiosk URL:  http://${SERVER_IP}:${SHELL_PORT}"
    echo ""

    echo "Chromium running:"
    KIOSK_URL=$(ps aux | grep -v grep | grep "chromium" | grep -oP "http://[0-9.]+:[0-9]+" | head -1)
    echo "  ${KIOSK_URL:-(not running)}"

    echo ""
    echo "Display resolution:"
    RES=$(wlr-randr 2>/dev/null | grep current | head -1)
    echo "  ${RES:-(unknown)}"
}

# ── Main ──────────────────────────────────────────────────────────────
case "${1:-}" in
    apply)
        do_apply
        ;;
    set-ip)
        if [[ -z "${2:-}" ]]; then
            echo "Usage: $0 set-ip <IP_ADDRESS>"
            exit 1
        fi
        do_set_ip "$2"
        ;;
    status)
        do_status
        ;;
    *)
        echo "GAC Kiosk Setup"
        echo ""
        echo "Usage: $0 {apply|set-ip <IP>|status}"
        echo ""
        echo "  apply           Apply settings from ~/kiosk.conf"
        echo "  set-ip <IP>     Change server IP and apply immediately"
        echo "  status          Show current configuration"
        echo ""
        echo "Config: ~/kiosk.conf"
        ;;
esac
