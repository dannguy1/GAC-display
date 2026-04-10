import React, { useEffect, useRef, useState } from 'react';
import './App.css';

// Default session loaded at startup. Override via VITE_SESSION_MENU_URL in .env.
const DEFAULT_SESSION_URL =
    import.meta.env.VITE_SESSION_MENU_URL || 'http://localhost:8504';

const SSE_URL = '/v1/display/stream';

// How long (ms) to wait for a session page to load before considering it failed
const SESSION_LOAD_TIMEOUT_MS = 10_000;

export default function Shell() {
    const iframeRef = useRef(null);
    const [sessionUrl, setSessionUrl] = useState(DEFAULT_SESSION_URL);
    const [connected, setConnected] = useState(false);
    const returnTimerRef = useRef(null);

    const loadSession = (url, durationSecs) => {
        // Cancel any pending auto-return timer
        if (returnTimerRef.current) clearTimeout(returnTimerRef.current);

        setSessionUrl(url);

        // If the session has a finite duration, schedule return to default
        if (durationSecs > 0) {
            returnTimerRef.current = setTimeout(() => {
                setSessionUrl(DEFAULT_SESSION_URL);
            }, durationSecs * 1000);
        }
    };

    useEffect(() => {
        const es = new EventSource(SSE_URL);

        es.addEventListener('ping', () => setConnected(true));

        es.onmessage = (e) => {
            setConnected(true);
            try {
                const data = JSON.parse(e.data);

                if (data.event_type === 'session' && data.session?.url) {
                    // Session directive: swap the displayed session
                    loadSession(
                        data.session.url,
                        data.session.display?.duration ?? 0
                    );
                } else if (data.event_type === 'content' || data.items || data.cards) {
                    // Content event: forward to the active session via postMessage
                    iframeRef.current?.contentWindow?.postMessage(
                        { source: 'gac-display-shell', payload: data },
                        '*'   // TODO: restrict to session origin in production
                    );
                }
            } catch (_) {}
        };

        es.onerror = () => setConnected(false);

        return () => {
            es.close();
            if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
        };
    }, []);

    return (
        <div className="shell-root">
            <iframe
                ref={iframeRef}
                src={sessionUrl}
                className="shell-frame"
                title="display-session"
                allowFullScreen
            />
            <div className={`shell-status ${connected ? 'shell-status--live' : 'shell-status--off'}`}>
                {connected ? '● LIVE' : '○ CONNECTING'}
            </div>
        </div>
    );
}
