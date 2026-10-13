# What the dashboard changes on the TV

Nothing on the read-only root filesystem is written. Everything below other
than the server's own files happens only when the owner switches it on, and the
riskier controls ask for confirmation in the dashboard first.

## Files and startup

| Change | Where | Undone by |
| :----- | :---- | :-------- |
| The server, its config and state | `/var/lib/tvweb` | Uninstalling |
| Boot hook that starts the server | `/var/lib/webosbrew/init.d/50-tvweb`, a link into the app when installed from the Homebrew Channel | Uninstalling |
| Boot log | `/var/lib/webosbrew/tvweb-boot.log`, kept under 32 KB | Uninstalling |
| Boot hook that holds switched-off services down | `/var/lib/webosbrew/init.d/20-tvweb-services`, only once a service is switched off | Switching the services back on, or uninstalling |
| Home-screen tile | The Homebrew Channel app, or with `deploy.sh` a developer app | Removing the app |
| Packages being installed | `/media/developer/temp/glasshouse-install`, deleted when the install ends or at the next start | Itself |
| Install job and services run as root | `install-job.json` and `elevated.json` in `/var/lib/tvweb` | Uninstalling |

Installed from the Homebrew Channel, uninstalling the app stops the server
starting at boot straight away, and within a few minutes the server removes the
rest, including its Home Assistant entities. Installed with `deploy.sh`, see
[Uninstalling](managing.md#uninstalling).

## Features that change how the TV runs

These last until a reboot and are put back by the boot hook, so they end with
the first reboot after uninstalling.

| Feature | What it does | Undone by |
| :------ | :----------- | :-------- |
| Ad blocker | Bind-mounts a replacement `/etc/hosts`, carrying over the lines other tools such as AmazOff add to it | Switching it off |
| Hidden home-screen tiles | Bind-mounts edited `appinfo.json` files, then has the app manager reread them: where the TV has LG's blocked-app list in configd (webOS 9 does, webOS 4 doesn't), by briefly adding an id no app has to LG's blocked-app list in configd and putting the list back, and otherwise by restarting it. Experimental: turned on under Server → Advanced → Experimental features. Not offered when installed from the Homebrew Channel, since the restart happens during boot | Switching tile hiding off |
| Apps no longer kept ready in the background | Sets `isEnabled` false for each in configd's `com.webos.service.preloadmanager.supportAppList`, which the TV keeps as a changed setting, and tells the preload manager at once. An app already loaded stays until it is next closed or the TV restarts. Put back at start if the list loses them | Switching each back on, which gives it LG's own setting again. The list stays a changed setting, which the TV has no way to remove, and uninstalling leaves the apps switched off |
| Switched-off background services | Stops them and masks their systemd units under `/run`, then stops any found running again every five minutes | Switching them back on |
| Debugger closed to the network | Adds a firewall rule dropping port 9998 (WebAppMgr's DevTools, opened by Developer Mode) on every interface but loopback. Put back each time the server starts, not by the boot hook | `allowNetworkDebugger` in `config.json` or toggled from the Server tab, uninstalling from the Homebrew Channel, a reboot after any other uninstall, or `iptables -D INPUT -p tcp --dport 9998 ! -i lo -j DROP` |
| Clock set from an NTP server | With a time server set on the Server tab, or `ntp.server` in `config.json`, sets the TV's clock through its time service, hourly and when the TV switches on. The service records the time as coming from LG's time servers | Switching it off on the Server tab, or emptying `ntp.server`. The clock stays as set until LG's next sync |
| Home screen layout | On webOS 9, writes a copy of LG's own Home screen layout without the parts switched off to `/mnt/lg/cmn_data/manifest/`, where the home app looks before its built-in one, and restarts the home app after deleting its saved copies (`/tmp/checkpoint` and `/mnt/lg/cmn_data/checkpoint`), which the TV makes again. Input tiles are LG's own launch points, recorded in `home-inputs.json` in `/var/lib/tvweb` | **Put back LG's Home screen** on the Apps tab, or `tvwebctl restore-home` before uninstalling |
| Replacement screen saver | Bind-mounts over the built-in screen saver app. Experimental on webOS 10 and later, where the built-in one is a Flutter app: turned on from the Screensaver tab, or under Server → Advanced → Experimental features | Choosing the stock screen saver |

## Changes that stay

These go through LG's own services and persist like any change made in the TV's
menus. Uninstalling the dashboard leaves them as they are.

| Change | Note |
| :----- | :--- |
| Uninstalling an app | Permanent; reinstall it from the LG Content Store |
| Installing an app | Installed as a developer app; remove it from the Apps tab or the Homebrew Channel. Its services stay elevated to root if that was chosen |
| Picture mode, energy saving, sound output, Quick Start+, sleep timer, Quick Access keys | Ordinary TV settings |
| Screen Shift, Logo Luminance Adjustment | OLED panel settings in the TV's own menus |
| Global Stress Reduction and Temporal Peak Control | OLED burn-in protections. Switching one off asks for confirmation, and neither is exposed to Home Assistant. Not switched back on by uninstalling |
| Service menu lock | Unlocking asks for confirmation. Not locked again by uninstalling |
| Privacy consents, advertising ID reset, advertising cookies | The same agreements as in the TV's settings |
| LG's blocked-app list | Where hidden tiles or a screen saver switch use it, it is put back with LG's value but saved as a changed setting, which the TV has no way to remove. It keeps that value if LG's own list later changes with a firmware update or a new country. Not undone by uninstalling |

## Network

The dashboard listens dual-stack on port 8080 (IPv4-only on a kernel without
IPv6), on the whole network unless it is limited
to the TV itself in `config.json` or from Settings on the TV. Installed from the
Homebrew Channel it starts limited to the TV, until the owner opens it during
setup. While a phone is being used to enter Home Assistant details,
port 8081 answers a one-time code for up to ten minutes. The server connects out
only to the configured MQTT broker, to the NTP server when one is configured,
and, when update checks are switched on, to GitHub's releases API. Update checks are off by default.
