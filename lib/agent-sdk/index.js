/**
 * GAC-Display Agent SDK
 *
 * Shared library for session agents. Provides:
 *  - Agent registration with capability declaration
 *  - Automatic health-ping responses
 *  - Status reporting to the orchestrator
 *  - Content message listener with type filtering
 *  - Pause/resume handling
 *
 * Usage:
 *   import { setupAgent, reportStatus, onContent, insideIframe } from '@gac/agent-sdk';
 */

export { AGENT_SOURCE, SHELL_SOURCE, ShellMsg, AgentMsg, AgentState } from './protocol.js';

// ── Environment ──────────────────────────────────────────────────────

/** Expected shell origin for postMessage security. */
export const SHELL_ORIGIN =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SHELL_ORIGIN)
    || 'http://localhost:8503';

/** True when this page is running inside the shell iframe. */
export const insideIframe = window.self !== window.top;

// ── Helpers ──────────────────────────────────────────────────────────

/** Send a message to the shell orchestrator. */
const sendToShell = (type, fields = {}) => {
    if (!insideIframe) return;
    window.parent.postMessage(
        { source: 'gac-display-agent', type, ...fields },
        SHELL_ORIGIN
    );
};

/** Verify an incoming message is from the shell. */
const isShellMessage = (e) =>
    e.origin === SHELL_ORIGIN &&
    e.data?.source === 'gac-display-shell';

// ── Public API ───────────────────────────────────────────────────────

/**
 * Register this session as an agent with the shell orchestrator.
 *
 * @param {Object} capabilities
 * @param {string[]} capabilities.cardTypes  - Card types this agent renders
 * @param {boolean}  capabilities.selfLoading - Loads its own data (true) or depends on shell content (false)
 * @param {boolean}  capabilities.acceptsContent - Accepts content postMessages from shell
 * @param {Object}   [handlers]
 * @param {Function} [handlers.onPause]  - Called when orchestrator sends pause
 * @param {Function} [handlers.onResume] - Called when orchestrator sends resume
 * @returns {Function} cleanup — call on unmount to remove listeners
 */
export const setupAgent = (capabilities, handlers = {}) => {
    if (!insideIframe) return () => {};

    // Send registration
    sendToShell('register', { capabilities });

    // Handle orchestrator messages (ping, pause, resume)
    const handler = (e) => {
        if (!isShellMessage(e)) return;
        switch (e.data.type) {
            case 'ping':
                sendToShell('pong');
                break;
            case 'pause':
                handlers.onPause?.();
                break;
            case 'resume':
                handlers.onResume?.();
                break;
        }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
};

/**
 * Report this agent's lifecycle state to the orchestrator.
 *
 * @param {string} state  - One of AgentState values
 * @param {Object} [detail] - Optional details (total, reason, etc.)
 */
export const reportStatus = (state, detail) => {
    sendToShell('status', { state, detail });
};

/**
 * Listen for content messages forwarded by the shell.
 * Automatically filters out non-content messages (ping, pause, resume).
 *
 * @param {Function} callback - Receives the content envelope payload
 * @returns {Function} cleanup
 */
export const onContent = (callback) => {
    const handler = (e) => {
        if (!isShellMessage(e)) return;
        if (e.data.type !== 'content') return;
        callback(e.data.payload);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
};

/**
 * Resolve a backend image path to a usable URL.
 * Strips data directory prefixes. Rejects path traversal.
 *
 * @param {string} imagePath - Raw path from backend data
 * @param {string} [base=''] - Base URL prefix (e.g. '' for proxy, 'http://host:8000' for direct)
 * @returns {string|null}
 */
export const getImageUrl = (imagePath, base = '') => {
    if (!imagePath) return null;
    let clean = imagePath;
    if (clean.startsWith('./')) clean = clean.slice(2);
    if (clean.startsWith('data/images/')) clean = clean.replace('data/images/', 'images/');
    if (clean.startsWith('data/downloaded_images/')) clean = clean.replace('data/downloaded_images/', 'downloaded_images/');
    if (clean.includes('..')) return null;
    return `${base}/${clean}`;
};

/**
 * Subscribe to the display-agent SSE stream directly (standalone mode only).
 *
 * @param {string} url - SSE endpoint URL
 * @param {Function} onEvent - Receives parsed content envelopes
 * @param {Function} [onError] - Called on connection errors
 * @returns {EventSource}
 */
export const openDisplayStream = (url, onEvent, onError) => {
    const es = new EventSource(url);
    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.cards || data.items) onEvent(data);
        } catch (_) {}
    };
    es.onerror = onError || (() => {});
    return es;
};
