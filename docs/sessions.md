# Building New Sessions (Agents)

A session is a **specialized agent** — a self-contained web page that renders
display content. It is loaded by the shell (orchestrator) into a fullscreen
`<iframe>`.

## Minimal Requirements

A session agent must:
1. Fill the full viewport (`width: 100vw; height: 100vh`)
2. Handle content gracefully when no data has arrived yet (idle/loading state)
3. Detect its context and use the correct delivery path (see below)
4. Register with the shell via `setupAgent()` when inside the iframe
5. Report status changes via `reportStatus()`
6. Handle `pause` and `resume` commands from the orchestrator

## Shared Agent SDK

All agent protocol logic lives in `lib/agent-sdk/`. Sessions import via the
`@gac/agent-sdk` Vite alias. Each session's `services/api.js` is a thin
re-export:

```js
export { insideIframe, setupAgent, reportStatus, onContent, getImageUrl } from '@gac/agent-sdk';
```

**Never duplicate protocol logic in session code.** Always import from the SDK.

## Content Delivery

Sessions use **exactly one** delivery path depending on context:

```js
import { insideIframe } from '@gac/agent-sdk';
```

### Standalone mode (`insideIframe === false`)

Connect directly to SSE:

```js
import { openDisplayStream } from '@gac/agent-sdk';

openDisplayStream(SSE_URL, (envelope) => {
  const { display, cards } = envelope;
  // render cards
});
```

### Iframe mode (`insideIframe === true`)

Receive content from the shell via the SDK's `onContent()` helper. **Do not**
open a direct SSE connection.

```js
import { onContent } from '@gac/agent-sdk';

const cleanup = onContent((envelope) => {
  // Support both typed cards envelope and legacy flat items from backend
  let items;
  if (envelope.cards) {
    items = envelope.cards.filter(c => c.type === 'menu_item').map(c => c.data);
  } else if (envelope.items) {
    items = envelope.items;
  }
  // render items
});
```

`onContent()` handles origin verification and source filtering automatically.

### Agent Registration (required for iframe mode)

After mounting, register with the orchestrator using `setupAgent()`. This
declares capabilities, starts the auto-pong responder, and wires up
pause/resume handlers:

```js
import { insideIframe, setupAgent, reportStatus } from '@gac/agent-sdk';

if (insideIframe) {
  const cleanup = setupAgent(
    {
      cardTypes: ['menu_item'],   // card types this agent handles
      selfLoading: false,          // whether it loads its own data
      acceptsContent: true,        // whether it accepts shell-forwarded content
    },
    {
      onPause: () => { pausedRef.current = true; },
      onResume: () => { pausedRef.current = false; },
    }
  );
}
```

The shell buffers the latest content envelope and replays it on registration.

Report state changes so the orchestrator can monitor agent health:

```js
reportStatus('playing', { total: items.length }); // content active
reportStatus('paused');                             // paused by orchestrator
reportStatus('error', { reason: 'Load failed' });  // error state
reportStatus('ended');                              // content exhausted
```

> **Why not both?** Running both SSE and postMessage simultaneously causes every
> content event to be processed twice (the shell forwards the same event the
> session already received via SSE), resetting the carousel. It also wastes the
> browser's 6-connection SSE limit on HTTP/1.1.

## Envelope Format

```json
{
  "event_type": "content",
  "display": {
    "item_interval": 8
  },
  "cards": [
    { "type": "menu_item", "data": { ... } },
    { "type": "message",   "data": { ... } }
  ]
}
```

Agents filter cards by their declared `cardTypes`.

## Card Types

| `type`      | `data` fields                                                   |
|-------------|------------------------------------------------------------------|
| `menu_item` | `item_name`, `price`, `description`, `image_path`, `category`, `item_viet`, `popular` |
| `message`   | `headline`, `body`, `style` (info/warning/promo)                |
| `special`   | `title`, `description`, `image_path`, `valid_until`             |
| `promotion` | `title`, `description`, `image_path`, `valid_until`             |

## Creating a New Session

1. Copy `sessions/menu/` as a starting point
2. Change the port in `package.json` and `vite.config.js`
3. Add `@gac/agent-sdk` alias in `vite.config.js`
4. Make `services/api.js` a thin re-export from `@gac/agent-sdk`
5. Implement `setupAgent()` with capabilities + pause/resume handlers
6. Report status via `reportStatus()`
7. Add to `shell/public/schedule.json`

See `docs/guides/adding-sessions.md` for a detailed walkthrough.
