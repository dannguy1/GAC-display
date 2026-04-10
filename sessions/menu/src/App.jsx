import React, { useState, useEffect, useRef, useCallback } from 'react';
import MenuItemCard from './components/MenuItemCard';
import { openDisplayStream, onShellMessage } from './services/api';
import './App.css';

const ITEM_DISPLAY_SECONDS_DEFAULT = 8;
const TRANSITION_MS = 700;

export default function App() {
    // slides: [{id, item, exiting}] — may hold two cards during transition
    const [slides, setSlides] = useState([]);
    const [connected, setConnected] = useState(false);
    const queueRef = useRef([]);
    const indexRef = useRef(0);
    const itemIntervalRef = useRef(ITEM_DISPLAY_SECONDS_DEFAULT);
    const timerRef = useRef(null);
    const exitTimerRef = useRef(null);

    const advance = useCallback((queue) => {
        if (!queue || queue.length === 0) return;
        const idx = indexRef.current % queue.length;
        const next = queue[idx];
        indexRef.current = idx + 1;

        setSlides(prev => [
            ...prev.map(s => ({ ...s, exiting: true })),
            { id: `${next.item_name}-${Date.now()}`, item: next, exiting: false },
        ]);

        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => {
            setSlides(prev => prev.filter(s => !s.exiting));
        }, TRANSITION_MS + 50);
    }, []);

    /**
     * Handle a content envelope from either SSE or postMessage.
     * Envelope shape: { display?: { item_interval }, items: [...] }
     * Future: { display?: {...}, cards: [{ type, data }] }
     */
    const handleEnvelope = useCallback((envelope) => {
        // Support both legacy `items` and future typed `cards`
        const items = envelope.items || (envelope.cards || [])
            .filter(c => c.type === 'menu_item')
            .map(c => c.data);

        if (!items || items.length === 0) return;

        if (envelope.display?.item_interval) {
            itemIntervalRef.current = envelope.display.item_interval;
        }

        queueRef.current = items;
        indexRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
        advance(items);
        timerRef.current = setInterval(
            () => advance(queueRef.current),
            itemIntervalRef.current * 1000
        );
    }, [advance]);

    useEffect(() => {
        // Primary: direct SSE connection
        const es = openDisplayStream(
            (envelope) => { setConnected(true); handleEnvelope(envelope); },
            () => setConnected(false)
        );
        es.addEventListener('ping', () => setConnected(true));

        // Secondary: postMessage from shell (when running inside iframe)
        const cleanupMsg = onShellMessage(handleEnvelope);

        return () => {
            es.close();
            cleanupMsg();
            if (timerRef.current) clearInterval(timerRef.current);
            if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        };
    }, [handleEnvelope]);

    return (
        <div className="session-root">
            <div className="session-stage">
                {slides.length === 0 && (
                    <div className="session-idle">
                        <div className="session-idle__logo">Garlic &amp; Chives</div>
                        <div className="session-idle__divider" />
                        <div className="session-idle__sub">
                            {connected ? 'Featured dishes loading…' : 'Connecting to server…'}
                        </div>
                    </div>
                )}
                {slides.map(({ id, item, exiting }) => (
                    <div key={id} className={`session-slot ${exiting ? 'slide-out' : 'slide-in'}`}>
                        <MenuItemCard item={item} />
                    </div>
                ))}
            </div>
        </div>
    );
}
