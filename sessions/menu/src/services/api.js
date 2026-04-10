const API_BASE = '/v1';
const SERVER_BASE = '';

// Expected shell origin for postMessage security.
// Override via VITE_SHELL_ORIGIN in .env.
const SHELL_ORIGIN = import.meta.env.VITE_SHELL_ORIGIN || 'http://localhost:8503';

export const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    let clean = imagePath;
    if (clean.startsWith('./')) clean = clean.slice(2);
    if (clean.startsWith('data/images/')) clean = clean.replace('data/images/', 'images/');
    if (clean.startsWith('data/downloaded_images/')) clean = clean.replace('data/downloaded_images/', 'downloaded_images/');
    if (clean.includes('..')) return null;
    return `${SERVER_BASE}/${clean}`;
};

/**
 * Subscribe to the display-agent SSE stream directly.
 * The full envelope { display, items } is passed to onEvent.
 */
export const openDisplayStream = (onEvent, onError) => {
    const es = new EventSource(`${API_BASE}/display/stream`);
    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.items || data.cards) onEvent(data);
        } catch (_) {}
    };
    es.onerror = onError || (() => {});
    return es;
};

/**
 * Listen for content events forwarded by the shell via postMessage.
 * Returns a cleanup function.
 */
export const onShellMessage = (onContent) => {
    const handler = (e) => {
        if (e.data?.source !== 'gac-display-shell') return;
        const payload = e.data.payload;
        if (payload?.items || payload?.cards) onContent(payload);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
};
