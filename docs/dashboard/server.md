# Server

The **Server** tab, `/?tab=server`, holds Glasshouse's own settings: Glasshouse itself and an Advanced section for developers and home-lab setups. Preferences for this browser (theme, sidebar, and language) are located in the sidebar navigation area.

![Server tab: Glasshouse's version and updates, the app on the TV's home screen, and the Advanced section](../screenshots/server.png)

*Glasshouse's updates and the Advanced section.*

## Glasshouse

Shows the installed version and whether a newer release is out. **Check now** looks straight away, and **Install** appears when there is something to install, with **What's new**: a short summary of what each release since the installed one brings, newest first, and a link to its full notes. **Roll back**, under the version, puts back the version installed before, after asking first. [Updating](../managing.md#updating) covers installs from before the tab existed.

**Check for updates daily** looks once a day on its own, and lets Home Assistant offer the update.

**Server health** shows the background process uptime and memory footprint on the TV.

**App on the TV's home screen** adds or removes [the dashboard's own app](../apps/tv-app.md), which opens it on the TV and is driven by the remote.

## Advanced

Folded away, since nothing in it needs changing for everyday use. Once opened, it stays open in that browser.

* **Set the clock from a time server** switches the TV over to [a time server on the local network](../ntp.md), for networks that run one. Switched on, it asks for the server's address. Switched off, the address is kept for next time.
* **Prometheus metrics** turns on the [Prometheus endpoint](../PROMETHEUS.md).
* **Watch time** counts how long the screen is on, per app and input, for [the Metrics tab](metrics.md#watch-time) and Home Assistant. It is off by default, as it records what the household watches. **Clear history** deletes what has been kept, whether counting is on or off.
* **Web app debugger** opens or closes Developer Mode's debugger to the network. It is closed unless it is needed, since webOS leaves it open with no password.
* **Experimental features**: hiding built-in apps from the Home screen, and custom screen savers on webOS 10 and later. See [Experimental features](../experimental.md) for why they are experimental.
