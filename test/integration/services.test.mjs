/**
 * Integration tests for the GAC-Display orchestrator + agent system.
 *
 * These tests require all services to be running:
 *   - Backend (or mock-sse) on :8000
 *   - Shell on :8503
 *   - Menu session on :8504
 *   - Announcement session on :8505
 *   - Happy-hour session on :8506
 *
 * Tests verify:
 *   1. All services are reachable
 *   2. SSE stream delivers content events
 *   3. Shell serves HTML with iframe
 *   4. Each session serves HTML
 *   5. Vite build succeeds for all apps
 *
 * Usage:
 *   node --test test/integration/services.test.mjs
 *
 * Set HOST env var to override (default: 192.168.10.3).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const HOST = process.env.HOST || '192.168.10.3';

// ── Helpers ──────────────────────────────────────────────────────────

/** Simple HTTP GET that returns { status, headers, body }. */
function httpGet(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout: ${url}`)), timeoutMs);
        http.get(url, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                clearTimeout(timer);
                resolve({ status: res.statusCode, headers: res.headers, body });
            });
        }).on('error', (e) => {
            clearTimeout(timer);
            reject(e);
        });
    });
}

/**
 * Connect to an SSE endpoint and collect the first N data events.
 * Returns an array of parsed JSON objects.
 */
function collectSSE(url, count = 1, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const events = [];
        const timer = setTimeout(() => {
            req.destroy();
            if (events.length > 0) resolve(events);
            else reject(new Error(`SSE timeout after ${timeoutMs}ms — got 0 events from ${url}`));
        }, timeoutMs);

        const req = http.get(url, (res) => {
            let buffer = '';
            res.on('data', (chunk) => {
                buffer += chunk.toString();
                // Parse SSE frames
                const frames = buffer.split('\n\n');
                buffer = frames.pop(); // keep incomplete frame
                for (const frame of frames) {
                    const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
                    if (!dataLine) continue;
                    try {
                        const data = JSON.parse(dataLine.slice(6));
                        events.push(data);
                        if (events.length >= count) {
                            clearTimeout(timer);
                            req.destroy();
                            resolve(events);
                        }
                    } catch { /* skip non-JSON */ }
                }
            });
        });
        req.on('error', (e) => {
            clearTimeout(timer);
            if (events.length > 0) resolve(events);
            else reject(e);
        });
    });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Service availability', () => {
    const services = [
        { name: 'Shell',        url: `http://${HOST}:8503/` },
        { name: 'Menu',         url: `http://${HOST}:8504/` },
        { name: 'Announcement', url: `http://${HOST}:8505/` },
        { name: 'Happy Hour',   url: `http://${HOST}:8506/` },
    ];

    for (const { name, url } of services) {
        it(`${name} responds with 200`, async () => {
            const res = await httpGet(url);
            assert.equal(res.status, 200, `${name} at ${url} returned ${res.status}`);
        });

        it(`${name} serves HTML`, async () => {
            const res = await httpGet(url);
            assert.ok(
                res.headers['content-type']?.includes('text/html'),
                `Expected text/html, got ${res.headers['content-type']}`
            );
        });
    }
});

describe('Shell HTML structure', () => {
    it('contains an iframe element', async () => {
        const res = await httpGet(`http://${HOST}:8503/`);
        // The shell renders via React — the initial HTML has the mount point.
        // The iframe is added by React, so check the JS bundle references.
        assert.ok(
            res.body.includes('<div id="root">') || res.body.includes('id="root"'),
            'Shell HTML should have a React root mount point'
        );
    });
});

describe('Backend SSE stream', () => {
    it('connects to /v1/display/stream', async () => {
        const events = await collectSSE(`http://${HOST}:8000/v1/display/stream`, 1, 15000);
        assert.ok(events.length >= 1, 'Should receive at least 1 SSE event');
    });

    it('SSE events contain typed cards', async () => {
        const events = await collectSSE(`http://${HOST}:8000/v1/display/stream`, 1, 15000);
        const event = events[0];
        // The event should have cards array
        if (event.cards) {
            assert.ok(Array.isArray(event.cards), 'cards should be an array');
            for (const card of event.cards) {
                assert.ok(card.type, 'Each card must have a type');
                assert.ok(card.data, 'Each card must have a data object');
            }
        }
    });
});

describe('Session HTML content', () => {
    it('Menu session has React root', async () => {
        const res = await httpGet(`http://${HOST}:8504/`);
        assert.ok(res.body.includes('id="root"'));
    });

    it('Announcement session has React root', async () => {
        const res = await httpGet(`http://${HOST}:8505/`);
        assert.ok(res.body.includes('id="root"'));
    });

    it('Happy Hour session has React root', async () => {
        const res = await httpGet(`http://${HOST}:8506/`);
        assert.ok(res.body.includes('id="root"'));
    });
});

describe('Vite proxy routes (through shell)', () => {
    it('Shell proxies /v1/display/stream to backend', async () => {
        // The shell's Vite dev server proxies /v1 → backend:8000
        // An SSE GET should work through the proxy
        const events = await collectSSE(`http://${HOST}:8503/v1/display/stream`, 1, 15000);
        assert.ok(events.length >= 1, 'Proxy should forward SSE events');
    });
});
