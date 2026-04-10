import http from 'node:http';

/**
 * Minimal SSE server that simulates the display-agent.
 * Broadcasts session directives and content events on a loop
 * so you can test session switching without the full backend.
 *
 * Usage:
 *   node test/mock-sse.mjs
 *
 * The shell and session Vite dev servers proxy /v1 → localhost:8000,
 * so this server listens on port 8000 by default.
 */

const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8000;

const clients = new Set();

// ── Sample content payloads ──

const menuContent = {
    event_type: 'content',
    display: { item_interval: 6 },
    cards: [
        { type: 'menu_item', data: { item_name: 'Pho Tai', item_viet: 'Phở Tái', price: 12.95, description: 'Rice noodle soup with rare beef slices, fresh herbs, and rich bone broth.', category: 'Pho', image_path: '', popular: true } },
        { type: 'menu_item', data: { item_name: 'Bun Bo Hue', item_viet: 'Bún Bò Huế', price: 13.95, description: 'Spicy beef noodle soup with lemongrass, shrimp paste, and thick round noodles.', category: 'Noodle Soup', image_path: '', popular: false } },
        { type: 'menu_item', data: { item_name: 'Banh Mi Dac Biet', item_viet: 'Bánh Mì Đặc Biệt', price: 8.95, description: 'Crispy baguette with house pâté, cold cuts, pickled daikon, jalapeño, and cilantro.', category: 'Banh Mi', image_path: '', popular: true } },
    ],
};

const announcementContent = {
    event_type: 'content',
    display: { item_interval: 8 },
    cards: [
        { type: 'message', data: { headline: 'Welcome to Garlic & Chives!', body: 'Authentic Vietnamese cuisine in the heart of Garden Grove.', style: 'info' } },
        { type: 'message', data: { headline: 'Kitchen Closing at 9 PM', body: 'Last orders will be taken at 8:45 PM. Thank you for dining with us!', style: 'warning' } },
        { type: 'message', data: { headline: 'Happy Hour Specials', body: 'Half-price appetizers and $5 house cocktails every weekday 3–6 PM.', style: 'promo' } },
    ],
};

const switchToAnnouncement = {
    event_type: 'session',
    session: {
        type: 'announcement',
        url: `http://${HOST}:8505`,
        display: { duration: 25 },
    },
};

const switchToMenu = {
    event_type: 'session',
    session: {
        type: 'menu',
        url: `http://${HOST}:8504`,
        display: { duration: 0 },
    },
};

// ── SSE helpers ──

function broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        res.write(payload);
    }
    console.log(`  → broadcast ${data.event_type} to ${clients.size} client(s)`);
}

function ping() {
    for (const res of clients) {
        res.write(`event: ping\ndata: {}\n\n`);
    }
}

// ── Sequence ──

const SEQUENCE = [
    { delay: 2,  label: 'Send menu content',         data: menuContent },
    { delay: 20, label: 'Switch to announcement',    data: switchToAnnouncement },
    { delay: 2,  label: 'Send announcement content', data: announcementContent },
    { delay: 25, label: 'Switch back to menu',       data: switchToMenu },
    { delay: 2,  label: 'Send menu content',         data: menuContent },
];

async function runSequence() {
    const sleep = (s) => new Promise(r => setTimeout(r, s * 1000));

    // eslint-disable-next-line no-constant-condition
    while (true) {
        for (const step of SEQUENCE) {
            await sleep(step.delay);
            if (clients.size === 0) continue;
            console.log(`[${new Date().toLocaleTimeString()}] ${step.label}`);
            broadcast(step.data);
        }
        console.log(`\n  ── cycle complete, restarting ──\n`);
    }
}

// ── HTTP server ──

const server = http.createServer((req, res) => {
    // SSE endpoint
    if (req.url === '/v1/display/stream') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });
        res.write(`event: ping\ndata: {}\n\n`);
        clients.add(res);
        console.log(`[${new Date().toLocaleTimeString()}] Client connected (${clients.size} total)`);

        req.on('close', () => {
            clients.delete(res);
            console.log(`[${new Date().toLocaleTimeString()}] Client disconnected (${clients.size} total)`);
        });
        return;
    }

    // Health check
    if (req.url === '/v1/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', clients: clients.size }));
        return;
    }

    // Placeholder for image routes (return 404 gracefully)
    if (req.url.startsWith('/images/') || req.url.startsWith('/downloaded_images/')) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║  GAC-Display Mock SSE Server                         ║
║  SSE endpoint:  http://localhost:${PORT}/v1/display/stream  ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Sequence (loops):                                    ║
║   0s   → send menu content (3 items)                  ║
║  20s   → switch to announcement session (:8505)       ║
║  22s   → send announcement content (3 messages)       ║
║  47s   → switch back to menu session (:8504)          ║
║  49s   → send menu content again                      ║
║                                                       ║
║  Start the sessions first:                            ║
║    cd sessions/menu && npm run dev         # :8504    ║
║    cd sessions/announcement && npm run dev # :8505    ║
║    cd shell && npm run dev                 # :8503    ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);

    // Keep-alive ping every 15s
    setInterval(ping, 15_000);

    // Start the event sequence
    runSequence();
});
