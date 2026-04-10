# GAC-Display — Architecture Design

## Vision

GAC-Display is a modular digital signage system for Garlic & Chives restaurant.
It decouples **what to show** (decided by the display-agent) from **how to show it**
(handled by self-contained session pages), making it easy to add new display
experiences without touching existing ones.

---

## Two-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  SHELL  (always running on kiosk browser)           │
│  • Subscribes to SSE from display-agent             │
│  • Receives session directives → swaps iframe src   │
│  • Forwards content events to active session        │
│    via window.postMessage                           │
│  • Port 8503 (dev)                                  │
└──────────────────┬──────────────────────────────────┘
                   │  <iframe src> — swappable
        ┌──────────┴─────────────────────────┐
        │  SESSION PAGE  (self-contained)    │
        │                                    │
        │  sessions/menu    ← DEFAULT        │
        │  sessions/happy-hour  ← future     │
        │  sessions/events      ← future     │
        │  sessions/announcement← future     │
        └────────────────────────────────────┘
```

The shell is the **persistent SSE subscriber**. Session pages are swappable
display experiences — they can be simple React pages, video players, anything
that runs in a browser.

---

## SSE Protocol

The backend display-agent broadcasts over `GET /v1/display/stream` (SSE).

### Event: `session` — Session Directive

Tells the shell to load a different display experience:

```json
{
  "event_type": "session",
  "session": {
    "type": "happy_hour",
    "url": "http://gacaiserver:8000/sessions/happy-hour",
    "display": {
      "duration": 300
    }
  }
}
```

The shell updates `<iframe src>` to `session.url`. If `display.duration` is set,
the shell auto-returns to the default session after that many seconds.

### Event: `content` — Content Push

Sends typed cards to the active session:

```json
{
  "event_type": "content",
  "display": {
    "item_interval": 8
  },
  "cards": [
    { "type": "menu_item", "data": { "item_name": "Pho Tai", "price": 12.95, "..." : "..." } },
    { "type": "message",   "data": { "headline": "Welcome!", "body": "Ask about specials" } }
  ]
}
```

> **Migration note**: The current `display_agent.py` in GAC-Concierge uses a
> legacy `items` key (flat list of menu item objects). The typed `cards` envelope
> is the target design. Migration is tracked in the backlog.

### Per-Card Display Override (future)

Individual cards can override the envelope-level `display` settings:

```json
{
  "type": "message",
  "data": { "headline": "Kitchen closing soon!" },
  "display": { "item_interval": 20 }
}
```

The session reads `card.display?.item_interval ?? envelope.display.item_interval`.

---

## Shell → Session Communication

The shell forwards `content` events to the active session via `postMessage`:

```js
// Shell sends
iframeRef.current.contentWindow.postMessage(
  { source: 'gac-display-shell', payload: contentEvent },
  targetOrigin   // '*' in dev; explicit origin in production
);

// Session listens
window.addEventListener('message', (e) => {
  if (e.data?.source === 'gac-display-shell') {
    handleContent(e.data.payload);
  }
});
```

Sessions **may also** connect directly to SSE as a fallback (useful in dev mode
where shell and session run on different ports). Direct SSE takes priority;
postMessage is used when the session is loaded inside the shell iframe.

---

## Card Types

| Type          | Description                            | Status      |
|---------------|----------------------------------------|-------------|
| `menu_item`   | Menu item — image, name, price, desc   | ✅ Implemented |
| `message`     | Full-screen text announcement          | 🔲 Planned  |
| `special`     | Today's special with emphasis styling  | 🔲 Planned  |
| `promotion`   | Promotional deal with optional image   | 🔲 Planned  |

Card renderer dispatch pattern:

```jsx
function CardRenderer({ card }) {
  switch (card.type) {
    case 'menu_item':  return <MenuItemCard  data={card.data} />;
    case 'message':    return <MessageCard   data={card.data} />;
    case 'special':    return <SpecialCard   data={card.data} />;
    case 'promotion':  return <PromotionCard data={card.data} />;
    default:           return <MessageCard   data={{ headline: `Unknown: ${card.type}` }} />;
  }
}
```

---

## Sessions

### `menu` — Default Session (implemented)

- **Location**: `sessions/menu/`
- **Dev port**: 8504
- **Data source**: Direct SSE + postMessage fallback
- **Card type**: `menu_item`
- **Layout**: Landscape split — large image left, info panel right
- **Transition**: Horizontal slide (700ms, Material ease)
- **Idle screen**: Garlic & Chives logo with brand styling

### `happy-hour` — Future

- Full-screen background video or image
- Cocktail/appetizer specials overlay
- Countdown timer to end of happy hour
- Returns to `menu` session automatically when timer expires

### `events` — Future

- Upcoming events calendar or list
- Could be driven by a `events.json` data file

### `announcement` — Future

- Full-screen text + optional background image
- Used for custom messages (kitchen notes, wait time, etc.)

---

## Shell Behavior

```
Startup
  └─ Load default session (menu) into iframe
  └─ Connect to SSE

On SSE "session" event
  └─ Update iframe src to session.url
  └─ If session.display.duration set → schedule auto-return timer

On SSE "content" event
  └─ Forward to active session via postMessage

On session auto-return timeout
  └─ Restore iframe src to default session URL
```

---

## Project Structure

```
GAC-display/
├── DESIGN.md             ← this file
├── README.md             ← quick start
├── .gitignore
├── shell/                ← persistent SSE shell
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── App.css
├── sessions/
│   └── menu/             ← default menu display session
│       ├── package.json
│       ├── vite.config.js
│       ├── index.html
│       └── src/
│           ├── main.jsx
│           ├── App.jsx
│           ├── App.css
│           ├── components/
│           │   ├── MenuItemCard.jsx
│           │   └── MenuItemCard.css
│           └── services/
│               └── api.js
└── docs/
    └── sessions.md       ← session implementation guide
```

---

## Configuration

All configuration is via environment variables / `.env` files.

| Variable               | Location     | Default                      | Description                        |
|------------------------|--------------|------------------------------|------------------------------------|
| `VITE_BACKEND_URL`     | shell/.env   | `http://localhost:8000`      | Backend API base                   |
| `VITE_SESSION_MENU_URL`| shell/.env   | `http://localhost:8504`      | Default session URL (dev)          |
| `VITE_SHELL_ORIGIN`    | sessions/.env| `http://localhost:8503`      | Expected shell origin for postMessage |

---

## Development Setup

```bash
# Terminal 1 — menu session
cd sessions/menu
npm install && npm run dev      # http://localhost:8504

# Terminal 2 — shell
cd shell
npm install && npm run dev      # http://localhost:8503
```

Open `http://localhost:8503` — the shell loads the menu session in an iframe.
The menu session can also be opened standalone at `http://localhost:8504`.

---

## Open Questions / Backlog

- [ ] Migrate `display_agent.py` from legacy `items` key to typed `cards` envelope
- [ ] Add `event_type` field to all SSE events (currently the shell infers from key presence)
- [ ] Decide on production serving strategy (FastAPI static mounts vs. nginx reverse proxy)
- [ ] Shell: explicit `targetOrigin` for postMessage in production
- [ ] Add `gac_service.sh` entries for GAC-display shell and menu session
- [ ] `sessions/menu`: implement postMessage listener as fallback to direct SSE
