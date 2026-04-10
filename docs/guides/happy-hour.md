## Configuring Happy Hour

The happy-hour session displays drink and appetizer specials with
discounted prices and a live countdown timer. It loads its own content
from a local JSON file and is scheduled by the shell.

---

## Content File

**Location:** `sessions/happy-hour/public/happy-hour.json`

```json
{
  "title": "Happy Hour",
  "subtitle": "Weekdays 3–6 PM",
  "end_hour": 18,
  "end_minute": 0,
  "background_image": "",
  "specials": [
    {
      "name": "House Saigon Lager",
      "category": "Drinks",
      "description": "Crisp Vietnamese-style lager, ice cold.",
      "price": 5.00,
      "original_price": 8.00,
      "image_path": "",
      "tag": "Half Price"
    }
  ]
}
```

---

## Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Large header text (e.g., "Happy Hour") |
| `subtitle` | string | Subheader (e.g., "Weekdays 3–6 PM") |
| `end_hour` | number | Hour the happy hour ends (24h format, e.g., 18 = 6 PM) |
| `end_minute` | number | Minute the happy hour ends (e.g., 0) |
| `background_image` | string | Optional background image path (from backend `/images/` or `/downloaded_images/`) |
| `specials` | array | List of special items to rotate through |

## Countdown Timer

The countdown uses `end_hour` and `end_minute` to calculate time
remaining based on the viewer's local clock. When the countdown
reaches zero, it displays "Happy Hour has ended."

## Special Item Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Item name |
| `category` | string | yes | Category label (Drinks, Cocktails, Appetizers) |
| `description` | string | no | Short description |
| `price` | number | yes | Happy hour price |
| `original_price` | number | no | Regular price (shown with strikethrough) |
| `image_path` | string | no | Image path (served by GAC-Concierge backend) |
| `tag` | string | no | Badge text shown on the image (e.g., "Half Price", "Special") |

---

## Adding a Special

Add an object to the `specials` array:

```json
{
  "name": "Lemongrass Martini",
  "category": "Cocktails",
  "description": "Vodka, lemongrass syrup, lime, and Thai basil.",
  "price": 8.00,
  "original_price": 14.00,
  "image_path": "",
  "tag": "New"
}
```

## Removing a Special

Delete the object from the `specials` array. Ensure the JSON remains
valid (no trailing commas).

---

## Background Image

Set `background_image` to a path served by the backend:

```json
"background_image": "./downloaded_images/happy_hour_bg.jpg"
```

The image renders full-screen behind a dark gradient overlay, creating
an ambient effect without obscuring the card content.

Leave empty (`""`) for a solid dark background.

---

## Visual Theme

The happy-hour session uses a dark theme distinct from the menu:

- Dark background (#0f0a06) with gold accents
- Cards with dark surface (#1a120d) and gold borders
- Strikethrough original prices with highlighted discounted prices
- Tag badges in gold gradient

---

## Scheduling

The shell scheduler activates the happy-hour session. Edit
`shell/public/schedule.json`:

```json
{
  "sessions": {
    "happy-hour": "http://192.168.10.3:8506"
  },
  "schedule": [
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

The `windowed` type shows the happy-hour session every 5 minutes, but
only between 3:00 PM and 6:00 PM on weekdays. Each appearance lasts
45 seconds before returning to the menu.

See [Scheduling Guide](scheduling.md) for all scheduling options.

---

## Standalone Testing

```bash
cd sessions/happy-hour
npm install && npm run dev
```

Open `http://localhost:8506` directly. The session loads its specials
and countdown timer without needing the shell or backend.

## Dev Server Port

The happy-hour session runs on **port 8506** during development.
