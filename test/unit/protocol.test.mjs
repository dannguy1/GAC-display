/**
 * Unit tests for lib/agent-sdk/protocol.js
 *
 * Verifies all protocol constants are defined and frozen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    SHELL_SOURCE,
    AGENT_SOURCE,
    ShellMsg,
    AgentMsg,
    AgentState,
} from '../../lib/agent-sdk/protocol.js';

describe('Protocol constants', () => {
    it('defines source identifiers', () => {
        assert.equal(SHELL_SOURCE, 'gac-display-shell');
        assert.equal(AGENT_SOURCE, 'gac-display-agent');
    });

    it('ShellMsg has exactly CONTENT, PING, PAUSE, RESUME', () => {
        const keys = Object.keys(ShellMsg).sort();
        assert.deepEqual(keys, ['CONTENT', 'PAUSE', 'PING', 'RESUME']);
        assert.equal(ShellMsg.CONTENT, 'content');
        assert.equal(ShellMsg.PING, 'ping');
        assert.equal(ShellMsg.PAUSE, 'pause');
        assert.equal(ShellMsg.RESUME, 'resume');
    });

    it('AgentMsg has exactly REGISTER, STATUS, PONG', () => {
        const keys = Object.keys(AgentMsg).sort();
        assert.deepEqual(keys, ['PONG', 'REGISTER', 'STATUS']);
        assert.equal(AgentMsg.REGISTER, 'register');
        assert.equal(AgentMsg.STATUS, 'status');
        assert.equal(AgentMsg.PONG, 'pong');
    });

    it('AgentState has all 7 states', () => {
        const keys = Object.keys(AgentState).sort();
        assert.deepEqual(keys, [
            'ENDED', 'ERROR', 'IDLE', 'LOADING',
            'PAUSED', 'PLAYING', 'UNRESPONSIVE',
        ]);
    });

    it('ShellMsg is frozen', () => {
        assert.ok(Object.isFrozen(ShellMsg));
    });

    it('AgentMsg is frozen', () => {
        assert.ok(Object.isFrozen(AgentMsg));
    });

    it('AgentState is frozen', () => {
        assert.ok(Object.isFrozen(AgentState));
    });
});
