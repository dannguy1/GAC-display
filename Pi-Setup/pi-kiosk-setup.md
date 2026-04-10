# GAC Kiosk Setup

Turn a Raspberry Pi into a GAC-Display kiosk.

## Requirements

- **Hardware:** Raspberry Pi 4 (4 GB or 8 GB), microSD card, power supply, HDMI cable, TV or monitor (1080p recommended).
- **Software:** Raspberry Pi OS (64-bit, Bookworm or Trixie) — flash with Raspberry Pi Imager.
- **Network:** Pi and GAC server on the same network, SSH enabled on the Pi.

> **Tip:** When flashing with Raspberry Pi Imager, set the hostname, enable SSH, and configure the user/password in the OS customization screen.

## Quick Start (Automated)

From the GAC server, run the provisioning script:

```bash
cd Pi-Setup
./provision-kiosk.sh <PI_IP> [SERVER_IP] [PI_USER] [PI_PASS]
```

**Example:**

```bash
# Pi at 192.168.10.70, server at 192.168.10.3, default user/pass (gac/gac12345)
./provision-kiosk.sh 192.168.10.70 192.168.10.3

# Custom credentials
./provision-kiosk.sh 192.168.10.70 192.168.10.3 pi raspberry
```

After provisioning, reboot the Pi:

```bash
ssh gac@192.168.10.70 'sudo reboot'
```

The kiosk display should appear within 30 seconds of boot.

## What the Provisioner Does

| Step | Action | Why |
|------|--------|-----|
| 1 | Install `unclutter` | Hides the mouse cursor |
| 2 | Set `gpu_mem=128` | More GPU memory for smooth rendering |
| 3 | Force 1920x1080@60Hz | Locks resolution via firmware + kanshi for consistent display |
| 4 | Disable desktop and taskbar | Frees ~85 MB RAM and CPU |
| 5 | Remove `--force-renderer-accessibility` | Reduces Chromium rendering overhead |
| 6 | Configure labwc autostart | Launches kiosk via `kiosk-schedule.sh` on boot |
| 7 | Disable Xwayland | Prevents ~60% idle CPU waste |
| 8 | Set `vm.swappiness=10` | Keeps Chromium in RAM |
| 9 | Disable PackageKit | Stops background update checks |
| 10 | Deploy management scripts | `kiosk-setup.sh`, `kiosk-schedule.sh`, `kiosk.conf` |
| 11 | Configure display schedule | Cron: stop at 00:00, start at 07:55 |
| 12 | Disable screen blanking | Prevents display sleep |

## Display Schedule

The kiosk automatically stops and starts on a daily schedule. Default times are configured in `~/kiosk.conf`:

```text
SLEEP_TIME=00:00    # Display off (HDMI disabled, Chromium killed)
WAKE_TIME=07:55     # Display on (HDMI enabled, Chromium launched)
```

Change the schedule:

```bash
# One command — updates config + cron
~/kiosk-schedule.sh set-schedule 23:00 08:00

# Or edit ~/kiosk.conf manually, then apply
~/kiosk-schedule.sh apply
```

Manual control:

```bash
~/kiosk-schedule.sh stop     # Shut down display now
~/kiosk-schedule.sh start    # Start display now
~/kiosk-schedule.sh status   # Show state + schedule
```

The schedule log is at `~/kiosk-schedule.log`.

## Changing the Server IP

SSH into any provisioned kiosk and run:

```bash
~/kiosk-setup.sh set-ip 10.0.1.50
sudo reboot
```

Or check the current configuration:

```bash
~/kiosk-setup.sh status
```

## File Layout on the Pi

```text
~/kiosk.conf                         Server IP and port config
~/kiosk-setup.sh                     IP change and status script
~/kiosk-schedule.sh                  Daily start/stop + Chromium launcher
~/kiosk-schedule.log                 Schedule activity log
~/.config/labwc/autostart            Boot autostart (calls kiosk-schedule.sh)
~/.config/labwc/environment          Wayland settings (Xwayland disabled)
~/.config/kanshi/config              Display resolution lock (1920x1080@60Hz)
/etc/xdg/labwc/autostart             System autostart (desktop/panel stripped)
/etc/chromium.d/00-rpi-vars          Chromium default flags (accessibility removed)
/boot/firmware/config.txt            GPU memory + HDMI 1080p force
/etc/sysctl.d/99-kiosk.conf          Swappiness setting
```

## File Layout in the Repo

```text
Pi-Setup/
  provision-kiosk.sh                 Run from server to set up a new kiosk
  kiosk-setup.sh                     Deployed to Pi for IP management
  kiosk-schedule.sh                  Deployed to Pi for daily start/stop
  kiosk.conf                         Template config deployed to Pi
  pi-kiosk-setup.md                  This document
  templates/
    labwc-autostart                  Boot autostart template
    labwc-environment                Wayland environment (disables Xwayland)
    labwc-system-autostart           Stripped system autostart
    kanshi-config                    Display resolution lock (1920x1080@60Hz)
```

## Verification

After reboot, SSH in and confirm:

```bash
# Quick check via the management script
~/kiosk-setup.sh status

# Xwayland should NOT be running
ps aux | grep Xwayland | grep -v grep || echo "Xwayland: not running ✓"

# CPU should be < 5% when idle
top -bn2 -d2 | grep '%Cpu' | tail -1

# GPU memory should be 128 MB
vcgencmd get_mem gpu

# No desktop or taskbar processes
ps aux | grep -E 'pcmanfm|wf-panel' | grep -v grep || echo "Desktop/panel: not running ✓"
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| ~60% CPU at idle | Xwayland running | Check `~/.config/labwc/environment` has `WLR_XWAYLAND=` |
| Display not 1080p | TV defaulted to 4K/other | Check `wlr-randr`, verify kanshi config at `~/.config/kanshi/config` |
| "Connecting to Server" / no menu | Origin mismatch | Kiosk URL must match `VITE_SHELL_ORIGIN` — use IP, not hostname |
| Display drops to idle | SSE lost or OOM | Check `free -h` and `dmesg \| grep -i oom` |
| Taskbar visible | System autostart not replaced | Re-run provisioner or copy `templates/labwc-system-autostart` |
| Screen goes blank | Screen blanking on | `sudo raspi-config` > Display > Screen Blanking > Disable |
| Cannot connect | SSH disabled or wrong IP | Check Pi is on, `ping PI_IP`, verify SSH is enabled |

## Manual Setup

If you prefer to configure manually instead of using the provisioner, see the individual steps in [provision-kiosk.sh](provision-kiosk.sh) — each step is clearly labeled and can be run independently.