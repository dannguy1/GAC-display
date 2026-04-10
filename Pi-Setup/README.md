# Pi-Setup

Tooling for provisioning Raspberry Pi 4 units as GAC-Display kiosks. Each kiosk runs Chromium in fullscreen, connecting to the GAC-Display shell over the local network.

## Quick Start

```bash
./provision-kiosk.sh <PI_IP> [SERVER_IP] [PI_USER] [PI_PASS]
```

Example — provision a Pi at `192.168.10.70` pointing to server `192.168.10.3`:

```bash
./provision-kiosk.sh 192.168.10.70 192.168.10.3
```

After provisioning, reboot the Pi:

```bash
ssh gac@192.168.10.70 'sudo reboot'
```

## Prerequisites

- **Server:** `sshpass` installed (`sudo apt install sshpass`).
- **Pi:** Raspberry Pi OS 64-bit (Bookworm or Trixie), SSH enabled, on the same network.
- **Display:** TV or monitor connected via HDMI. Resolution is forced to 1920x1080@60Hz.

## Contents

| File | Purpose |
|------|---------|
| `provision-kiosk.sh` | Run from the server to fully configure a new Pi (12-step automated setup) |
| `kiosk-setup.sh` | Deployed to each Pi for IP changes and status checks |
| `kiosk-schedule.sh` | Deployed to each Pi for daily start/stop cycle |
| `kiosk.conf` | Template config with server IP and port (deployed to Pi) |
| `pi-kiosk-setup.md` | Detailed setup guide, troubleshooting, and file layout reference |
| `templates/` | Configuration templates copied to the Pi during provisioning |

### Templates

| Template | Deployed To | Purpose |
|----------|-------------|---------|
| `labwc-autostart` | `~/.config/labwc/autostart` | Boot autostart (calls kiosk-schedule.sh) |
| `labwc-environment` | `~/.config/labwc/environment` | Disables Xwayland to prevent idle CPU waste |
| `labwc-system-autostart` | `/etc/xdg/labwc/autostart` | Stripped system autostart (no desktop or taskbar) |
| `kanshi-config` | `~/.config/kanshi/config` | Locks display to 1920x1080@60Hz |

## Display Schedule

Kiosks automatically shut down and restart daily. Defaults: off at 00:00, on at 07:55.

Change the schedule:

```bash
ssh gac@<PI_IP> '~/kiosk-schedule.sh set-schedule 23:00 08:00'
```

Manual control:

```bash
ssh gac@<PI_IP> '~/kiosk-schedule.sh stop'     # Stop now
ssh gac@<PI_IP> '~/kiosk-schedule.sh start'    # Start now
ssh gac@<PI_IP> '~/kiosk-schedule.sh status'   # Check state
```

## Post-Provisioning

Change the server IP on any kiosk:

```bash
ssh gac@<PI_IP> '~/kiosk-setup.sh set-ip <NEW_SERVER_IP>'
ssh gac@<PI_IP> 'sudo reboot'
```

Check kiosk status:

```bash
ssh gac@<PI_IP> '~/kiosk-setup.sh status'
```

## More Information

See [pi-kiosk-setup.md](pi-kiosk-setup.md) for the full setup guide, what each provisioning step does, verification commands, and troubleshooting.
