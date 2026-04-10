# GAC-Display — Architecture Design

## Vision

GAC-Display is a modular digital signage system for Garlic & Chives restaurant,
built on an **orchestrator + agent** architecture. The shell acts as an
**orchestrator** — it subscribes to backend SSE, runs the session scheduler, and
manages agent lifecycle. Each session is a **specialized agent** — a
self-contained page that registers its capabilities, reports its state, and
responds to health checks.

This architecture decouples scheduling and rendering from content production,
making it easy to add new display agents without touching existing ones.

---

## Orchestrator + Agent Architecture

```
┌─────────────────────────────────────────────────────┐
│  SHELL  (orchestrator, always running)              │
│  • Subscribes to SSE for menu content               │
│  • Runs local scheduler → swaps iframe src          │
│  • Maintains agent registry (capabilities, health)  │
│  • Forwards typed messages to active agent           │
│  • Health-pings active agent every 10s              │
│  • Port 8503 (dev)                                  │
└──────────────────┬──────────────────────────────────┘
                   │  <iframe src> — swappable agent
        ┌──────────┴─────────────────────────┐
        │  SESSION PAGE  (specialized agent)  │
        │                                    │
        │  sessions/menu         ← DEFAULT   │
        │  sessions/announcement ← scheduled │
        │  sessions/happy-hour   ← scheduled │
        │  sessions/lunch-special← scheduled │
        └────────────────────────────────────┘
```

The shell is the **orchestrator** — it owns the SSE connection, the session
scheduler, and the agent registry. Session pages are **specialized agents** that
register their capabilities on mount, report their state, and respond to health
pings. Only one agent is active at a time.

### Content Ownership

| Layer | Role | Owns |
|-------|------|------|
| GAC-Concierge | Content provider | Menu data, images, SSE stream |
| Shell | Orchestrator | Scheduling, SSE forwarding, agent lifecycle, health monitoring |
| Menu session | Agent | Menu card rendering, slide carousel |
| Announcement session | Agent | Announcement content + rendering |
| Happy-hour session | Agent | Specials content + rendering, countdown |
| Lunch-special session | Agent | Lunch combo content + rendering, countdown |

### Why Menu Uses Shell-Forwarded SSE (Not Self-Loading)

The menu agent's content delivery differs from announcement and happy-hour by
design. This table summarizes the three patterns:

| Agent | `selfLoading` | `acceptsContent` | Data Source |
|-------|:---:|:---:|---|
| Menu | `false` | `true` | Shell SSE → postMessage |
| Announcement | `true` | `true` | Self-loads JSON; accepts shell override |
| Happy-hour | `true` | `false` | Self-loads JSON only |
| Lunch-special | `true` | `false` | Config JSON + brief direct SSE for menu item lookup |

The asymmetry comes from a real difference in data sources, not from
inconsistent architecture:

**Menu data is live-streamed; other sessions use static JSON.** The backend's
display-agent pushes menu items over SSE. Announcement and happy-hour content
comes from local JSON files that change infrequently. Self-loading is natural
for static data; shell forwarding is natural for a live stream.

**The shell holds a persistent SSE connection that survives agent swaps.** Menu
is the default agent (~95% of runtime). It is swapped out briefly for
announcement (30s) or happy-hour (45s), then swapped back. If menu owned its
own SSE connection, it would reconnect on every swap-back — introducing latency
and risking missed events during the reconnect window. The shell's persistent
connection avoids this entirely.

**The shell buffers the last content envelope as a menu item queue.** When
menu re-registers after a swap, the shell replays `lastContentRef` immediately.
This means the menu agent always has content on first render — no blank screen
while waiting for the next SSE push. The shell effectively acts as a content
queue, remembering the current menu item set across session transitions.

**The shell forwards blindly — it does not parse cards.** The shell stores and
forwards raw content envelopes without filtering by card type. Agents filter by
their declared `cardTypes` themselves. If the backend later pushes announcement
or promotion cards over SSE, any agent declaring `acceptsContent: true` would
receive them without shell changes.

---

## SSE Protocol

The backend display-agent broadcasts over `GET /v1/display/stream` (SSE).

### Event: `session` — Session Directive (future)

> **Not currently implemented.** Session switching is handled by the shell's
> local scheduler (`schedule.js`). This event type is reserved for a future
> backend-driven session control path.

When implemented, this event would tell the shell to load a different display
experience:

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

The shell would update `<iframe src>` to `session.url`. If `display.duration` is
set, the shell would auto-return to the default session after that many seconds.

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

The backend sends typed `cards` envelopes. Agents filter cards by their
declared `cardTypes`.

### Per-Card Display Override (future)

> **Not currently implemented.** Tracked in the backlog.

Individual cards would override the envelope-level `display` settings:

```json
{
  "type": "message",
  "data": { "headline": "Kitchen closing soon!" },
  "display": { "item_interval": 20 }
}
```

The session would read `card.display?.item_interval ?? envelope.display.item_interval`.

---

## Agent Protocol

All communication between the orchestrator (shell) and agents (sessions) flows
through `window.postMessage` with origin verification on both sides. Protocol
constants are defined in `lib/agent-sdk/protocol.js` — the single source of
truth shared by shell and all agents.

### Message Format

Every message carries a `source` identifier, a `type` discriminator, and an
optional `payload`:

```js
// Shell → Agent
{ source: 'gac-display-shell', type: 'content' | 'ping' | 'pause' | 'resume', payload?: {...} }

// Agent → Shell
{ source: 'gac-display-agent', type: 'register' | 'status' | 'pong', ...fields }
```

### Shell → Agent Messages

| Type | Purpose | Payload |
|------|---------|---------|
| `content` | Forward a content envelope | `{ display?, cards? }` |
| `ping` | Health check request | _(none)_ |
| `pause` | Pause playback | _(none)_ |
| `resume` | Resume playback | _(none)_ |

### Agent → Shell Messages

| Type | Purpose | Fields |
|------|---------|--------|
| `register` | Declare capabilities on mount | `capabilities: { cardTypes?, selfLoading?, acceptsContent? }` |
| `status` | Report state change | `state: 'idle'\|'playing'\|'paused'\|'error'\|'ended'`, `detail?: { total?, reason? }` |
| `pong` | Respond to health ping | _(none)_ |

### Agent Lifecycle States

| State | Meaning |
|-------|---------|
| `loading` | Iframe loading, agent not yet registered |
| `idle` | Registered but no content displayed |
| `playing` | Actively displaying content |
| `paused` | Paused by orchestrator command |
| `error` | Encountered an error (detail includes reason) |
| `ended` | Content finished (e.g., happy hour expired) |
| `unresponsive` | Failed to respond to health pings |

### Content Delivery Strategy

Sessions receive content through **exactly one** delivery path at a time:

| Context | Delivery path | SSE connection |
|---------|---------------|----------------|
| Inside shell iframe | postMessage from shell | Agent does **not** open SSE |
| Standalone (dev/debug) | Direct SSE | Agent opens its own EventSource |

Agents detect their context on mount:

```js
import { insideIframe } from '@gac/agent-sdk';
```

If `insideIframe` is true, the agent skips its own SSE connection and relies
entirely on postMessage from the shell. This prevents **duplicate event
processing** and avoids wasting the browser's limited SSE connection pool.

### postMessage Security

Both directions verify origins:

**Shell → Agent**: The shell sets `targetOrigin` to the agent's origin
(extracted from the iframe `src` URL). If the URL cannot be parsed, the message
is **not sent** (no `'*'` fallback):

```js
const sendToAgent = (type, payload) => {
    let origin;
    try { origin = new URL(sessionUrl).origin; }
    catch { return; }
    iframe.contentWindow.postMessage(
        { source: 'gac-display-shell', type, payload },
        origin
    );
};
```

**Agent → Shell**: The shell verifies that incoming messages originate
from the active agent's origin:

```js
const expectedOrigin = new URL(sessionUrlRef.current).origin;
if (e.origin !== expectedOrigin) return;
if (e.data?.source !== 'gac-display-agent') return;
```

**Agent receives**: The SDK's `onContent()` and `setupAgent()` handle origin
verification and message filtering automatically. Agents never need to
manually add `message` event listeners:

```js
import { onContent, setupAgent } from '@gac/agent-sdk';

// onContent filters to content messages only
const cleanup = onContent((envelope) => handleContent(envelope));

// setupAgent handles ping/pong, pause/resume automatically
const cleanup2 = setupAgent(capabilities, { onPause, onResume });
```

### Agent Registration Handshake

When the shell swaps `iframe.src`, there is a window where the new agent is
loading. The registration handshake ensures no content is lost:

1. **Agent registers** — on mount, the session sends `register` with its
   capabilities:

   ```js
   setupAgent(
       { cardTypes: ['menu_item'], selfLoading: false, acceptsContent: true },
       { onPause: handlePause, onResume: handleResume }
   );
   ```

   This sends a `register` message, starts the auto-pong responder, and
   wires up pause/resume handlers.

2. **Orchestrator records** — the shell stores the agent's capabilities in the
   registry and replays the last buffered content envelope immediately.

3. **Load timeout** — if the shell does not receive `register` within
   `SESSION_LOAD_TIMEOUT_MS` (10 s), it falls back to the default session
   URL and logs a warning.

```
Orchestrator (Shell)            Agent (Session iframe)
  │                                │
  │── set iframe.src ─────────────►│
  │   (clear registry, buffer)     │  loading…
  │                                │
  │◄── register { capabilities } ──│  mounted + setupAgent()
  │   (registry.register())        │
  │                                │
  │── content { payload } ────────►│  (buffered replay)
  │── content { payload } ────────►│  (live SSE events)
  │                                │
  │── ping ───────────────────────►│  (every 10s)
  │◄── pong ──────────────────────│  (auto via setupAgent)
  │                                │
  │── pause ──────────────────────►│  (orchestrator pauses)
  │◄── status { paused } ─────────│
  │── resume ─────────────────────►│  (orchestrator resumes)
  │◄── status { playing } ────────│
  │                                │
  │◄── status { playing, ... } ───│  (on content change)
  │                                │
```

### Health Monitoring

The shell pings the active agent every `PING_INTERVAL_MS` (10 s).
The agent's `setupAgent()` function automatically replies with `pong`.

If no `pong` arrives within 30 seconds (3 missed pings), the shell marks the
agent as `unresponsive`, logs a warning, and falls back to the default session.

### Agent Registry

The shell maintains an agent registry (`registry.js`) tracking:

- **url** — The active agent's URL (for identification)
- **capabilities** — Card types handled, self-loading flag, accepts-content flag
- **state** — Last reported lifecycle state (idle, playing, paused, error, ended)
- **health** — Timestamp of last pong (used for health timeout)
- **errors** — Error count and last error message

The registry provides:
- `acceptsContent()` — checks if the active agent accepts shell-forwarded content
- `getSnapshot()` — returns a safe copy for React state (used by debug overlay)

The registry is cleared whenever the shell loads a new session and populated
when the new agent sends `register`.

### Event Type Dispatch

The shell dispatches SSE events by `event_type`. Only `content` events are
handled — forwarded to the active agent if it declares `acceptsContent: true`:

```js
if (data.event_type === 'content' || data.cards || data.items)
    → store as lastContentEnvelope
    → if registry.acceptsContent() → sendToAgent('content', data)
```

Session switching is handled entirely by the local scheduler (— the shell does
**not** act on `event_type: 'session'` from the backend.

---

## Card Types

| Type          | Description                            | Status      |
|---------------|----------------------------------------|-------------|
| `menu_item`   | Menu item — image, name, price, desc   | ✅ Implemented |
| `message`     | Full-screen text announcement          | ✅ Implemented |
| `special`     | Today's special with emphasis styling  | 🔲 Planned  |
| `promotion`   | Promotional deal with optional image   | 🔲 Planned  |

Card renderer dispatch pattern (aspirational — each session currently handles
its own card types inline rather than sharing a unified renderer):

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

### `menu` — Default Session

- **Location**: `sessions/menu/`
- **Dev port**: 8504
- **Content source**: postMessage from shell (iframe) / direct SSE (standalone)
- **Content loading**: Shell-forwarded — receives menu `cards` via SSE → postMessage
- **Card type**: `menu_item`
- **Layout**: Landscape split — large image left, info panel right
- **Transition**: Horizontal slide (700ms, cubic-bezier Material ease)
- **Idle screen**: Garlic & Chives logo, "Featured dishes loading…" / "Connecting to server…"
- **Data fields**: `item_name`, `item_viet`, `price`, `description`, `category`, `image_path`, `popular`

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │                      │  SEAFOOD                     │   │
│  │                      │                              │   │
│  │      [image]         │  Honey Walnut Shrimps        │   │
│  │                      │  Tôm Walnut Mật Ong          │   │
│  │         POPULAR      │  ─────                       │   │
│  │                      │  Crispy shrimp tossed in...  │   │
│  │                      │                              │   │
│  │                      │  $13.00                      │   │
│  └──────────────────────┴──────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### `announcement` — Announcement Session

- **Location**: `sessions/announcement/`
- **Dev port**: 8505
- **Content source**: Self-loaded from `public/announcements.json`; shell postMessage as override
- **Content loading**: Hybrid — fetches local JSON on mount, also accepts postMessage
- **Card type**: `message`
- **Layout**: Centered card — headline, body, style-variant accent bar
- **Transition**: Fade (600ms)
- **Idle screen**: Garlic & Chives logo, "Waiting for announcements…"
- **Data fields**: `headline`, `body`, `style` (info | warning | promo)
- **Styles**:
  - `info` — green accent, ℹ icon, general information
  - `warning` — gold/amber accent, ⚠ icon, alerts and closing times
  - `promo` — gold→green gradient, ★ icon, specials and deals
- **Rotation**: Single message displays statically; multiple rotate at 10s interval

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              ┌───────────────────────────────┐              │
│              │                               │              │
│              │  ★  SPECIAL                   │              │
│              │                               │              │
│              │  Happy Hour Specials           │              │
│              │                               │              │
│              │  Half-price appetizers and     │              │
│              │  $5 cocktails, weekdays 3–6 PM│              │
│              │                               │              │
│              └───────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### `happy-hour` — Happy Hour Session

- **Location**: `sessions/happy-hour/`
- **Dev port**: 8506
- **Content source**: Self-loaded from `public/happy-hour.json`
- **Content loading**: Self-contained — fetches local JSON on mount (no postMessage content override)
- **Theme**: Dark (#0f0a06) with gold accents (#c6893f), distinct from light menu theme
- **Layout**: Header bar (title + countdown) above full-width card carousel
- **Card layout**: Landscape split — image left, info right (dark variant)
- **Transition**: Horizontal slide (700ms)
- **Idle screen**: Garlic & Chives logo in gold, "Happy hour specials loading…"
- **Components**:
  - `HappyHourCard` — dark-themed card with image, name, category, description, price comparison, tag badge
  - `CountdownTimer` — live HH:MM:SS countdown to configured end time; shows "ended" at zero
- **Data fields (top-level)**: `title`, `subtitle`, `end_hour`, `end_minute`, `background_image`
- **Data fields (specials)**: `name`, `category`, `description`, `price`, `original_price`, `image_path`, `tag`
- **Price display**: Original price shown with strikethrough; happy hour price in gold
- **Background**: Optional full-screen image behind dark gradient overlay

```
┌─────────────────────────────────────────────────────────────┐
│  Happy Hour                              ENDS IN            │
│  Weekdays 3–6 PM                       02:34:15            │
│                                        hr  min  sec        │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │                      │  COCKTAILS                   │   │
│  │                      │                              │   │
│  │      [image]         │  Passion Fruit Mojito        │   │
│  │                      │                              │   │
│  │         SPECIAL      │  Fresh passion fruit, mint...│   │
│  │                      │                              │   │
│  │                      │  $̶1̶3̶.̶0̶0̶  $7.00             │   │
│  └──────────────────────┴──────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### `lunch-special` — Lunch Specials Session

- **Location**: `sessions/lunch-special/`
- **Dev port**: 8507
- **Content source**: Config overlay from `public/lunch-specials.json` + menu items fetched from backend SSE
- **Content loading**: Hybrid — loads a lightweight config (item names + special prices), then opens a brief SSE connection to fetch full menu item details from the backend. Merges the two: menu item fields (image, description, category, Vietnamese name, regular price) are enriched with the config's special pricing and combo includes. SSE is closed after the first batch.
- **Theme**: Warm dark (#1a120b) with red accents (#d4473a) and gold highlights
- **Layout**: Header bar (title + countdown) above full-width card carousel
- **Card layout**: Landscape split — image left, info right (menu-style with price comparison)
- **Transition**: Horizontal slide (700ms)
- **Idle screen**: Garlic & Chives logo in red, "Lunch specials loading…" → "Fetching menu data…"
- **Components**:
  - `LunchSpecialCard` — warm-themed card with image, Vietnamese name, category, description, combo includes, price comparison, tag badge
  - `CountdownTimer` — live HH:MM:SS countdown to lunch end time
- **Config fields** (`lunch-specials.json`):
  - Top-level: `title`, `subtitle`, `end_hour`, `end_minute`
  - Per-special: `item_name` (must match backend menu item name), `price` (lunch special price), `tag`, `includes`
- **Merged card fields** (after SSE lookup): `item_name`, `item_viet`, `category`, `description`, `image_path`, `original_price` (regular menu price), `price` (lunch special), `tag`, `includes`
- **Data flow**: Config specials specify *which* menu items are on special and at *what price*. All other details (image, description, Vietnamese name, category, regular price) come from the live menu database — so cards stay current without config updates when menu data changes.
- **Combo highlight**: `includes` field displays what's bundled (e.g., "Pho + Spring Roll + Iced Tea")

```
┌─────────────────────────────────────────────────────────────┐
│  Lunch Specials                       LUNCH ENDS IN         │
│  Monday–Friday 11 AM – 3 PM            01:22:45            │
│                                        hr  min  sec        │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │                      │  COMBO                       │   │
│  │                      │                              │   │
│  │      [image]         │  Phở Combo                   │   │
│  │                      │  Phở Đặc Biệt Combo         │   │
│  │       BEST SELLER    │  ───                         │   │
│  │                      │  Choice of beef pho with...  │   │
│  │                      │  Includes: Pho + Spring Roll │   │
│  │                      │  $̶1̶7̶.̶9̶0̶  $12.95             │   │
│  └──────────────────────┴──────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Future Sessions

| Session | Description | Status |
|---------|-------------|--------|
| `events` | Upcoming events calendar/list driven by `events.json` | 🔲 Planned |

---

## Shell Behavior (Orchestrator)

```
Startup
  └─ Load default agent (menu) into iframe
  └─ Connect to SSE (for menu content from backend)
  └─ Start session scheduler (reads /schedule.json)
  └─ Start health ping interval (every 10s)
  └─ Initialize agent registry (empty)
  └─ Initialize lastContentEnvelope = null
  └─ Initialize sessionReady = false

On agent message { type: 'register', capabilities }
  └─ Set sessionReady = true
  └─ registry.register(url, capabilities)
  └─ Cancel load-timeout timer
  └─ If lastContentEnvelope exists && registry.acceptsContent()
     → forward it immediately (replay)

On agent message { type: 'status', state, detail }
  └─ registry.updateState(state, detail)

On agent message { type: 'pong' }
  └─ registry.recordPong()

On scheduler fires (url, duration)
  └─ If url === current agent → skip (no-op, reset return timer only)
  └─ Set sessionReady = false
  └─ registry.clear()
  └─ Update iframe src to url
  └─ Start load-timeout timer (SESSION_LOAD_TIMEOUT_MS)
  └─ Schedule auto-return timer (duration seconds)

On SSE event (content, cards, or items)
  └─ Store as lastContentEnvelope
  └─ If sessionReady && registry.acceptsContent()
     → sendToAgent('content', data)

On health ping interval
  └─ If sessionReady → sendToAgent('ping')
  └─ If !registry.isHealthy() → mark unresponsive, reload default agent

On agent load-timeout
  └─ If sessionReady still false → restore iframe src to default agent

On agent auto-return timeout
  └─ Restore iframe src to default agent URL
```

### Session Scheduler

The shell includes a local scheduler (`schedule.js`) that reads
`/schedule.json` and controls when non-default sessions are shown.
This decouples session timing from the backend — the backend provides
menu content; the shell decides when to show announcements, happy hour, etc.

The scheduler supports three rule types:

| Type | Behavior |
|------|----------|
| `interval` | Fire every N minutes, all day |
| `windowed` | Fire every N minutes within a time window (HH:MM–HH:MM) |
| `fixed` | Fire at exact wall-clock times |

All rules support an optional `days` filter (`["mon","tue",…]`).

The scheduler checks all rules every 30 seconds. When a rule fires,
the shell swaps the iframe to the session URL. After `duration_seconds`,
the shell returns to the default menu session. Only one session switch
fires per check cycle.

See `shell/public/schedule.json` for the current configuration and
`docs/guides/scheduling.md` for the configuration reference.

---

## Project Structure

```
GAC-display/
├── DESIGN.md             ← this file
├── README.md             ← quick start
├── .gitignore
├── lib/
│   └── agent-sdk/        ← shared agent protocol SDK
│       ├── protocol.js   ← message types, agent states (single source of truth)
│       └── index.js      ← setupAgent, reportStatus, onContent, getImageUrl
├── shell/                ← orchestrator: SSE subscriber, scheduler, agent lifecycle
│   ├── package.json
│   ├── vite.config.js    ← @gac/agent-sdk alias → ../lib/agent-sdk
│   ├── index.html
│   ├── .env              ← VITE_SESSION_MENU_URL
│   ├── public/
│   │   └── schedule.json ← session scheduling config
│   └── src/
│       ├── main.jsx
│       ├── App.jsx       ← SSE, iframe, agent messaging, debug overlay
│       ├── App.css       ← Fullscreen iframe + status/debug styles
│       ├── schedule.js   ← session scheduler (interval/windowed/fixed)
│       ├── protocol.js   ← re-exports from lib/agent-sdk/protocol.js
│       └── registry.js   ← agent registry (capabilities, health, state, errors)
├── sessions/
│   ├── menu/             ← agent: rotating menu item cards
│   │   ├── package.json
│   │   ├── vite.config.js  ← @gac/agent-sdk alias → ../../lib/agent-sdk
│   │   ├── index.html
│   │   ├── .env          ← VITE_SHELL_ORIGIN
│   │   └── src/
│   │       ├── main.jsx
│   │       ├── App.jsx   ← carousel logic, pause/resume
│   │       ├── App.css   ← light theme, brand variables
│   │       ├── components/
│   │       │   ├── MenuItemCard.jsx
│   │       │   └── MenuItemCard.css
│   │       └── services/
│   │           └── api.js  ← thin re-export from @gac/agent-sdk
│   ├── announcement/     ← agent: full-screen text announcements
│   │   ├── package.json
│   │   ├── vite.config.js  ← @gac/agent-sdk alias
│   │   ├── index.html
│   │   ├── .env
│   │   ├── public/
│   │   │   └── announcements.json  ← announcement content
│   │   └── src/
│   │       ├── main.jsx
│   │       ├── App.jsx   ← self-loading carousel, pause/resume
│   │       ├── App.css   ← light theme (matches menu)
│   │       ├── components/
│   │       │   ├── MessageCard.jsx
│   │       │   └── MessageCard.css
│   │       └── services/
│   │           └── api.js  ← thin re-export from @gac/agent-sdk
│   └── happy-hour/       ← agent: specials with countdown timer
│       ├── package.json
│       ├── vite.config.js  ← @gac/agent-sdk alias
│       ├── index.html
│       ├── .env
│       ├── public/
│       │   └── happy-hour.json  ← specials content + timing
│       └── src/
│           ├── main.jsx
│           ├── App.jsx   ← self-loading, header + carousel, pause/resume
│           ├── App.css   ← dark theme with gold accents
│           ├── components/
│           │   ├── HappyHourCard.jsx
│           │   ├── HappyHourCard.css
│           │   ├── CountdownTimer.jsx
│           │   └── CountdownTimer.css
│           └── services/
│               └── api.js  ← thin re-export from @gac/agent-sdk
│   └── lunch-special/    ← agent: lunch combos with countdown timer
│       ├── package.json
│       ├── vite.config.js  ← @gac/agent-sdk alias
│       ├── index.html
│       ├── public/
│       │   └── lunch-specials.json  ← lunch combo content + timing
│       └── src/
│           ├── main.jsx
│           ├── App.jsx   ← self-loading, header + carousel, pause/resume
│           ├── App.css   ← warm dark theme with red accents
│           ├── components/
│           │   ├── LunchSpecialCard.jsx
│           │   ├── LunchSpecialCard.css
│           │   ├── CountdownTimer.jsx
│           │   └── CountdownTimer.css
│           └── services/
│               └── api.js  ← thin re-export from @gac/agent-sdk
├── test/
│   └── mock-sse.mjs      ← mock SSE server for testing
└── docs/
    ├── sessions.md        ← session implementation reference
    └── guides/
        ├── scheduling.md      ← schedule.json configuration
        ├── announcements.md   ← announcement content management
        ├── happy-hour.md      ← happy hour specials + countdown
        └── adding-sessions.md ← how to create new session types
```

---

## Configuration

### Environment Variables (`.env` files)

| Variable               | Location            | Default                      | Description                        |
|------------------------|----------------------|------------------------------|------------------------------------|
| `VITE_SESSION_MENU_URL`| `shell/.env`         | `http://localhost:8504`      | Default session URL (dev)          |
| `VITE_SHELL_ORIGIN`   | `sessions/*/.env`     | `http://localhost:8503`      | Expected shell origin for postMessage |

### Static Configuration Files

| File | Location | Description |
|------|----------|-------------|
| `schedule.json` | `shell/public/` | Session scheduling rules (interval, windowed, fixed) |
| `announcements.json` | `sessions/announcement/public/` | Announcement messages array |
| `happy-hour.json` | `sessions/happy-hour/public/` | Happy hour specials, timing, background |
| `lunch-specials.json` | `sessions/lunch-special/public/` | Lunch combo specials and timing |

---

## Development Setup

```bash
# Terminal 1 — backend (provides menu data + images)
cd ../GAC-Concierge && ./gac_service.sh start

# Terminal 2 — menu session
cd sessions/menu && npm install && npm run dev      # :8504

# Terminal 3 — announcement session
cd sessions/announcement && npm install && npm run dev  # :8505

# Terminal 4 — happy-hour session
cd sessions/happy-hour && npm install && npm run dev    # :8506

# Terminal 5 — lunch-special session
cd sessions/lunch-special && npm install && npm run dev # :8507

# Terminal 6 — shell
cd shell && npm install && npm run dev              # :8503
```

Open `http://localhost:8503` — the shell loads the menu session by default.
The scheduler will switch to announcements and happy hour based on
`schedule.json`.

### Testing without backend

```bash
HOST=192.168.10.3 node test/mock-sse.mjs    # :8000
```

The mock server cycles through menu content, session switches, and
announcement content on a loop.

---

## Open Questions / Backlog

### Completed

- [x] **Duplicate event fix**: Sessions detect iframe context and skip direct SSE when embedded
- [x] **Session ready handshake**: Session posts `ready` on mount; shell buffers and replays content
- [x] **Load timeout fallback**: Shell falls back to default session after `SESSION_LOAD_TIMEOUT_MS`
- [x] **postMessage targetOrigin**: Shell sends with explicit session origin; sessions verify `e.origin`
- [x] **event_type dispatch**: Shell dispatches on `data.event_type` with cards-based detection
- [x] **Stale closure fix**: Shell uses `sessionUrlRef` to avoid stale `sessionUrl` in useEffect closures
- [x] **Same-session skip**: Shell skips `sessionReady` reset when `loadSession` receives current URL
- [x] **Announcement session**: Self-contained session with `announcements.json`, three message styles
- [x] **Happy-hour session**: Dark-themed session with specials carousel and countdown timer
- [x] **Session scheduler**: Shell-local scheduler with interval, windowed, and fixed rule types
- [x] **Documentation**: Guides for scheduling, announcements, happy hour, and adding new sessions
- [x] **Agent protocol**: Typed message protocol with `register`, `status`, `pong` from agents
- [x] **Agent registration**: Sessions declare capabilities (cardTypes, selfLoading, acceptsContent)
- [x] **Health monitoring**: Shell pings agents every 10s; auto-recovery on unresponsive
- [x] **Agent registry**: Shell tracks capabilities, state, health, and errors of active agent
- [x] **Status reporting**: Sessions report lifecycle state (idle, playing, paused, error, ended)
- [x] **Shared agent SDK**: `lib/agent-sdk/` — single source of truth for protocol and SDK functions
- [x] **Pause/resume protocol**: Orchestrator sends `pause`/`resume`, agents handle via `setupAgent()` callbacks
- [x] **Capabilities-based routing**: Shell only forwards content to agents declaring `acceptsContent: true`
- [x] **Debug overlay**: Dev-mode overlay showing agent state, card types, and error count

### Backend Tasks (GAC-Concierge)

- [ ] Add `event_type` field to all SSE events
- [ ] Implement `event_type: 'session'` SSE directive for backend-driven session control

### Frontend Improvements

- [ ] Add React error boundaries to all sessions (prevent blank screen on render crash)
- [ ] Implement per-card display override (`card.display.item_interval`)
- [ ] Add periodic content refresh for self-loading sessions (announcement, happy-hour)
- [ ] Build unified `CardRenderer` component shared across sessions
- [ ] Add `special` and `promotion` card types
- [ ] Add `events` session (upcoming events calendar)

### Infrastructure

- [ ] Add health/heartbeat endpoint to shell for remote monitoring
- [ ] Production build pipeline and kiosk deployment guide
- [ ] Automate schedule.json / announcements.json content updates without restart

### Infrastructure / Ops

- [ ] Decide on production serving strategy (FastAPI static mounts vs. nginx reverse proxy)
- [ ] Ensure HTTP/2 in production to avoid 6-connection SSE limit per domain on HTTP/1.1
- [ ] Add `gac_service.sh` entries for GAC-display shell and all sessions
- [ ] Add real images to happy-hour specials

### Future Sessions

- [ ] `events` — upcoming events calendar/list driven by `events.json`
