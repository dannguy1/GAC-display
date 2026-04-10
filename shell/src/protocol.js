/**
 * Agent protocol — re-exports shared constants for shell use.
 *
 * The shell (orchestrator) and agents (sessions) share a single protocol
 * definition in lib/agent-sdk/protocol.js. This file re-exports it so
 * shell code can import from a local path.
 */

export {
    SHELL_SOURCE,
    AGENT_SOURCE,
    ShellMsg,
    AgentMsg,
    AgentState,
} from '../../lib/agent-sdk/protocol.js';

