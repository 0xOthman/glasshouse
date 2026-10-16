# Experimental features

Three features are experimental and off by default. They are turned on under **Server** → **Advanced** → **Experimental features**.

## Hiding home screen system apps

Hides built-in LG apps, such as Gallery, Music and Sports, from the Home screen ribbon. Once it is turned on, the apps to hide are chosen on the **Apps** tab. It is experimental on every TV.

## Custom screen savers on webOS 10 and later

Replaces LG's screen saver with one of the dashboard's own, chosen on the **Screensaver** tab. It is experimental only on webOS 10 and later, where the Screensaver tab itself also has the switch, above the list. On webOS 9 and earlier, custom screen savers work without turning anything on.

## Home screen layout on webOS 10

Switches off parts of LG's Home screen, chosen on the **Apps** tab under **Home screen layout**, which also has the switch, with its warning. On webOS 9 it works without turning anything on.

webOS 10's home app keeps its layout on the TV's read-only system and looks nowhere else for it, so Glasshouse lays its own over LG's with an overlay mount and restarts the home app to read it. The mount does not survive a restart of the TV, so it is put back when Glasshouse starts, and LG's Home screen can show for a moment before that. It has been tried through Glasshouse on a C2 with webOS 10.3.1, and on a few other webOS 10 TVs outside it. **Put back LG's Home screen**, or switching it off, takes the overlay away and brings LG's Home screen back. It does not restart the app manager, so the problem below does not apply to it.

## Why the first two are experimental

To apply either one, the TV's app manager has to read its apps again. Up to now that meant restarting it when the TV starts up, and on some TVs that restart has been followed by a black picture or lost sound that only a full reboot clears ([#366](https://github.com/rorygallagher2024/glasshouse/issues/366)):

* On a B8 (webOS 4), live TV and HDMI went black. The TV's kernel log showed its video pipeline crashing and locking up during start-up, at the same moment as the restart, while a source on HDMI was changing its picture mode.
* On webOS 10 and 11, picture, sound to a soundbar over ARC, and HDMI-CEC have been lost, alongside reports of a black screen and stuck picture settings.

It doesn't happen on every start-up, or on every TV. A TV that already used either feature before it became experimental keeps it after updating.

Where the TV has the setting LG uses to block apps by region, the dashboard now has the app manager reread its apps through it, without restarting it, and restarts it only if that doesn't take. webOS 9 has the setting and webOS 4 doesn't; other versions are checked on the TV itself, and fall back to the restart without it. Both features stay experimental until TVs that have shown the fault confirm it is gone.

If it happens, please add to [#366](https://github.com/rorygallagher2024/glasshouse/issues/366) rather than opening a new issue, with the output of these, run before restarting the TV:

```sh
dmesg | grep -i -E "Unhandled fault|blocked!!|kadp"
luna-send -n 1 -f luna://com.webos.service.videooutput/getStatus '{}'
cat /var/lib/webosbrew/tvweb-boot.log
```
