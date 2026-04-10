/**
 * Session scheduler for the GAC-Display shell.
 *
 * Reads a schedule config and fires callbacks when a session switch is due.
 * Supports three schedule types:
 *   - "interval":  fire every N minutes (from scheduler start, all day)
 *   - "windowed":  fire every N minutes only within a time window (HH:MM–HH:MM)
 *   - "fixed":     fire at specific wall-clock times (HH:MM, 24h format)
 *
 * Config is loaded from /schedule.json (shell's public/ directory).
 */

/**
 * Default schedule — used if /schedule.json fails to load.
 * @type {ScheduleConfig}
 */
const DEFAULT_CONFIG = {
    sessions: {},
    schedule: [],
};

/**
 * @typedef {Object} ScheduleRule
 * @property {string} session   - Session key (must exist in config.sessions)
 * @property {"interval"|"windowed"|"fixed"} type
 * @property {number} [every_minutes]      - For "interval" and "windowed" types
 * @property {string} [start_time]         - For "windowed" type, e.g. "15:00"
 * @property {string} [end_time]           - For "windowed" type, e.g. "18:00"
 * @property {string[]} [times]            - For "fixed" type, e.g. ["20:30", "20:45"]
 * @property {string[]} [days]             - Optional day filter: ["mon","tue",…]
 * @property {number} duration_seconds     - How long to show the session
 */

/**
 * @typedef {Object} ScheduleConfig
 * @property {Record<string, string>} sessions  - Map of session key → URL
 * @property {ScheduleRule[]} schedule
 */

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Parse "HH:MM" into { hour, minute }.
 */
function parseTime(s) {
    const [h, m] = s.split(':').map(Number);
    return { hour: h, minute: m };
}

/**
 * Check if a fixed-time rule should fire right now.
 * Uses a tolerance window so the 30-second check interval doesn't miss it.
 */
function isFixedTimeDue(rule, now, toleranceMs) {
    // Day filter
    if (rule.days && rule.days.length > 0) {
        const today = DAY_NAMES[now.getDay()];
        if (!rule.days.includes(today)) return false;
    }

    for (const t of rule.times) {
        const { hour, minute } = parseTime(t);
        const target = new Date(now);
        target.setHours(hour, minute, 0, 0);
        const diff = Math.abs(now - target);
        if (diff <= toleranceMs) return true;
    }
    return false;
}

/**
 * Check if the current time falls within a start_time–end_time window.
 * Also checks the optional day filter.
 */
function isInTimeWindow(rule, now) {
    if (rule.days && rule.days.length > 0) {
        const today = DAY_NAMES[now.getDay()];
        if (!rule.days.includes(today)) return false;
    }
    const start = parseTime(rule.start_time);
    const end = parseTime(rule.end_time);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

/**
 * Create and start a scheduler.
 *
 * @param {(url: string, durationSecs: number) => void} onSwitch
 *   Called when a scheduled session should be shown.
 * @returns {{ stop: () => void }} Cleanup handle.
 */
export function startScheduler(onSwitch) {
    let config = DEFAULT_CONFIG;
    let intervalId = null;
    let stopped = false;

    // Track last fire time per rule index (for interval type)
    const lastFired = new Map();

    const CHECK_INTERVAL_MS = 30_000; // check every 30 seconds
    const FIXED_TOLERANCE_MS = CHECK_INTERVAL_MS; // match window for fixed times

    function tick() {
        if (stopped) return;
        const now = new Date();

        for (let i = 0; i < config.schedule.length; i++) {
            const rule = config.schedule[i];
            const url = config.sessions[rule.session];
            if (!url) continue;

            let shouldFire = false;

            if (rule.type === 'interval' && rule.every_minutes > 0) {
                const last = lastFired.get(i) || 0;
                const elapsed = now.getTime() - last;
                if (elapsed >= rule.every_minutes * 60_000) {
                    shouldFire = true;
                }
            } else if (rule.type === 'windowed' && rule.every_minutes > 0 &&
                       rule.start_time && rule.end_time) {
                if (isInTimeWindow(rule, now)) {
                    const last = lastFired.get(i) || 0;
                    const elapsed = now.getTime() - last;
                    if (elapsed >= rule.every_minutes * 60_000) {
                        shouldFire = true;
                    }
                }
            } else if (rule.type === 'fixed' && rule.times?.length > 0) {
                // Only fire if we haven't already fired in this window
                const last = lastFired.get(i) || 0;
                const elapsed = now.getTime() - last;
                if (elapsed > FIXED_TOLERANCE_MS * 2 &&
                    isFixedTimeDue(rule, now, FIXED_TOLERANCE_MS)) {
                    shouldFire = true;
                }
            }

            if (shouldFire) {
                lastFired.set(i, now.getTime());
                onSwitch(url, rule.duration_seconds || 30);
                // Only one session switch per tick
                return;
            }
        }
    }

    // Load config then start ticking
    fetch('/schedule.json')
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(cfg => {
            if (stopped) return;
            config = { ...DEFAULT_CONFIG, ...cfg };
            if (config.schedule.length > 0) {
                intervalId = setInterval(tick, CHECK_INTERVAL_MS);
            }
        })
        .catch(() => {
            // No schedule file — scheduler stays idle
        });

    return {
        stop() {
            stopped = true;
            if (intervalId) clearInterval(intervalId);
        },
    };
}
