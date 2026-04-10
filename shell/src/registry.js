/**
 * Agent registry — tracks the active session agent's full state.
 *
 * The orchestrator (shell) maintains one active agent at a time.
 * The registry records capabilities, health, lifecycle state, and errors.
 */

import { AgentState } from './protocol';

const HEALTH_TIMEOUT_MS = 30_000;

export function createAgentRegistry() {
    let agent = null;

    return {
        /**
         * Register a new agent with its declared capabilities.
         */
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

        /** Update agent state from a status report. */
        updateState(state, detail) {
            if (!agent) return;
            agent.state = state;
            agent.lastStatus = { state, detail, at: Date.now() };
            if (state === AgentState.ERROR) {
                agent.errorCount += 1;
                agent.lastError = { detail, at: Date.now() };
            }
        },

        /** Record a pong response (agent is alive). */
        recordPong() {
            if (agent) agent.lastPong = Date.now();
        },

        /** Check whether the agent accepts content from the shell. */
        acceptsContent() {
            return agent?.capabilities?.acceptsContent === true;
        },

        /** Check if the agent has responded to pings recently. */
        isHealthy() {
            return agent != null && (Date.now() - agent.lastPong) < HEALTH_TIMEOUT_MS;
        },

        /** Mark agent as unresponsive. */
        markUnresponsive() {
            if (agent) agent.state = AgentState.UNRESPONSIVE;
        },

        /** Get a snapshot of current agent state (safe for UI rendering). */
        getSnapshot() {
            if (!agent) return null;
            return { ...agent };
        },

        /** Get the raw agent object. */
        getAgent() { return agent; },

        /** Clear the registry (agent unloaded). */
        clear() { agent = null; },
    };
}
