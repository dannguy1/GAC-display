/**
 * GAC-Display Agent Protocol — shared constants.
 *
 * Single source of truth for all message types, states, and identifiers
 * used in shell ↔ session agent communication.
 */

// ── Message Sources ──────────────────────────────────────────────────
export const SHELL_SOURCE  = 'gac-display-shell';
export const AGENT_SOURCE  = 'gac-display-agent';

// ── Shell → Agent Messages ───────────────────────────────────────────
export const ShellMsg = Object.freeze({
    CONTENT:  'content',   // Forward content envelope
    PING:     'ping',      // Health check — expects pong
    PAUSE:    'pause',     // Pause playback (orchestrator override)
    RESUME:   'resume',    // Resume playback
});

// ── Agent → Shell Messages ───────────────────────────────────────────
export const AgentMsg = Object.freeze({
    REGISTER: 'register',  // Declare capabilities on mount
    STATUS:   'status',    // Report lifecycle state change
    PONG:     'pong',      // Respond to health ping
});

// ── Agent Lifecycle States ───────────────────────────────────────────
export const AgentState = Object.freeze({
    LOADING:      'loading',       // Iframe loading, agent not yet registered
    IDLE:         'idle',          // Registered, no content displayed
    PLAYING:      'playing',       // Actively displaying content
    PAUSED:       'paused',        // Playback paused by orchestrator
    ERROR:        'error',         // Encountered an error
    ENDED:        'ended',         // Content finished (e.g., happy hour expired)
    UNRESPONSIVE: 'unresponsive',  // Failed to respond to health pings
});
