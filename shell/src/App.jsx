import React, { useEffect, useRef, useState, useCallback } from 'react';
import { startScheduler } from './schedule';
import { createAgentRegistry } from './registry';
import { SHELL_SOURCE, AGENT_SOURCE, AgentMsg, ShellMsg, AgentState } from './protocol';
import './App.css';

// ── Configuration ────────────────────────────────────────────────────
const DEFAULT_SESSION_URL =
    import.meta.env.VITE_SESSION_MENU_URL || 'http://localhost:8504';

const SSE_URL = '/v1/display/stream';
const SESSION_LOAD_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 10_000;

// ── Helpers ──────────────────────────────────────────────────────────
function originOf(url) {
    try { return new URL(url).origin; }
    catch { return null; }
}

// ── Component ────────────────────────────────────────────────────────
export default function Shell() {
    const iframeRef = useRef(null);
    const [sessionUrl, setSessionUrl] = useState(DEFAULT_SESSION_URL);
    const [connected, setConnected] = useState(false);
    const [agentSnapshot, setAgentSnapshot] = useState(null);

    const returnTimerRef   = useRef(null);
    const loadTimeoutRef   = useRef(null);
    const lastContentRef   = useRef(null);
    const agentReadyRef    = useRef(false);
    const sessionUrlRef    = useRef(DEFAULT_SESSION_URL);
    const registryRef      = useRef(createAgentRegistry());

    // ── Orchestrator → Agent messaging ───────────────────────────────
    const sendToAgent = useCallback((type, payload) => {
        const origin = originOf(sessionUrlRef.current);
        if (!origin) return;
        iframeRef.current?.contentWindow?.postMessage(
            { source: SHELL_SOURCE, type, payload },
            origin
        );
    }, []);

    // ── Session lifecycle ────────────────────────────────────────────
    const updateSessionUrl = (url) => {
        sessionUrlRef.current = url;
        setSessionUrl(url);
    };

    const loadSession = useCallback((url, durationSecs) => {
        if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

        // Same URL already loaded — just reset the return timer
        if (sessionUrlRef.current === url) {
            if (durationSecs > 0) {
                returnTimerRef.current = setTimeout(
                    () => loadSession(DEFAULT_SESSION_URL, 0),
                    durationSecs * 1000
                );
            }
            return;
        }

        agentReadyRef.current = false;
        registryRef.current.clear();
        setAgentSnapshot(null);
        updateSessionUrl(url);

        // Load timeout — recover to default if agent never registers
        loadTimeoutRef.current = setTimeout(() => {
            if (!agentReadyRef.current) {
                console.warn(`[orchestrator] Agent at ${url} did not register within ${SESSION_LOAD_TIMEOUT_MS}ms`);
                loadSession(DEFAULT_SESSION_URL, 0);
            }
        }, SESSION_LOAD_TIMEOUT_MS);

        // Finite-duration session — schedule return to default
        if (durationSecs > 0) {
            returnTimerRef.current = setTimeout(
                () => loadSession(DEFAULT_SESSION_URL, 0),
                durationSecs * 1000
            );
        }
    }, []);

    // ── Main effect — SSE, message listener, scheduler, health ping ─
    useEffect(() => {
        agentReadyRef.current = false;
        const registry = registryRef.current;

        // ── SSE connection to backend ────────────────────────────────
        const es = new EventSource(SSE_URL);
        es.addEventListener('ping', () => setConnected(true));
        es.onmessage = (e) => {
            setConnected(true);
            try {
                const data = JSON.parse(e.data);
                if (data.event_type === 'content' || data.cards || data.items) {
                    lastContentRef.current = data;
                    if (agentReadyRef.current && registry.acceptsContent()) {
                        sendToAgent(ShellMsg.CONTENT, data);
                    }
                }
            } catch (err) {
                if (import.meta.env.DEV) console.warn('[orchestrator] SSE parse error:', err.message);
            }
        };
        es.onerror = () => setConnected(false);

        // ── Agent message handler ────────────────────────────────────
        const handleAgentMessage = (e) => {
            const expected = originOf(sessionUrlRef.current);
            if (!expected || e.origin !== expected) return;
            if (e.data?.source !== AGENT_SOURCE) return;

            switch (e.data.type) {
                case AgentMsg.REGISTER:
                    agentReadyRef.current = true;
                    registry.register(sessionUrlRef.current, e.data.capabilities || {});
                    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
                    setAgentSnapshot(registry.getSnapshot());
                    // Replay buffered content if agent accepts it
                    if (lastContentRef.current && registry.acceptsContent()) {
                        sendToAgent(ShellMsg.CONTENT, lastContentRef.current);
                    }
                    break;

                case AgentMsg.STATUS:
                    registry.updateState(e.data.state, e.data.detail);
                    setAgentSnapshot(registry.getSnapshot());
                    break;

                case AgentMsg.PONG:
                    registry.recordPong();
                    break;
            }
        };
        window.addEventListener('message', handleAgentMessage);

        // ── Session scheduler ────────────────────────────────────────
        const scheduler = startScheduler((url, durationSecs) => {
            loadSession(url, durationSecs);
        });

        // ── Health monitoring ────────────────────────────────────────
        const pingId = setInterval(() => {
            if (!agentReadyRef.current) return;
            sendToAgent(ShellMsg.PING);
            if (registry.getAgent() && !registry.isHealthy()) {
                registry.markUnresponsive();
                setAgentSnapshot(registry.getSnapshot());
                console.warn('[orchestrator] Agent unresponsive — recovering to default');
                loadSession(DEFAULT_SESSION_URL, 0);
            }
        }, PING_INTERVAL_MS);

        // ── Cleanup ──────────────────────────────────────────────────
        return () => {
            es.close();
            scheduler.stop();
            clearInterval(pingId);
            window.removeEventListener('message', handleAgentMessage);
            if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
            if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
        };
    }, [sendToAgent, loadSession]);

    // ── Render ───────────────────────────────────────────────────────
    return (
        <div className="shell-root">
            <iframe
                ref={iframeRef}
                src={sessionUrl}
                className="shell-frame"
                title="display-agent"
                allowFullScreen
            />

            {/* Connection status */}
            <div className={`shell-status ${connected ? 'shell-status--live' : 'shell-status--off'}`}>
                {connected ? '● LIVE' : '○ CONNECTING'}
            </div>

            {/* Agent debug overlay — only visible in dev */}
            {import.meta.env.DEV && agentSnapshot && (
                <div className="shell-debug">
                    <span className="shell-debug__label">agent</span>
                    <span className={`shell-debug__state shell-debug__state--${agentSnapshot.state}`}>
                        {agentSnapshot.state}
                    </span>
                    {agentSnapshot.capabilities?.cardTypes && (
                        <span className="shell-debug__caps">
                            {agentSnapshot.capabilities.cardTypes.join(', ')}
                        </span>
                    )}
                    {agentSnapshot.errorCount > 0 && (
                        <span className="shell-debug__errors">
                            err:{agentSnapshot.errorCount}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
