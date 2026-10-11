# Server

The **Server** tab, `/?tab=server`, holds Glasshouse's own settings, in four groups: Glasshouse itself, the TV, this browser, and an Advanced section for developers and home-lab setups.

![Server tab: Glasshouse's version and updates, the app on the TV's home screen, blocking the TV's software updates, the theme, sidebar and language for this browser, and the Advanced section](../screenshots/server.png)

*Glasshouse's updates, the TV's updates, this browser's settings and Advanced.*

## Glasshouse

Shows the installed version and whether a newer release is out. **Check now** looks straight away, and **Install** appears when there is something to install. **Roll back**, under the version, puts back the version installed before, after asking first. [Updating](../managing.md#updating) covers installs from before the tab existed.

**Check for updates daily** looks once a day on its own, and lets Home Assistant offer the update.

**App on the TV's home screen** adds or removes [the dashboard's own app](../apps/tv-app.md), which opens it on the TV and is driven by the remote.

## The TV

**Block TV software updates** stops the TV installing LG's system updates, which can take away the access Glasshouse runs with. Apps, and Glasshouse's own updates, are not affected.

## This browser

The **theme**, the **sidebar** and the **language** apply to the browser they are set in, so other phones and computers keep their own.

## Advanced

Folded away, since nothing in it needs changing for everyday use. Once opened, it stays open in that browser.

* **Set the clock from a time server** switches the TV over to [a time server on the local network](../ntp.md), for networks that run one. Switched on, it asks for the server's address. Switched off, the address is kept for next time.
* **Prometheus metrics** turns on the [Prometheus endpoint](../PROMETHEUS.md).
* **Web app debugger** opens or closes Developer Mode's debugger to the network. It is closed unless it is needed, since webOS leaves it open with no password.
* **Experimental features**: hiding built-in apps from the Home screen, and custom screen savers on webOS 10 and later. See [Experimental features](../experimental.md) for why they are experimental.
