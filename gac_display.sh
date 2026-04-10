#!/usr/bin/env bash
#
# GAC-Display service manager
# Usage: ./gac_display.sh {start|stop|restart|status}
#
# Manages all five Vite dev servers:
#   shell           :8503   Orchestrator
#   menu            :8504   Menu session agent
#   announcement    :8505   Announcement session agent
#   happy-hour      :8506   Happy-hour session agent
#   lunch-special   :8507   Lunch-special session agent
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
PID_DIR="$SCRIPT_DIR/.pids"

# Service definitions: name|directory|port
SERVICES=(
    "shell|shell|8503"
    "menu|sessions/menu|8504"
    "announcement|sessions/announcement|8505"
    "happy-hour|sessions/happy-hour|8506"
    "lunch-special|sessions/lunch-special|8507"
)

# ── Helpers ───────────────────────────────────────────────────────────

_parse_service() {
    IFS='|' read -r SVC_NAME SVC_DIR SVC_PORT <<< "$1"
}

_ensure_dirs() {
    mkdir -p "$LOG_DIR" "$PID_DIR"
}

_is_running() {
    local pidfile="$PID_DIR/$1.pid"
    if [[ -f "$pidfile" ]]; then
        local pid
        pid=$(<"$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
        # Stale pidfile
        rm -f "$pidfile"
    fi
    return 1
}

_port_in_use() {
    local port=$1
    if command -v ss &>/dev/null; then
        ss -tlnp 2>/dev/null | grep -q ":${port} "
    elif command -v lsof &>/dev/null; then
        lsof -iTCP:"$port" -sTCP:LISTEN &>/dev/null
    else
        # Fallback: try connecting
        (echo >/dev/tcp/localhost/"$port") 2>/dev/null
    fi
}

# ── Commands ──────────────────────────────────────────────────────────

do_start() {
    _ensure_dirs
    local started=0 skipped=0

    for entry in "${SERVICES[@]}"; do
        _parse_service "$entry"

        if _is_running "$SVC_NAME"; then
            echo "  ● $SVC_NAME (port $SVC_PORT) — already running (pid $(<"$PID_DIR/$SVC_NAME.pid"))"
            ((skipped++)) || true
            continue
        fi

        # Check for port conflict from external process
        if _port_in_use "$SVC_PORT"; then
            echo "  ✗ $SVC_NAME (port $SVC_PORT) — port already in use by another process"
            ((skipped++)) || true
            continue
        fi

        local workdir="$SCRIPT_DIR/$SVC_DIR"
        if [[ ! -d "$workdir/node_modules" ]]; then
            echo "  ↻ $SVC_NAME — installing dependencies..."
            (cd "$workdir" && npm install --silent 2>&1) >> "$LOG_DIR/$SVC_NAME.log"
        fi

        (cd "$workdir" && nohup npm run dev >> "$LOG_DIR/$SVC_NAME.log" 2>&1 &
         echo $! > "$PID_DIR/$SVC_NAME.pid")

        # Brief wait to verify it started
        sleep 1
        if _is_running "$SVC_NAME"; then
            echo "  ● $SVC_NAME (port $SVC_PORT) — started (pid $(<"$PID_DIR/$SVC_NAME.pid"))"
            ((started++)) || true
        else
            echo "  ✗ $SVC_NAME (port $SVC_PORT) — failed to start (check $LOG_DIR/$SVC_NAME.log)"
            rm -f "$PID_DIR/$SVC_NAME.pid"
        fi
    done

    echo ""
    echo "Started: $started  Skipped: $skipped"
}

do_stop() {
    local stopped=0

    for entry in "${SERVICES[@]}"; do
        _parse_service "$entry"

        if _is_running "$SVC_NAME"; then
            local pid
            pid=$(<"$PID_DIR/$SVC_NAME.pid")
            # Kill the process tree (npm + vite child)
            kill -- -"$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid" 2>/dev/null || true
            rm -f "$PID_DIR/$SVC_NAME.pid"
            echo "  ○ $SVC_NAME (port $SVC_PORT) — stopped (was pid $pid)"
            ((stopped++)) || true
        else
            echo "  ○ $SVC_NAME (port $SVC_PORT) — not running"
        fi
    done

    echo ""
    echo "Stopped: $stopped"
}

do_status() {
    echo "GAC-Display Services"
    echo "────────────────────────────────────────"

    for entry in "${SERVICES[@]}"; do
        _parse_service "$entry"

        if _is_running "$SVC_NAME"; then
            local pid
            pid=$(<"$PID_DIR/$SVC_NAME.pid")
            local http_ok="?"
            if curl -sI "http://localhost:$SVC_PORT/" >/dev/null 2>&1; then
                http_ok="✓"
            else
                http_ok="✗"
            fi
            printf "  ● %-16s port %-6s pid %-8s http %s\n" "$SVC_NAME" "$SVC_PORT" "$pid" "$http_ok"
        else
            printf "  ○ %-16s port %-6s %s\n" "$SVC_NAME" "$SVC_PORT" "not running"
        fi
    done
}

do_restart() {
    echo "Stopping..."
    do_stop
    echo ""
    echo "Starting..."
    do_start
}

do_logs() {
    local svc="${2:-}"
    if [[ -n "$svc" && -f "$LOG_DIR/$svc.log" ]]; then
        tail -f "$LOG_DIR/$svc.log"
    elif [[ -n "$svc" ]]; then
        echo "No log file for '$svc'. Available: shell, menu, announcement, happy-hour"
        exit 1
    else
        tail -f "$LOG_DIR"/*.log
    fi
}

# ── Main ──────────────────────────────────────────────────────────────

case "${1:-}" in
    start)   echo "Starting GAC-Display..."; do_start ;;
    stop)    echo "Stopping GAC-Display..."; do_stop ;;
    restart) echo "Restarting GAC-Display..."; do_restart ;;
    status)  do_status ;;
    logs)    do_logs "$@" ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs [service]}"
        echo ""
        echo "Services: shell (:8503), menu (:8504), announcement (:8505), happy-hour (:8506), lunch-special (:8507)"
        echo "Logs:     $0 logs              — tail all logs"
        echo "          $0 logs menu          — tail one service log"
        exit 1
        ;;
esac
