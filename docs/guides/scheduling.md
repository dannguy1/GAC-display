## Scheduling Sessions

The shell scheduler controls when non-default sessions (announcements,
promotions, etc.) interrupt the default menu display. Configuration lives
in a single JSON file that the shell reads on startup.

---

## Config File

**Location:** `shell/public/schedule.json`

```json
{
  "sessions": {
    "announcement": "http://192.168.10.3:8505",
    "happy-hour":   "http://192.168.10.3:8506"
  },
  "schedule": [
    {
      "session": "announcement",
      "type": "interval",
      "every_minutes": 10,
      "duration_seconds": 30
    },
    {
      "session": "happy-hour",
      "type": "windowed",
      "start_time": "15:00",
      "end_time": "18:00",
      "every_minutes": 5,
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "duration_seconds": 45
    }
  ]
}
```

## Structure

### `sessions`

A map of session keys to their URLs. Each key is a short name you
reference in schedule rules.

```json
"sessions": {
  "announcement": "http://192.168.10.3:8505",
  "happy-hour":   "http://192.168.10.3:8506"
}
```

### `schedule`

An array of rules. Each rule triggers a session switch when its
conditions are met. After `duration_seconds`, the shell returns
to the default menu session.

---

## Schedule Rule Types

### Interval

Show a session every N minutes, all day, starting from when the shell loads.

```json
{
  "session": "announcement",
  "type": "interval",
  "every_minutes": 10,
  "duration_seconds": 30
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session` | string | Key from `sessions` map |
| `type` | `"interval"` | Fires periodically, all day |
| `every_minutes` | number | Minutes between each activation |
| `duration_seconds` | number | How long to show before returning to menu |

### Windowed Interval

Show a session every N minutes, but only within a time window.
Ideal for recurring promotions like happy hour.

```json
{
  "session": "happy-hour",
  "type": "windowed",
  "start_time": "15:00",
  "end_time": "18:00",
  "every_minutes": 5,
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "duration_seconds": 45
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session` | string | Key from `sessions` map |
| `type` | `"windowed"` | Fires periodically within a time window |
| `start_time` | string | Window start, `"HH:MM"` (24h) |
| `end_time` | string | Window end, `"HH:MM"` (24h) |
| `every_minutes` | number | Minutes between each activation |
| `days` | string[] | Optional day filter (see below) |
| `duration_seconds` | number | How long to show before returning to menu |

### Fixed Time

Show a session at specific wall-clock times (24-hour format).

```json
{
  "session": "announcement",
  "type": "fixed",
  "times": ["11:30", "17:00", "20:30"],
  "duration_seconds": 60
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session` | string | Key from `sessions` map |
| `type` | `"fixed"` | Fires at specific times |
| `times` | string[] | Array of `"HH:MM"` times (24h) |
| `days` | string[] | Optional day filter (see below) |
| `duration_seconds` | number | How long to show before returning to menu |

### Day Filtering

Add a `days` array to restrict a rule to specific days of the week.
Day names are lowercase three-letter abbreviations.

```json
{
  "session": "announcement",
  "type": "fixed",
  "times": ["15:00"],
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "duration_seconds": 45
}
```

Valid day values: `sun`, `mon`, `tue`, `wed`, `thu`, `fri`, `sat`

---

## Multiple Rules

You can combine interval and fixed rules. Only one session switch
fires per check cycle (every 30 seconds).

```json
{
  "sessions": {
    "announcement": "http://192.168.10.3:8505"
  },
  "schedule": [
    {
      "session": "announcement",
      "type": "interval",
      "every_minutes": 10,
      "duration_seconds": 30
    },
    {
      "session": "announcement",
      "type": "fixed",
      "times": ["20:30", "20:45"],
      "duration_seconds": 60
    }
  ]
}
```

---

## How It Works

- The shell loads `schedule.json` once on startup.
- A background timer checks all rules every 30 seconds.
- When a rule fires, the shell swaps the iframe to the session URL.
- After `duration_seconds`, the shell returns to the default menu session.
- Rules are evaluated in array order — the first match wins per tick.
- If the schedule file is missing or fails to load, the scheduler stays
  idle and the menu runs uninterrupted.

### Session Switching Behavior

**Switching is immediate.** When the scheduler fires, the shell changes
the iframe `src` directly. The previous agent's page is unloaded by the
browser — there is no "prepare to exit" message. This is acceptable for
a kiosk display where there is no user state to save.

The shell does send `pause` and `resume` messages, but these are for
temporarily pausing playback within an active session, not for session
transitions.

### Duration and Early Exit

The `duration_seconds` field is a **maximum display time**. The shell
always waits for the full duration before returning to the default
session — even if the agent finishes its content early.

For example, if an announcement session has one message that displays
for 10 seconds but `duration_seconds` is 30, the agent will loop or
sit idle for the remaining 20 seconds.

To avoid dead time, size `duration_seconds` to match your content:

| Content | Suggested duration |
|---------|--------------------|
| 3 announcements × 10s each | `30` |
| 5 happy-hour specials × 8s each | `45` |
| Single fixed announcement | `15` |

> **Note:** The agent protocol defines a `status: 'ended'` state that
> agents could report when their content finishes. The shell currently
> records this state but does not act on it — early return on `ended`
> is a planned improvement.

### Only One Agent at a Time

The shell renders a single `<iframe>`. Only one agent runs at any time.
Agent overlap is structurally impossible — swapping the iframe `src`
unloads the previous page before loading the new one. The agent registry
is cleared on every swap and repopulated when the new agent registers.

## Applying Changes

- **Dev:** Edit `shell/public/schedule.json` and refresh the browser.
  Vite serves files from `public/` without bundling.
- **Production:** Edit the file in the built output and reload the kiosk.

## Default Session

The default session (menu) is configured separately via the shell's
`.env` file:

```
VITE_SESSION_MENU_URL=http://192.168.10.3:8504
```

The scheduler only controls interruptions. The menu session runs
whenever no scheduled session is active.
