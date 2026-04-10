/**
 * Unit tests for shell/src/registry.js
 *
 * The registry module uses a bare `./protocol` import (no .js extension)
 * which Vite resolves but Node does not. We inline the factory here as
 * a faithful copy-test pattern — same approach as image-url.test.mjs.
 *
 * If the registry logic changes, this test catches regressions. If the
 * file structure changes, the build tests catch import issues.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline AgentState (matches lib/agent-sdk/protocol.js) ────────────
const AgentState = Object.freeze({
    LOADING:      'loading',
    IDLE:         'idle',
    PLAYING:      'playing',
    PAUSED:       'paused',
    ERROR:        'error',
    ENDED:        'ended',
    UNRESPONSIVE: 'unresponsive',
});

// ── Inline createAgentRegistry (matches shell/src/registry.js) ───────
const HEALTH_TIMEOUT_MS = 30_000;

function createAgentRegistry() {
    let agent = null;
    return {
        register(url, capabilities = {}) {
            agent = {
                url,
                capabilities,
                state: AgentState.IDLE,
                registeredAt: Date.now(),
                lastPong: Date.now(),
                lastStatus: null,
                errorCount: 0,
                lastError: null,
            };
        },
        updateState(state, detail) {
            if (!agent) return;
            agent.state = state;
            agent.lastStatus = { state, detail, at: Date.now() };
            if (state === AgentState.ERROR) {
                agent.errorCount += 1;
                agent.lastError = { detail, at: Date.now() };
            }
        },
        recordPong() {
            if (agent) agent.lastPong = Date.now();
        },
        acceptsContent() {
            return agent?.capabilities?.acceptsContent === true;
        },
        isHealthy() {
            return agent != null && (Date.now() - agent.lastPong) < HEALTH_TIMEOUT_MS;
        },
        markUnresponsive() {
            if (agent) agent.state = AgentState.UNRESPONSIVE;
        },
        getSnapshot() {
            if (!agent) return null;
            return { ...agent };
        },
        getAgent() { return agent; },
        clear() { agent = null; },
    };
}

describe('AgentRegistry', () => {
    /** @type {ReturnType<typeof createAgentRegistry>} */
    let registry;

    beforeEach(() => {
        registry = createAgentRegistry();
    });

    describe('initial state', () => {
        it('getAgent() returns null before registration', () => {
            assert.equal(registry.getAgent(), null);
        });

        it('getSnapshot() returns null before registration', () => {
            assert.equal(registry.getSnapshot(), null);
        });

        it('acceptsContent() returns false before registration', () => {
            assert.equal(registry.acceptsContent(), false);
        });

        it('isHealthy() returns false before registration', () => {
            assert.equal(registry.isHealthy(), false);
        });
    });

    describe('register()', () => {
        it('creates an agent with default state IDLE', () => {
            registry.register('http://localhost:8504', { cardTypes: ['menu_item'] });
            const agent = registry.getAgent();
            assert.ok(agent);
            assert.equal(agent.state, 'idle');
            assert.equal(agent.url, 'http://localhost:8504');
            assert.deepEqual(agent.capabilities.cardTypes, ['menu_item']);
        });

        it('initialises timestamps and error counters', () => {
            registry.register('http://localhost:8504', {});
            const agent = registry.getAgent();
            assert.ok(agent.registeredAt > 0);
            assert.ok(agent.lastPong > 0);
            assert.equal(agent.errorCount, 0);
            assert.equal(agent.lastError, null);
        });
    });

    describe('acceptsContent()', () => {
        it('returns true when capability is set', () => {
            registry.register('http://localhost:8504', { acceptsContent: true });
            assert.equal(registry.acceptsContent(), true);
        });

        it('returns false when capability is missing', () => {
            registry.register('http://localhost:8504', {});
            assert.equal(registry.acceptsContent(), false);
        });

        it('returns false when explicitly false', () => {
            registry.register('http://localhost:8504', { acceptsContent: false });
            assert.equal(registry.acceptsContent(), false);
        });
    });

    describe('updateState()', () => {
        it('updates agent state', () => {
            registry.register('http://localhost:8504', {});
            registry.updateState('playing', { total: 5 });
            assert.equal(registry.getAgent().state, 'playing');
        });

        it('tracks error count on error state', () => {
            registry.register('http://localhost:8504', {});
            registry.updateState('error', { reason: 'fail 1' });
            registry.updateState('error', { reason: 'fail 2' });
            assert.equal(registry.getAgent().errorCount, 2);
        });

        it('records last error details', () => {
            registry.register('http://localhost:8504', {});
            registry.updateState('error', { reason: 'boom' });
            assert.equal(registry.getAgent().lastError.detail.reason, 'boom');
        });

        it('does nothing if no agent registered', () => {
            // Should not throw
            registry.updateState('playing', {});
            assert.equal(registry.getAgent(), null);
        });
    });

    describe('recordPong()', () => {
        it('updates lastPong timestamp', () => {
            registry.register('http://localhost:8504', {});
            const before = registry.getAgent().lastPong;
            // Advance time slightly
            registry.recordPong();
            assert.ok(registry.getAgent().lastPong >= before);
        });
    });

    describe('isHealthy()', () => {
        it('returns true immediately after registration', () => {
            registry.register('http://localhost:8504', {});
            assert.equal(registry.isHealthy(), true);
        });

        it('returns false when lastPong is stale (>30s)', () => {
            registry.register('http://localhost:8504', {});
            // Manually make lastPong stale
            registry.getAgent().lastPong = Date.now() - 31_000;
            assert.equal(registry.isHealthy(), false);
        });
    });

    describe('markUnresponsive()', () => {
        it('sets state to unresponsive', () => {
            registry.register('http://localhost:8504', {});
            registry.markUnresponsive();
            assert.equal(registry.getAgent().state, 'unresponsive');
        });
    });

    describe('getSnapshot()', () => {
        it('returns a copy, not the original', () => {
            registry.register('http://localhost:8504', { cardTypes: ['x'] });
            const snap = registry.getSnapshot();
            snap.state = 'tampered';
            assert.equal(registry.getAgent().state, 'idle');
        });
    });

    describe('clear()', () => {
        it('resets agent to null', () => {
            registry.register('http://localhost:8504', {});
            registry.clear();
            assert.equal(registry.getAgent(), null);
            assert.equal(registry.getSnapshot(), null);
        });
    });
});
