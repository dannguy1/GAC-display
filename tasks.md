# GAC-Display — Implementation Tasks

> Detailed, actionable tasks derived from DESIGN.md backlog.
> Each task is self-contained: a subagent can pick it up and implement it
> without reading the full codebase.

---

## Task 1 — Session iframe context detection (duplicate event fix)

**Status**: Done
**Priority**: 1 (active bug)
**Depends on**: None
**Files to modify**: `sessions/menu/src/App.jsx`, `sessions/menu/src/services/api.js`

### Problem

When the menu session runs inside the shell iframe, both delivery paths fire simultaneously:
- The shell receives SSE → forwards via postMessage → `handleEnvelope()` fires
- The session's own direct SSE connection → same event → `handleEnvelope()` fires again

Every content push is processed twice, resetting the carousel queue each time.

### Required changes

#### `sessions/menu/src/services/api.js`

Export a context-detection constant:

```js
/** True when this session is running inside the shell iframe. */
export const insideIframe = window.self !== window.top;
```

No other changes to this file in this task.

#### `sessions/menu/src/App.jsx`

In the `useEffect` that sets up data sources (currently lines ~67–82):

**Current behavior**: Always opens direct SSE via `openDisplayStream()` AND registers `onShellMessage()`.

**New behavior**:
```js
import { openDisplayStream, onShellMessage, insideIframe } from './services/api';

useEffect(() => {
    let es = null;
    let cleanupMsg = null;

    if (insideIframe) {
        // Iframe mode: postMessage only — no SSE
        cleanupMsg = onShellMessage((envelope) => {
            setConnected(true);
            handleEnvelope(envelope);
        });
    } else {
        // Standalone mode: direct SSE
        es = openDisplayStream(
            (envelope) => { setConnected(true); handleEnvelope(envelope); },
            () => setConnected(false)
        );
        es.addEventListener('ping', () => setConnected(true));
    }

    return () => {
        es?.close();
        cleanupMsg?.();
        if (timerRef.current) clearInterval(timerRef.current);
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
}, [handleEnvelope]);
```

### Acceptance criteria

- When loaded at `http://localhost:8504` (standalone), session opens SSE. No postMessage listener.
- When loaded inside the shell iframe at `:8503`, session does NOT open SSE. Listens for postMessage only.
- Carousel advances normally without duplicate resets.

---

## Task 2 — Session ready handshake

**Status**: Done
**Priority**: 2
**Depends on**: Task 1 (uses `insideIframe`)
**Files to modify**: `sessions/menu/src/App.jsx`, `sessions/menu/src/services/api.js`, `shell/src/App.jsx`

### Problem

When the shell swaps `iframe.src`, content events arrive before the new session is mounted. They are forwarded to an unready iframe and lost silently.

### Required changes

#### `sessions/menu/src/services/api.js`

Export `SHELL_ORIGIN` (already defined but not exported):

```js
export const SHELL_ORIGIN = import.meta.env.VITE_SHELL_ORIGIN || 'http://localhost:8503';
```

Add a `postReady` helper:

```js
/** Notify the shell that this session is mounted and ready for content. */
export const postReady = () => {
    window.parent.postMessage(
        { source: 'gac-display-session', type: 'ready' },
        SHELL_ORIGIN
    );
};
```

#### `sessions/menu/src/App.jsx`

At the end of the `useEffect` setup (after registering the postMessage listener in iframe mode), post the ready signal:

```js
if (insideIframe) {
    cleanupMsg = onShellMessage((envelope) => { /* ... */ });
    postReady();  // ← add this line
}
```

Import `postReady` from `./services/api`.

#### `shell/src/App.jsx`

Add state/refs for content buffering and session readiness:

```js
const lastContentRef = useRef(null);      // most recent content envelope
const sessionReadyRef = useRef(false);     // has active session sent 'ready'?
const loadTimeoutRef = useRef(null);       // load-timeout timer
```

Add a `message` event listener in the main `useEffect` to handle `ready` from sessions:

```js
const handleSessionMessage = (e) => {
    if (e.data?.source !== 'gac-display-session') return;
    if (e.data.type === 'ready') {
        sessionReadyRef.current = true;
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
        // Replay buffered content
        if (lastContentRef.current) {
            iframeRef.current?.contentWindow?.postMessage(
                { source: 'gac-display-shell', payload: lastContentRef.current },
                new URL(sessionUrl).origin
            );
        }
    }
};
window.addEventListener('message', handleSessionMessage);
```

Clean up in the effect's return: `window.removeEventListener('message', handleSessionMessage);`

Update the content forwarding block: store envelope in `lastContentRef.current`, and only forward if `sessionReadyRef.current` is true:

```js
} else if (data.event_type === 'content' || data.items || data.cards) {
    lastContentRef.current = data;
    if (sessionReadyRef.current) {
        iframeRef.current?.contentWindow?.postMessage(
            { source: 'gac-display-shell', payload: data },
            new URL(sessionUrl).origin
        );
    }
}
```

Update `loadSession` to reset readiness and start a load timeout:

```js
const loadSession = (url, durationSecs) => {
    if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

    sessionReadyRef.current = false;
    setSessionUrl(url);

    // Load timeout — fall back to default if session never signals ready
    loadTimeoutRef.current = setTimeout(() => {
        if (!sessionReadyRef.current) {
            console.warn(`Session at ${url} did not signal ready within ${SESSION_LOAD_TIMEOUT_MS}ms, falling back`);
            setSessionUrl(DEFAULT_SESSION_URL);
        }
    }, SESSION_LOAD_TIMEOUT_MS);

    if (durationSecs > 0) {
        returnTimerRef.current = setTimeout(() => {
            setSessionUrl(DEFAULT_SESSION_URL);
        }, durationSecs * 1000);
    }
};
```

### Acceptance criteria

- Shell receives `ready` from iframe → replays last buffered content immediately.
- If no `ready` arrives within 10 s, shell reverts to default session URL.
- No content is lost during session swap.

---

## Task 3 — postMessage targetOrigin security

**Status**: Done
**Priority**: 3
**Depends on**: Task 2 (uses `sessionUrl` for origin extraction)
**Files to modify**: `shell/src/App.jsx`, `sessions/menu/src/services/api.js`

### Problem

Shell uses `'*'` as postMessage targetOrigin. Sessions don't verify `e.origin`.

### Required changes

#### `shell/src/App.jsx`

Replace all `'*'` targetOrigin calls with the session's actual origin:

```js
new URL(sessionUrl).origin
```

This applies to both the content forwarding in `es.onmessage` and the replay in `handleSessionMessage`. (If Task 2 is done first, these call sites already use `new URL(sessionUrl).origin` and this task is a no-op for the shell.)

#### `sessions/menu/src/services/api.js`

Update `onShellMessage` to verify `e.origin`:

```js
export const onShellMessage = (onContent) => {
    const handler = (e) => {
        if (e.origin !== SHELL_ORIGIN) return;          // ← add origin check
        if (e.data?.source !== 'gac-display-shell') return;
        const payload = e.data.payload;
        if (payload?.items || payload?.cards) onContent(payload);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
};
```

`SHELL_ORIGIN` is already defined in this file. It must be exported (done in Task 2) so tests can reference it.

### Acceptance criteria

- Shell never sends postMessage with `'*'`.
- Session ignores messages from unexpected origins.
- Full stack still works in dev (`:8503` → `:8504`).

---

## Task 4 — Robust event_type dispatch in shell

**Status**: Done
**Priority**: 4
**Depends on**: None (independent, but apply after Task 2 to avoid merge conflicts)
**Files to modify**: `shell/src/App.jsx`

### Problem

Shell partially uses `event_type` but also relies on key-sniffing. The dispatch logic should be cleaner.

### Required changes

Refactor the `es.onmessage` handler to use a clear dispatch chain:

```js
es.onmessage = (e) => {
    setConnected(true);
    try {
        const data = JSON.parse(e.data);
        const eventType = data.event_type;

        // Session directive
        if (eventType === 'session' && data.session?.url) {
            loadSession(data.session.url, data.session.display?.duration ?? 0);
            return;
        }

        // Content event (explicit or legacy)
        if (eventType === 'content' || data.items || data.cards) {
            lastContentRef.current = data;
            if (sessionReadyRef.current) {
                iframeRef.current?.contentWindow?.postMessage(
                    { source: 'gac-display-shell', payload: data },
                    new URL(sessionUrl).origin
                );
            }
            return;
        }

        // Unknown event_type — ignore silently
    } catch (_) {}
};
```

Key points:
- `event_type` is checked first via named `const`.
- Legacy `data.items || data.cards` remains as fallback.
- Each branch returns early — no else-if chain.

### Acceptance criteria

- `event_type: "session"` triggers session swap.
- `event_type: "content"` forwards to session.
- Legacy envelopes (no `event_type`, but have `items`/`cards`) still forward correctly.
- Unknown events are ignored without error.

---

## Task 5 — Update sessions.md Data Source description for menu session

**Status**: Done
**Priority**: 5
**Depends on**: Task 1 (implements the behavior this documents)
**Files to modify**: `DESIGN.md`

### Required changes

Update the `menu` session description under `## Sessions` to reflect the new behavior:

**Current**:
```
- **Data source**: Direct SSE + postMessage fallback
```

**New**:
```
- **Data source**: postMessage from shell (iframe) / direct SSE (standalone)
```

### Acceptance criteria

- DESIGN.md Sessions section accurately reflects implemented behavior.

---

## Task Dependency Graph

```
Task 1 (iframe detection)
  │
  ├──► Task 2 (ready handshake) ──► Task 3 (targetOrigin security)
  │
  └──► Task 5 (docs update)

Task 4 (event_type dispatch) — independent, apply after Task 2
```

## Execution Order

1. **Task 1** — Iframe detection + SSE dedup
2. **Task 2** — Ready handshake + content buffering + load timeout
3. **Task 3** — postMessage targetOrigin security
4. **Task 4** — event_type dispatch cleanup
5. **Task 5** — Documentation alignment
