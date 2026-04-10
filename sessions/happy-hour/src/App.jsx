import React, { useState, useEffect, useRef, useCallback } from 'react';
import HappyHourCard from './components/HappyHourCard';
import CountdownTimer from './components/CountdownTimer';
import { insideIframe, setupAgent, reportStatus, getImageUrl } from './services/api';
import './App.css';

const ITEM_DISPLAY_SECONDS_DEFAULT = 8;
const TRANSITION_MS = 700;

export default function App() {
    const [slides, setSlides] = useState([]);
    const [config, setConfig] = useState(null);
    const queueRef = useRef([]);
    const indexRef = useRef(0);
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
            { id: `hh-${idx}-${Date.now()}`, item: next, exiting: false },
        ]);

        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => {
            setSlides(prev => prev.filter(s => !s.exiting));
        }, TRANSITION_MS + 50);
    }, []);

    const startCarousel = useCallback((specials) => {
        if (!specials || specials.length === 0) return;
        queueRef.current = specials;
        indexRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
        advance(specials);

        if (specials.length > 1) {
            timerRef.current = setInterval(
                () => { if (!pausedRef.current) advance(queueRef.current); },
                ITEM_DISPLAY_SECONDS_DEFAULT * 1000
            );
        }
    }, [advance]);

    const handlePause = useCallback(() => {
        pausedRef.current = true;
        reportStatus('paused');
    }, []);

    const handleResume = useCallback(() => {
        pausedRef.current = false;
        reportStatus('playing', { total: queueRef.current.length });
    }, []);

    useEffect(() => {
        let cleanupAgent = null;

        fetch('/happy-hour.json')
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(data => {
                setConfig(data);
                startCarousel(data.specials || []);
                reportStatus('playing', { total: (data.specials || []).length });
            })
            .catch(() => {
                reportStatus('error', { reason: 'Failed to load happy hour data' });
            });

        if (insideIframe) {
            cleanupAgent = setupAgent(
                { selfLoading: true, acceptsContent: false },
                { onPause: handlePause, onResume: handleResume }
            );
        }

        return () => {
            cleanupAgent?.();
            if (timerRef.current) clearInterval(timerRef.current);
            if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        };
    }, [startCarousel, handlePause, handleResume]);

    const bgUrl = config?.background_image ? getImageUrl(config.background_image) : null;

    return (
        <div className="hh-root">
            <div className="hh-bg">
                {bgUrl && (
                    <img src={bgUrl} alt="" className="hh-bg__image" />
                )}
            </div>

            <div className="hh-header">
                <div className="hh-header__title-group">
                    <h1 className="hh-header__title">
                        {config?.title || 'Happy Hour'}
                    </h1>
                    <span className="hh-header__subtitle">
                        {config?.subtitle || ''}
                    </span>
                </div>
                {config && (
                    <CountdownTimer
                        endHour={config.end_hour}
                        endMinute={config.end_minute}
                    />
                )}
            </div>

            <div className="hh-stage">
                {slides.length === 0 && (
                    <div className="hh-idle">
                        <div className="hh-idle__logo">Garlic &amp; Chives</div>
                        <div className="hh-idle__divider" />
                        <div className="hh-idle__sub">
                            Happy hour specials loading…
                        </div>
                    </div>
                )}
                {slides.map(({ id, item, exiting }) => (
                    <div key={id} className={`hh-slot ${exiting ? 'hh-slide-out' : 'hh-slide-in'}`}>
                        <HappyHourCard item={item} />
                    </div>
                ))}
            </div>
        </div>
    );
}
