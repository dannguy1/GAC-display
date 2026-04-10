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
shell/              ← persistent kiosk shell (SSE subscriber + iframe loader)
sessions/
  menu/             ← default session: rotating menu item cards
docs/
  sessions.md       ← guide to building new sessions
```

## Sessions

| Session | Port | Status | Description |
|---------|------|--------|-------------|
| `menu`  | 8504 | ✅ Live | Rotating menu item cards (landscape split layout) |
| `happy-hour` | — | 🔲 Planned | Video/image + cocktail specials + countdown |
| `events` | — | 🔲 Planned | Upcoming events |
| `announcement` | — | 🔲 Planned | Full-screen custom messages |

## Related

- **GAC-Concierge** — Backend API, display-agent, and main ordering app
- **Display agent**: `GAC-Concierge/backend/display_agent.py`
- **SSE endpoint**: `GET http://gacaiserver:8000/v1/display/stream`
