# Building New Sessions

A session is a self-contained web page that renders display content.
It is loaded by the shell into a fullscreen `<iframe>`.

## Minimal Requirements

A session page must:
1. Fill the full viewport (`width: 100vw; height: 100vh`)
2. Handle content gracefully when no data has arrived yet (idle/loading state)
3. Accept content from **at least one** of the two delivery mechanisms below

## Content Delivery

### Option A — Direct SSE (recommended for standalone use)

```js
import { openDisplayStream } from './services/api';

openDisplayStream((envelope) => {
  const { display, cards, items } = envelope;
  // render cards/items
});
```

### Option B — postMessage from shell (automatic when inside iframe)

```js
window.addEventListener('message', (e) => {
  if (e.data?.source !== 'gac-display-shell') return;
  const envelope = e.data.payload;
  // render envelope.cards / envelope.items
});
```

Both can be active simultaneously. Direct SSE takes effect when running
standalone; postMessage takes effect when loaded inside the shell iframe.

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

> Legacy: `items` (flat array of raw menu objects) is also supported
> during migration. Prefer `cards` in new sessions.

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
3. Implement your card renderer(s)
4. Register the session URL in the display-agent or send a `session` directive

## Session Directive (from display-agent)

To trigger the shell to load your session:

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

If `duration` is set, the shell auto-returns to the default (menu) session
after that many seconds.
