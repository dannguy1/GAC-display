import React, { useState, useEffect, useRef, useCallback } from 'react';
import LunchSpecialCard from './components/LunchSpecialCard';
import CountdownTimer from './components/CountdownTimer';
import { insideIframe, setupAgent, reportStatus } from './services/api';
import './App.css';

const ITEM_DISPLAY_SECONDS_DEFAULT = 8;
const TRANSITION_MS = 700;
const MENU_API = '/v1/menu';
const CACHE_KEY = 'lunch-specials-cache';

function todayStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCachedSpecials() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (cached.date !== todayStamp()) return null;
        if (!Array.isArray(cached.items) || cached.items.length === 0) return null;
        return cached.items;
    } catch { return null; }
}

function setCachedSpecials(items) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ date: todayStamp(), items }));
    } catch { /* storage full — proceed without cache */ }
}

/**
 * Merge lunch-special config with menu items from the backend.
 * Config specials provide: item_name, price (special), tag, includes.
 * Menu items provide: item_name, item_viet, category, description, image_path, price (regular).
 * Result: full menu item fields + original_price (regular) + price (special) + tag + includes.
 */
function mergeSpecials(configSpecials, menuItems) {
    // Build a lookup by normalized item_name (lowercase, trimmed)
    const menuMap = new Map();
    for (const item of menuItems) {
        menuMap.set(item.item_name?.toLowerCase().trim(), item);
    }

    return configSpecials
        .map(spec => {
            const menuItem = menuMap.get(spec.item_name?.toLowerCase().trim());
            if (!menuItem) return null;
            return {
                ...menuItem,
                original_price: menuItem.price,
                price: spec.price,
                tag: spec.tag || null,
                includes: spec.includes || null,
            };
        })
        .filter(Boolean);
}

export default function App() {
    const [slides, setSlides] = useState([]);
    const [config, setConfig] = useState(null);
    const [status, setStatus] = useState('loading');
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
            { id: `ls-${idx}-${Date.now()}`, item: next, exiting: false },
        ]);

        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => {
            setSlides(prev => prev.filter(s => !s.exiting));
        }, TRANSITION_MS + 50);
    }, []);

    const startCarousel = useCallback((items) => {
        if (!items || items.length === 0) return;
        queueRef.current = items;
        indexRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
        advance(items);

        if (items.length > 1) {
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
        let cancelled = false;

        async function loadSpecials() {
            try {
                // Step 1: Load config
                const cfgRes = await fetch('/lunch-specials.json');
                if (!cfgRes.ok) throw new Error('Config load failed');
                const data = await cfgRes.json();
                if (cancelled) return;
                setConfig(data);

                // Step 2: Check sessionStorage cache (daily)
                const cached = getCachedSpecials();
                if (cached) {
                    startCarousel(cached);
                    setStatus('playing');
                    reportStatus('playing', { total: cached.length });
                    return;
                }

                // Step 3: Fetch menu items from REST API
                setStatus('waiting');
                const menuRes = await fetch(MENU_API);
                if (!menuRes.ok) throw new Error(`Menu API ${menuRes.status}`);
                const menuItems = await menuRes.json();
                if (cancelled) return;

                // Step 4: Merge config specials with menu data
                const merged = mergeSpecials(data.specials || [], menuItems);
                if (merged.length > 0) {
                    setCachedSpecials(merged);
                    startCarousel(merged);
                    setStatus('playing');
                    reportStatus('playing', { total: merged.length });
                }
            } catch (err) {
                if (cancelled) return;
                setStatus('error');
                reportStatus('error', { reason: err.message || 'Load failed' });
            }
        }

        loadSpecials();

        if (insideIframe) {
            cleanupAgent = setupAgent(
                { selfLoading: true, acceptsContent: false },
                { onPause: handlePause, onResume: handleResume }
            );
        }

        return () => {
            cancelled = true;
            cleanupAgent?.();
            if (timerRef.current) clearInterval(timerRef.current);
            if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        };
    }, [startCarousel, handlePause, handleResume]);

    const statusText = {
        loading: 'Loading lunch specials…',
        waiting: 'Fetching menu data…',
        error: 'Could not load lunch specials',
    };

    return (
        <div className="ls-root">
            <div className="ls-header">
                <div className="ls-header__title-group">
                    <h1 className="ls-header__title">
                        {config?.title || 'Lunch Specials'}
                    </h1>
                    <span className="ls-header__subtitle">
                        {config?.subtitle || ''}
                    </span>
                </div>
                {config && (
                    <CountdownTimer
                        endHour={config.end_hour}
                        endMinute={config.end_minute}
                        label="Lunch ends in"
                        endedLabel="Lunch specials have ended"
                    />
                )}
            </div>

            <div className="ls-stage">
                {slides.length === 0 && (
                    <div className="ls-idle">
                        <div className="ls-idle__logo">Garlic &amp; Chives</div>
                        <div className="ls-idle__divider" />
                        <div className="ls-idle__sub">
                            {statusText[status] || 'Lunch specials loading…'}
                        </div>
                    </div>
                )}
                {slides.map(({ id, item, exiting }) => (
                    <div key={id} className={`ls-slot ${exiting ? 'ls-slide-out' : 'ls-slide-in'}`}>
                        <LunchSpecialCard item={item} />
                    </div>
                ))}
            </div>
        </div>
    );
}
