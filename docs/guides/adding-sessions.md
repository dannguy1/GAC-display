## Adding a New Session (Agent)

A session is a **specialized agent** — a standalone web page the shell
orchestrator loads in a fullscreen iframe. Each agent owns its own content,
styling, and data loading. The shell controls when it appears and monitors
its health.

---

## Quick Start

Copy an existing session as a starting point:

```bash
cp -r sessions/announcement sessions/my-session
cd sessions/my-session
```

Then modify these files:

| File | Change |
|------|--------|
| `package.json` | Update `name` and dev server port |
| `vite.config.js` | Update `server.port` and ensure `@gac/agent-sdk` alias |
| `.env` | Set `VITE_SHELL_ORIGIN` to match your shell URL |
| `src/services/api.js` | Thin re-export from `@gac/agent-sdk` |
| `public/` | Add any static data files your session needs |
| `src/App.jsx` | Implement your display logic |
| `src/components/` | Add your card/display components |

---

## Requirements

Every session must implement these behaviors:

### Vite Configuration

Add the `@gac/agent-sdk` alias to your `vite.config.js`:

```js
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@gac/agent-sdk': resolve(__dirname, '../../lib/agent-sdk'),
    },
  },
  // ... rest of config
});
```

### Service API (thin re-export)

Make `src/services/api.js` a thin re-export from the shared SDK:

```js
export { insideIframe, setupAgent, reportStatus, onContent, getImageUrl } from '@gac/agent-sdk';
```

Include only the functions your session needs.

### Fullscreen Layout

```css
html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

### Iframe Detection

Detect whether the session runs standalone or inside the shell:

```js
import { insideIframe } from './services/api';
```

### Agent Registration (iframe mode)

When inside the shell, register as an agent on mount. Declare capabilities
and wire up pause/resume handlers:

```js
import { insideIframe, setupAgent, reportStatus } from './services/api';

if (insideIframe) {
  const cleanup = setupAgent(
    {
      cardTypes: ['my_card_type'],  // card types this agent handles
      selfLoading: true,             // loads its own data
      acceptsContent: false,         // does not need shell-forwarded content
    },
    {
      onPause: () => { pausedRef.current = true; },
      onResume: () => { pausedRef.current = false; },
    }
  );
  // cleanup() removes listeners on unmount
}
```

`setupAgent` sends a `register` message, starts an auto-pong responder
for health checks, and wires up pause/resume handling.

### Status Reporting

Report lifecycle state changes so the orchestrator can track agent health:

```js
// After loading content successfully
reportStatus('playing', { total: items.length });

// When paused by orchestrator
reportStatus('paused');

// On error
reportStatus('error', { reason: 'Failed to load data' });

// When content is exhausted
reportStatus('ended');
```

### Idle State

Display a meaningful loading/idle screen when no content is available
yet. Users should never see a blank page.

---

## Content Loading Patterns

Sessions can load content in different ways depending on their needs.

### Self-Contained (recommended for simple sessions)

Load data from a local JSON file in `public/`:

```js
fetch('/my-data.json')
  .then(r => r.json())
  .then(data => renderContent(data));
```

This is how the announcement session works. No backend dependency.

### Shell-Forwarded (for backend-driven content)

Listen for content the shell forwards from the SSE stream using `onContent()`:

```js
import { onContent, insideIframe, setupAgent, reportStatus } from './services/api';

if (insideIframe) {
  onContent((envelope) => {
    // Support both typed cards and legacy flat items from backend
    let items;
    if (envelope.cards) {
      items = envelope.cards.filter(c => c.type === 'my_type').map(c => c.data);
    } else if (envelope.items) {
      items = envelope.items;
    } else {
      items = [];
    }
    renderContent(items);
    reportStatus('playing', { total: items.length });
  });
  setupAgent(
    { cardTypes: ['my_type'], selfLoading: false, acceptsContent: true },
    { onPause: handlePause, onResume: handleResume }
  );
}
```

This is how the menu session works.

### Hybrid

Load local defaults, then accept shell overrides. The announcement
session uses this pattern — it loads `announcements.json` immediately,
but also listens for postMessage in case the shell sends updated content.

---

## Port Assignment

Each session needs a unique dev server port. Current assignments:

| Session | Port |
|---------|------|
| Menu | 8504 |
| Announcement | 8505 |
| Happy Hour | 8506 |

Pick the next available port for new sessions (8507, 8508, etc.).

Update in two places:

**`package.json`:**

```json
"scripts": {
  "dev": "vite --port 8506"
}
```

**`vite.config.js`:**

```js
server: {
  port: 8506,
  host: '0.0.0.0',
}
```

---

## Environment Variables

Create a `.env` file in your session directory:

```
VITE_SHELL_ORIGIN=http://192.168.10.3:8503
```

This is used for postMessage origin verification. The value must match
the shell's URL exactly (protocol + host + port).

## Vite Proxy (optional)

If your session needs to reach the backend directly (standalone mode),
add proxy rules in `vite.config.js`:

```js
proxy: {
  '/v1': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
}
```

---

## Registering with the Scheduler

Add your session to the shell's schedule config:

**`shell/public/schedule.json`:**

```json
{
  "sessions": {
    "announcement": "http://192.168.10.3:8505",
    "my-session":   "http://192.168.10.3:8506"
  },
  "schedule": [
    {
      "session": "my-session",
      "type": "interval",
      "every_minutes": 15,
      "duration_seconds": 45
    }
  ]
}
```

See the [Scheduling Guide](scheduling.md) for all schedule rule options.

---

## Testing

### Standalone

```bash
cd sessions/my-session
npm install && npm run dev
```

Open `http://localhost:8506` directly. The session should load its
own data and display content without the shell.

### In Shell

Start all services and open the shell URL. The scheduler will
activate your session at the configured times. Verify:

- Session loads in the iframe
- Agent registration completes (no load timeout warning in console)
- Content displays correctly
- Shell returns to menu after `duration_seconds`

---

## Checklist

- [ ] Unique port configured in `package.json` and `vite.config.js`
- [ ] `@gac/agent-sdk` alias added in `vite.config.js`
- [ ] `services/api.js` is a thin re-export from `@gac/agent-sdk`
- [ ] `.env` file with `VITE_SHELL_ORIGIN`
- [ ] `insideIframe` detection implemented
- [ ] `setupAgent()` called on mount in iframe mode with capabilities + pause/resume
- [ ] `reportStatus()` called on lifecycle changes
- [ ] Idle/loading state renders when no content available
- [ ] Content loads (self-contained, shell-forwarded, or hybrid)
- [ ] Fullscreen layout with no scrollbars
- [ ] Registered in `shell/public/schedule.json`
- [ ] Works standalone at `http://localhost:<port>`
- [ ] Works inside shell with correct session switching
