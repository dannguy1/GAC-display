# GAC-Display

Modular digital signage for **Garlic & Chives** restaurant.

A thin **shell** subscribes to the display-agent SSE stream and loads
self-contained **session pages** into a fullscreen iframe — making it easy
to add new display experiences (happy hour, events, announcements) without
touching the shell or existing sessions.

## Quick Start

```bash
# 1. Start the GAC-Concierge backend (required)
cd ../GAC-Concierge && ./gac_service.sh start

# 2. Start the default menu session
cd sessions/menu && npm install && npm run dev   # :8504

# 3. Start the shell
cd shell && npm install && npm run dev           # :8503
```

Open **http://localhost:8503** for the full shell (loads menu session in iframe).  
Open **http://localhost:8504** to run the menu session standalone.

## Architecture

See **[DESIGN.md](DESIGN.md)** for the full architecture, SSE protocol,
card types, session contract, and backlog.

## Project Structure

```
shell/              ← persistent kiosk shell (SSE subscriber + scheduler + iframe loader)
sessions/
  menu/             ← default session: rotating menu item cards
  announcement/     ← full-screen text announcements
  happy-hour/       ← drink/appetizer specials with countdown timer
docs/
  sessions.md       ← session implementation reference
  guides/           ← configuration and authoring guides
test/
  mock-sse.mjs      ← mock SSE server for testing
Pi-Setup/           ← Raspberry Pi kiosk provisioning tooling (not part of the web app)
```

## Sessions

| Session | Port | Status | Description |
|---------|------|--------|-------------|
| `menu`  | 8504 | ✅ Live | Rotating menu item cards (landscape split layout) |
| `announcement` | 8505 | ✅ Live | Full-screen text announcements (info/warning/promo) |
| `happy-hour` | 8506 | ✅ Live | Drink/appetizer specials with live countdown timer |
| `events` | — | 🔲 Planned | Upcoming events calendar |

## Testing Session Switching

A mock SSE server is included for testing without the full backend:

```bash
# Terminal 1 — menu session
cd sessions/menu && npm run dev              # :8504

# Terminal 2 — announcement session
cd sessions/announcement && npm run dev      # :8505

# Terminal 3 — happy-hour session
cd sessions/happy-hour && npm run dev        # :8506

# Terminal 4 — shell
cd shell && npm run dev                      # :8503

# Terminal 5 — mock SSE server (replaces the real backend)
node test/mock-sse.mjs                       # :8000
```

The mock server loops: sends menu content → switches to announcements →
sends announcement content → switches back to menu.

The shell's local scheduler also fires session switches based on
`shell/public/schedule.json` — see `docs/guides/scheduling.md`.

## Pi Kiosk Deployment

`Pi-Setup/` contains all tooling for provisioning Raspberry Pi 4 units as physical kiosks.
This is **infrastructure tooling only** — it is not part of the web application itself.

The provisioner configures a fresh Pi to:
- Launch Chromium in fullscreen, connecting to the GAC-Display shell URL
- Run on labwc (Wayland) without desktop/taskbar overhead
- Follow a daily on/off schedule (default: on at 07:55, off at 00:00)
- Lock display to 1920×1080@60 Hz

```bash
# From the GAC server — provision a new Pi:
cd Pi-Setup && ./provision-kiosk.sh <PI_IP> [SERVER_IP]
```

See **[Pi-Setup/README.md](Pi-Setup/README.md)** for the quick-start guide and
**[Pi-Setup/pi-kiosk-setup.md](Pi-Setup/pi-kiosk-setup.md)** for the full setup reference.

## Related

- **GAC-Concierge** — Backend API, display-agent, and main ordering app
- **Display agent**: `GAC-Concierge/backend/display_agent.py`
- **SSE endpoint**: `GET http://gacaiserver:8000/v1/display/stream`
