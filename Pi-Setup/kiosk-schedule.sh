#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# GAC Kiosk Schedule Script
#
# Manages the daily start/stop cycle of the kiosk display.
# Called by labwc autostart at boot and by cron for nightly shutdown.
#
# Usage:
#   ~/kiosk-schedule.sh start              Enable display + launch Chromium
#   ~/kiosk-schedule.sh stop               Kill Chromium + disable display
#   ~/kiosk-schedule.sh apply              Write cron from ~/kiosk.conf times
#   ~/kiosk-schedule.sh set-schedule HH:MM HH:MM   Change sleep/wake + apply
#   ~/kiosk-schedule.sh status             Show current state
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

CONF="$HOME/kiosk.conf"
LOG="$HOME/kiosk-schedule.log"

# ── Load config ───────────────────────────────────────────────────────
if [[ -f "$CONF" ]]; then
    source "$CONF"
fi
: "${SERVER_IP:=192.168.10.3}"
: "${SHELL_PORT:=8503}"
: "${SLEEP_TIME:=00:00}"
: "${WAKE_TIME:=07:55}"

KIOSK_URL="http://${SERVER_IP}:${SHELL_PORT}"

# ── Wayland environment (needed when running from cron) ───────────────
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
    WAYLAND_DISPLAY=$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'wayland-*' \
        -not -name '*.lock' -printf '%f\n' 2>/dev/null | head -1)
    export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
fi

# ── Logging ───────────────────────────────────────────────────────────
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG" 2>/dev/null || true
    echo "$*"
}

# ── Stop: kill Chromium, disable HDMI ─────────────────────────────────
do_stop() {
    log "STOP: Killing Chromium and disabling display"

    # Graceful kill then force
    pkill -f chromium 2>/dev/null || true
    sleep 1
    pkill -9 -f chromium 2>/dev/null || true

    # Disable HDMI output — TV switches to standby
    wlr-randr --output HDMI-A-1 --off 2>/dev/null || true

    log "STOP: Complete — display off until next start"
}

# ── Start: enable HDMI, launch Chromium ───────────────────────────────
do_start() {
    log "START: Enabling display and launching Chromium"

    # Enable HDMI output at 1080p
    wlr-randr --output HDMI-A-1 --on --mode 1920x1080@60Hz --pos 0,0 2>/dev/null || true
    sleep 3

    # Kill any lingering Chromium instance
    pkill -f chromium 2>/dev/null || true
    sleep 1

    # Launch Chromium in kiosk mode
    chromium \
      --kiosk \
      --ozone-platform=wayland \
      --noerrdialogs \
      --password-store=basic \
      --disable-infobars \
      --disable-session-crashed-bubble \
      --check-for-update-interval=31536000 \
      --no-first-run \
      --start-maximized \
      --disable-dev-shm-usage \
      --enable-gpu-rasterization \
      --use-angle=gles \
      --disable-features=TranslateUI,EyeDropper,MediaRouter \
      --disable-component-update \
      --disable-background-networking \
      --disable-sync \
      --disable-breakpad \
      --disable-domain-reliability \
      --no-default-browser-check \
      --autoplay-policy=no-user-gesture-required \
      --force-device-scale-factor=1 \
      --renderer-process-limit=2 \
      --disable-accessibility \
      "$KIOSK_URL" &

    log "START: Chromium launched → $KIOSK_URL"
}

# ── Apply: write cron entries from config ─────────────────────────────
do_apply() {
    local SLEEP_H SLEEP_M WAKE_H WAKE_M
    SLEEP_H=$(echo "$SLEEP_TIME" | cut -d: -f1 | sed 's/^0//')
    SLEEP_M=$(echo "$SLEEP_TIME" | cut -d: -f2 | sed 's/^0//')
    WAKE_H=$(echo "$WAKE_TIME" | cut -d: -f1 | sed 's/^0//')
    WAKE_M=$(echo "$WAKE_TIME" | cut -d: -f2 | sed 's/^0//')
    : "${SLEEP_H:=0}"
    : "${SLEEP_M:=0}"
    : "${WAKE_H:=7}"
    : "${WAKE_M:=55}"

    local SCRIPT="$HOME/kiosk-schedule.sh"
    local EXISTING
    EXISTING=$(crontab -l 2>/dev/null | grep -v kiosk-schedule || true)
    { echo "$EXISTING"; \
      echo "${SLEEP_M} ${SLEEP_H} * * * ${SCRIPT} stop >> ${LOG} 2>&1"; \
      echo "${WAKE_M} ${WAKE_H} * * * ${SCRIPT} start >> ${LOG} 2>&1"; } \
      | sed '/^$/d' | crontab -

    echo "Schedule applied:"
    echo "  Sleep: ${SLEEP_TIME} (display off)"
    echo "  Wake:  ${WAKE_TIME} (display on)"
    echo ""
    crontab -l 2>/dev/null | grep kiosk-schedule
    log "APPLY: Schedule set to sleep=${SLEEP_TIME} wake=${WAKE_TIME}"
}

# ── Set schedule shortcut ─────────────────────────────────────────────
do_set_schedule() {
    local NEW_SLEEP="$1" NEW_WAKE="$2"
    # Validate HH:MM format
    local TIME_RE='^[0-2][0-9]:[0-5][0-9]$'
    if ! [[ "$NEW_SLEEP" =~ $TIME_RE ]]; then
        echo "✗ Invalid sleep time: $NEW_SLEEP (use HH:MM)"
        exit 1
    fi
    if ! [[ "$NEW_WAKE" =~ $TIME_RE ]]; then
        echo "✗ Invalid wake time: $NEW_WAKE (use HH:MM)"
        exit 1
    fi

    sed -i "s/^SLEEP_TIME=.*/SLEEP_TIME=${NEW_SLEEP}/" "$CONF"
    sed -i "s/^WAKE_TIME=.*/WAKE_TIME=${NEW_WAKE}/" "$CONF"
    echo "✓ Updated $CONF"
    echo ""

    # Reload and apply
    SLEEP_TIME="$NEW_SLEEP"
    WAKE_TIME="$NEW_WAKE"
    do_apply
}

# ── Status ────────────────────────────────────────────────────────────
do_status() {
    echo "GAC Kiosk Schedule"
    echo "────────────────────────────────────"

    CHROME_PID=$(pgrep -f "chromium.*kiosk" 2>/dev/null | head -1)
    if [[ -n "$CHROME_PID" ]]; then
        echo "Chromium:    running (PID $CHROME_PID)"
    else
        echo "Chromium:    not running"
    fi

    HDMI=$(wlr-randr 2>/dev/null | grep -A1 "HDMI-A-1" | grep "Enabled" | awk '{print $2}')
    echo "HDMI output: ${HDMI:-(unknown)}"

    RES=$(wlr-randr 2>/dev/null | grep current | head -1)
    echo "Resolution:  ${RES:-(off)}"

    echo ""
    echo "Schedule config:"
    echo "  Sleep: ${SLEEP_TIME}  Wake: ${WAKE_TIME}"

    echo ""
    echo "Cron entries:"
    crontab -l 2>/dev/null | grep kiosk-schedule || echo "  (none)"

    echo ""
    echo "Recent log:"
    tail -5 "$LOG" 2>/dev/null || echo "  (no log)"
}

# ── Main ──────────────────────────────────────────────────────────────
case "${1:-}" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    apply)
        do_apply
        ;;
    set-schedule)
        if [[ -z "${2:-}" || -z "${3:-}" ]]; then
            echo "Usage: $0 set-schedule <SLEEP_HH:MM> <WAKE_HH:MM>"
            echo "Example: $0 set-schedule 23:00 07:30"
            exit 1
        fi
        do_set_schedule "$2" "$3"
        ;;
    status)
        do_status
        ;;
    *)
        echo "GAC Kiosk Schedule"
        echo ""
        echo "Usage: $0 {start|stop|apply|set-schedule|status}"
        echo ""
        echo "  start                        Enable display + launch Chromium"
        echo "  stop                         Kill Chromium + disable display"
        echo "  apply                        Write cron from ~/kiosk.conf schedule"
        echo "  set-schedule HH:MM HH:MM     Change sleep/wake times + apply"
        echo "  status                       Show current state + schedule"
        echo ""
        echo "Config: ~/kiosk.conf (SLEEP_TIME, WAKE_TIME)"
        ;;
esac
