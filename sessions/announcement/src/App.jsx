import React, { useState, useEffect, useRef, useCallback } from 'react';
import MessageCard from './components/MessageCard';
import { onContent, insideIframe, setupAgent, reportStatus } from './services/api';
import './App.css';

const ITEM_DISPLAY_SECONDS_DEFAULT = 10;
const TRANSITION_MS = 600;

export default function App() {
    const [slides, setSlides] = useState([]);
    const [connected, setConnected] = useState(false);
    const queueRef = useRef([]);
    const indexRef = useRef(0);
    const itemIntervalRef = useRef(ITEM_DISPLAY_SECONDS_DEFAULT);
    const timerRef = useRef(null);
    const exitTimerRef = useRef(null);
    const pausedRef = useRef(false);

    const advance = useCallback((queue) => {
        if (!queue || queue.length === 0) return;
        const idx = indexRef.current % queue.length;
        const next = queue[idx];
        indexRef.current = idx + 1;

        setSlides(prev => [
            ...prev.map(s => ({ ...s, exiting: true })),
            { id: `msg-${idx}-${Date.now()}`, data: next, exiting: false },
        ]);

        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => {
            setSlides(prev => prev.filter(s => !s.exiting));
        }, TRANSITION_MS + 50);
    }, []);

    const startCarousel = useCallback((messages, interval) => {
        if (!messages || messages.length === 0) return;
        if (interval) itemIntervalRef.current = interval;

        queueRef.current = messages;
        indexRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
        advance(messages);

        if (messages.length > 1) {
            timerRef.current = setInterval(
                () => { if (!pausedRef.current) advance(queueRef.current); },
                itemIntervalRef.current * 1000
            );
        }
    }, [advance]);

    const handleEnvelope = useCallback((envelope) => {
        let messages;
        if (envelope.cards) {
            messages = envelope.cards.filter(c => c.type === 'message').map(c => c.data);
        } else if (envelope.items) {
            messages = envelope.items;
        } else {
            messages = [];
        }

        if (messages.length === 0) return;
        startCarousel(messages, envelope.display?.item_interval);
        reportStatus('playing', { total: messages.length });
    }, [startCarousel]);

    const handlePause = useCallback(() => {
        pausedRef.current = true;
        reportStatus('paused');
    }, []);

    const handleResume = useCallback(() => {
        pausedRef.current = false;
        reportStatus('playing', { total: queueRef.current.length });
    }, []);

    useEffect(() => {
        let cleanupContent = null;
        let cleanupAgent = null;

        // Self-load announcements from local data file
        fetch('/announcements.json')
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(messages => {
                setConnected(true);
                startCarousel(messages);
                reportStatus('playing', { total: messages.length });
            })
            .catch(() => {
                setConnected(false);
                reportStatus('error', { reason: 'Failed to load announcements' });
            });

        // Also accept content pushed by the shell (overrides local data)
        if (insideIframe) {
            cleanupContent = onContent((envelope) => {
                setConnected(true);
                handleEnvelope(envelope);
            });
            cleanupAgent = setupAgent(
                { cardTypes: ['message'], selfLoading: true, acceptsContent: true },
                { onPause: handlePause, onResume: handleResume }
            );
        }

        return () => {
            cleanupContent?.();
            cleanupAgent?.();
            if (timerRef.current) clearInterval(timerRef.current);
            if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        };
    }, [handleEnvelope, startCarousel, handlePause, handleResume]);

    return (
        <div className="session-root">
            <div className="session-stage">
                {slides.length === 0 && (
                    <div className="session-idle">
                        <div className="session-idle__logo">Garlic &amp; Chives</div>
                        <div className="session-idle__divider" />
                        <div className="session-idle__sub">
                            {connected ? 'Waiting for announcements…' : 'Connecting to server…'}
                        </div>
                    </div>
                )}
                {slides.map(({ id, data, exiting }) => (
                    <div key={id} className={`session-slot ${exiting ? 'fade-out' : 'fade-in'}`}>
                        <MessageCard data={data} />
                    </div>
                ))}
            </div>
        </div>
    );
}
