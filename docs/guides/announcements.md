## Configuring Announcements

Announcements are full-screen messages displayed between menu rotations.
The announcement session loads its own content from a local JSON file
and requires no backend support.

---

## Content File

**Location:** `sessions/announcement/public/announcements.json`

```json
[
  {
    "headline": "Welcome to Garlic & Chives!",
    "body": "Authentic Vietnamese cuisine in the heart of Garden Grove.",
    "style": "info"
  },
  {
    "headline": "Happy Hour Specials",
    "body": "Half-price appetizers and $5 cocktails, weekdays 3–6 PM.",
    "style": "promo"
  },
  {
    "headline": "Kitchen Closing at 9 PM",
    "body": "Last orders at 8:45 PM. Thank you for dining with us!",
    "style": "warning"
  }
]
```

The file is a JSON array of message objects. When the announcement
session loads, it fetches this file and rotates through the messages.

---

## Message Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `headline` | string | yes | Large title text displayed prominently |
| `body` | string | yes | Supporting detail text below the headline |
| `style` | string | yes | Visual style — determines colors and icon |

## Message Styles

Three built-in styles control the card appearance:

| Style | Color | Use For |
|-------|-------|---------|
| `info` | Green | General information, welcomes, hours |
| `warning` | Gold/amber | Closing times, alerts, temporary changes |
| `promo` | Gradient (gold→green) | Specials, deals, promotions |

---

## Adding a New Announcement

Open `sessions/announcement/public/announcements.json` and add an
object to the array:

```json
[
  {
    "headline": "New Pho Special",
    "body": "Try our limited-time truffle pho, available this weekend only.",
    "style": "promo"
  }
]
```

Refresh the browser to pick up the change. No server restart needed
during development.

## Removing an Announcement

Delete the object from the array. Ensure the JSON remains valid
(no trailing commas).

## Reordering

Messages rotate in array order. Move objects up or down in the array
to change the display sequence.

---

## Display Timing

When the announcement session is active, messages rotate automatically.
Two settings control timing:

- **Rotation interval** — how long each message is shown before
  advancing to the next. Default: 10 seconds. Can be overridden if the
  shell sends a content envelope with `display.item_interval`.
- **Session duration** — how long the announcement session stays active
  before the shell returns to menu. Controlled by the schedule config
  (see [Scheduling Guide](scheduling.md)).

## Scheduling Announcements

The announcement session is activated by the shell scheduler. See the
[Scheduling Guide](scheduling.md) for how to configure when and how
often announcements appear.

Quick example — show announcements every 10 minutes for 30 seconds:

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
    }
  ]
}
```

---

## Standalone Testing

The announcement session can run independently for testing:

```bash
cd sessions/announcement
npm run dev
```

Open `http://localhost:8505` directly — it loads `announcements.json`
and rotates messages without needing the shell or backend.
