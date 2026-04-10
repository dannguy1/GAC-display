# Design Audit — Gaps & Improvement Opportunities

_Last updated: Agent protocol implementation._

## Resolved During Audit Passes

These discrepancies were found and **fixed**:

| # | Category | Issue | Resolution |
|---|----------|-------|------------|
| 1 | Spec accuracy | DESIGN.md documented `event_type: 'session'` as active protocol; shell code never handles it | Marked section as "future / not currently implemented" |
| 2 | Spec accuracy | Event Type Dispatch pseudocode showed `session → swap` branch that doesn't exist in code | Rewrote to match actual code (`content` + legacy fallback only) |
| 3 | Spec accuracy | Vision said scheduling "decided by the display-agent" — now shell-local | Updated to reflect shell-local scheduling |
| 4 | Spec accuracy | CardRenderer shown as implemented pattern — no session uses a unified renderer | Marked as "aspirational" |
| 5 | Spec accuracy | Per-Card Display Override documented as active — not implemented | Added "Not currently implemented" notice |
| 6 | Spec accuracy | Happy-hour content loading described as "self-contained" but didn't note it lacks postMessage override | Added clarification |
| 7 | **Security** | Shell `doForward()` fell back to `targetOrigin = '*'` on URL parse failure | Changed to `return` (skip the message entirely) |
| 8 | **Security** | Shell `handleSessionMessage` did not verify `e.origin` on `ready` messages | Added origin verification against `sessionUrlRef.current` |
| 9 | README | Happy-hour listed as "🔲 Planned" — fully implemented | Updated to "✅ Live" with port 8506 |
| 10 | README | Project structure only showed `menu/` session | Added all sessions, guides, test directory |
| 11 | **Agentic** | No typed message protocol — ad-hoc `ready` + untyped content blobs | Implemented typed protocol with `register`, `status`, `pong`, `content`, `ping` |
| 12 | **Agentic** | Sessions couldn't declare capabilities | Sessions now declare cardTypes, selfLoading, acceptsContent via `setupAgent()` |
| 13 | **Agentic** | No bidirectional status reporting | Sessions report `playing`, `error`, `ended` states via `reportStatus()` |
| 14 | **Agentic** | No health monitoring — shell couldn't detect crashed sessions | Shell pings agent every 10s; 30s timeout triggers recovery |
| 15 | **Agentic** | No agent registry — shell had no visibility into agent state | Agent registry tracks capabilities, state, and health |

## Open Gaps

### Security

| # | Severity | Gap | Details |
|---|----------|-----|---------|
| S1 | Low | No CSP headers configured | Vite dev server doesn't set Content-Security-Policy. Production deployment should add frame-ancestors, script-src directives. |
| S2 | Low | Static JSON files served without auth | `announcements.json`, `happy-hour.json`, `schedule.json` are publicly accessible. Acceptable for a kiosk LAN but not if exposed to the internet. |

### Robustness

| # | Severity | Gap | Details |
|---|----------|-----|---------|
| R1 | Medium | No React error boundaries | A rendering crash in any session leaves a blank screen with no recovery. Each session should wrap its stage in an error boundary that shows the idle/logo screen. |
| R2 | Medium | No content refresh for self-loading sessions | Announcement and happy-hour fetch their JSON once on mount. If the JSON file is updated, the session won't pick it up until the scheduler re-triggers a session swap (which causes a fresh iframe load). |
| R3 | Low | StrictMode double SSE in dev | React StrictMode double-mount creates 2 SSE connections in development. Harmless in production but may confuse during debugging. |
| R4 | Low | No SSE reconnect backoff | Shell's EventSource relies on the browser's native reconnect (varies by browser). A custom reconnect with exponential backoff would be more predictable. |

### Feature Gaps

| # | Priority | Gap | Details |
|---|----------|-----|---------|
| F1 | Medium | No health/monitoring endpoint | No way to remotely verify the display is running correctly. A periodic heartbeat or status API from the shell would enable monitoring. |
| F2 | Medium | Unified CardRenderer not implemented | Each session handles card dispatch inline. A shared component would reduce duplication if sessions need to render mixed card types. |
| F3 | Low | `special` and `promotion` card types planned but no session exists | Listed in Card Types table; no corresponding implementation or timeline. |
| F4 | Low | No production build/deploy pipeline | Each session builds independently via `npm run build` but there's no unified build script or deployment guide for the kiosk. |
| F5 | Low | No automated tests | No unit or integration tests exist for any session or the shell. |

## Improvement Opportunities

### Quick Wins

1. **Error boundary wrapper** — Create a shared `ErrorBoundary` component in each session that catches render errors and shows the idle/logo screen. Prevents blank kiosk screens. (~30 min per session)

2. **Periodic JSON refresh** — Add a `setInterval` in self-loading sessions (announcement, happy-hour) to re-fetch their JSON every N minutes. This allows content updates without session restarts. (~15 min per session)

3. **Unified build script** — A top-level `package.json` with `npm run build:all` that builds shell + all sessions in sequence. (~15 min)

4. **Status-driven orchestrator decisions** — The shell registry already tracks agent state. Use this to make smarter scheduling decisions (e.g., skip scheduling a session that previously reported `error`). (~30 min)

### Medium Effort

4. **Shell health endpoint** — Expose a simple `/health` route from the shell's Vite config (or a small sidecar) that returns session status, scheduler state, and SSE connection status. Enables Nagios/Uptime Kuma monitoring.

5. **Backend `event_type: 'session'` support** — When implemented, the shell could accept both scheduler-driven and backend-driven session switches, giving the display-agent emergency override capability (e.g., fire alarm announcement).

6. **Content preview mode** — A dev tool that lets operators preview how content will look before pushing to the kiosk. Could be a query param (`?preview=true`) that loads sample data.

### Longer Term

7. **Shared component library** — Extract common patterns (carousel, idle screen, error boundary, transition wrapper) into a shared package consumed by all sessions.

8. **E2E testing with Playwright** — Test the full shell → session → content flow including scheduler-triggered session switching.

9. **Remote content management** — Replace static JSON files with a simple CMS or admin API that the kiosk fetches from, enabling non-technical staff to update announcements and specials.
