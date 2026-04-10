# GAC-Display Copilot Instructions

## Project Overview

GAC-Display is a modular digital signage frontend for **Garlic & Chives** restaurant (Garden Grove, CA). Built on an **orchestrator + agent** architecture, it runs on a kiosk browser and displays rotating menu items, announcements, and promotions.

This project is a **standalone evolution** of the menu display code originally in GAC-Concierge. The original code in GAC-Concierge is untouched — this is not a migration.

---

## Relationship to GAC-Concierge

GAC-Concierge is the sibling project (lives at `../GAC-Concierge/`). It provides:

- **Backend API** (`FastAPI` on port 8000) — the display-agent SSE endpoint, image serving, and all restaurant data.
- **SSE endpoint**: `GET /v1/display/stream` — broadcasts `content` events with typed `cards`.
- **Image routes**: `/images/` and `/downloaded_images/` — served by FastAPI.

GAC-Display **consumes** GAC-Concierge APIs. The data flow is strictly one-way: backend → SSE → shell → agent.

### What lives where

| Concern | Location |
|---------|----------|
| Menu content production | GAC-Concierge `display_agent.py` |
| Session scheduling + agent lifecycle | GAC-Display `shell/` |
| Content rendering (agents) | GAC-Display `sessions/` |
| Agent protocol SDK | GAC-Display `lib/agent-sdk/` |
| Menu data, images | GAC-Concierge `data/` |

### Starting the full stack

```bash
# 1. Backend (required — provides SSE + images)
cd ../GAC-Concierge && ./gac_service.sh start

# 2. Menu session agent
cd sessions/menu && npm install && npm run dev   # :8504

# 3. Shell orchestrator
cd shell && npm install && npm run dev           # :8503
```

---

## Architecture

Orchestrator + agent architecture: **shell** (orchestrator) + **sessions** (specialized agents in swappable iframes).

```
lib/agent-sdk/      ← shared agent protocol SDK
  protocol.js       ← message types, agent states (single source of truth)
  index.js          ← setupAgent, reportStatus, onContent, getImageUrl

shell/              ← orchestrator: SSE subscriber, scheduler, agent lifecycle
  src/App.jsx       ← SSE connection, agent messaging, debug overlay
  src/App.css       ← Fullscreen iframe + status/debug styles
  src/schedule.js   ← Session scheduler (interval/windowed/fixed)
  src/protocol.js   ← Re-exports shared protocol for shell use
  src/registry.js   ← Agent registry (capabilities, health, state, errors)

sessions/
  menu/             ← agent: rotating menu item cards
    src/App.jsx         ← Carousel logic, pause/resume
    src/components/     ← MenuItemCard (landscape split layout)
    src/services/api.js ← Re-exports from @gac/agent-sdk
  announcement/     ← agent: full-screen text announcements
    src/App.jsx         ← Self-loading carousel, pause/resume
    src/components/     ← MessageCard (info/warning/promo styles)
    src/services/api.js ← Re-exports from @gac/agent-sdk
  happy-hour/       ← agent: specials with countdown timer
    src/App.jsx         ← Self-loading, header + carousel, pause/resume
    src/components/     ← HappyHourCard, CountdownTimer
    src/services/api.js ← Re-exports from @gac/agent-sdk
```

### Key design documents

- `DESIGN.md` — Full architecture, agent protocol, card types, session lifecycle, backlog.
- `docs/sessions.md` — Guide for building new session agents.
- `docs/guides/` — Configuration guides for scheduling, announcements, happy hour.

---

## Commands

### Shell (port 8503)
```bash
cd shell
npm install && npm run dev      # Dev server
npm run build                   # Production build
```

### Menu Session (port 8504)
```bash
cd sessions/menu
npm install && npm run dev      # Dev server (standalone or iframe)
npm run build                   # Production build
```

---

## Key Conventions

### Shared Agent SDK (`lib/agent-sdk/`)
All agent protocol logic lives in a single shared library. Sessions import via the `@gac/agent-sdk` Vite alias. Session `services/api.js` files are thin re-exports:
```js
export { insideIframe, setupAgent, reportStatus, onContent, getImageUrl } from '@gac/agent-sdk';
```
**Never duplicate protocol logic in session code.** Always import from the SDK.

### No TailwindCSS
Use **vanilla CSS only**. Component-scoped BEM class names. CSS variables for theming defined in `sessions/menu/src/App.css`:
```css
--color-brand-green, --color-brand-gold, --font-serif, --font-sans
```

### Agent Context Detection
Agents detect whether they run standalone or inside the shell:
```js
import { insideIframe } from '@gac/agent-sdk';
```
- **Standalone**: agent opens its own direct SSE connection.
- **Iframe**: agent uses SDK functions only — no direct SSE.

### Agent Registration
When inside the shell, agents register on mount with capabilities and lifecycle handlers:
```js
import { setupAgent, reportStatus } from '@gac/agent-sdk';

const cleanup = setupAgent(
  { cardTypes: ['menu_item'], selfLoading: false, acceptsContent: true },
  { onPause: handlePause, onResume: handleResume }
);
```
This sends a `register` message, starts the auto-pong health responder, and wires up pause/resume handlers.

### Status Reporting
Agents report lifecycle state changes to the orchestrator:
```js
reportStatus('playing', { total: items.length });
reportStatus('paused');
reportStatus('error', { reason: 'Load failed' });
reportStatus('ended');
```

### Content Listening
Agents receive content via `onContent()` which filters orchestrator messages automatically:
```js
import { onContent } from '@gac/agent-sdk';

const cleanup = onContent((envelope) => {
  // Support both typed cards and legacy flat items from backend
  let items;
  if (envelope.cards) {
    items = envelope.cards.filter(c => c.type === 'menu_item').map(c => c.data);
  } else if (envelope.items) {
    items = envelope.items;
  }
});
```

### Pause/Resume
The orchestrator can send `pause` and `resume` commands. Agents handle these via callbacks passed to `setupAgent()`. When paused, carousel timers skip their advance tick.

### Agent Protocol Messages

| Direction | Type | Purpose |
|-----------|------|---------|
| Shell → Agent | `content` | Forward SSE content envelope |
| Shell → Agent | `ping` | Health check |
| Shell → Agent | `pause` | Pause playback |
| Shell → Agent | `resume` | Resume playback |
| Agent → Shell | `register` | Declare capabilities on mount |
| Agent → Shell | `status` | Report state change |
| Agent → Shell | `pong` | Respond to health ping |

Message source identifiers: `gac-display-shell`, `gac-display-agent`.

### postMessage Security
- Shell sends typed messages via `sendToAgent(type, payload)` with explicit `targetOrigin`.
- SDK verifies `e.origin` against `VITE_SHELL_ORIGIN` for all incoming messages.
- All messages carry `source: 'gac-display-shell'` or `source: 'gac-display-agent'`.

### Content Format
The backend sends typed `cards` envelopes:
```json
{ "cards": [{ "type": "menu_item", "data": { "item_name": "Pho Tai", ... } }] }
```
Agents filter cards by their declared `cardTypes`.

### Strict API Boundary
All backend communication (SSE, image URLs) goes through the agent SDK or `services/api.js`. Never use `fetch()` or `EventSource` directly in components.

### Config via Environment
All URLs and origins are configured through Vite env variables (`.env` files):

| Variable               | Location         | Default                  |
|------------------------|------------------|--------------------------|
| `VITE_SESSION_MENU_URL`| `shell/.env`     | `http://localhost:8504`  |
| `VITE_SHELL_ORIGIN`   | `sessions/*/.env` | `http://localhost:8503`  |

### Image URL Resolution
`getImageUrl()` from the SDK normalizes backend image paths. It strips `data/images/` and `data/downloaded_images/` prefixes. Path traversal (`..`) is rejected.

### Capabilities-Based Routing
The orchestrator only forwards content to agents that declare `acceptsContent: true`. Self-loading agents (`selfLoading: true`) like announcement and happy-hour load their own data from local JSON.

### Debug Overlay
In dev mode, the shell shows an agent debug overlay (bottom-left) with: current state, card types, error count. This uses the registry snapshot.

---

## SSE Event Types

| `event_type` | Purpose | Handler |
|-------------|---------|---------|
| `content`   | Typed cards for the active agent | Shell forwards via `sendToAgent('content', data)` |

Session scheduling is handled by the shell's local scheduler (`schedule.js`), not by SSE events.

---

## Adding a New Session Agent

1. Copy `sessions/menu/` as template
2. Change port in `package.json` and `vite.config.js`
3. Add `@gac/agent-sdk` alias in `vite.config.js`
4. Make `services/api.js` a thin re-export from `@gac/agent-sdk`
5. Implement `setupAgent()` with capabilities + pause/resume handlers
6. Report status via `reportStatus()`
7. Add to `shell/public/schedule.json`
8. See `docs/sessions.md` for full guide
