# TV research

Findings about how LG's webOS works, kept so the same ground is not covered
twice. Each entry names the TV and webOS version it was found on. For how
Glasshouse itself works, see [IMPLEMENTATION.md](../IMPLEMENTATION.md).

## Which window has the remote (webOS 6.4.0, C1)

- `com.webos.applicationManager/getForegroundAppInfo` names only the app
  beneath LG's own windows: with Settings, User Guide, Home or Quick Settings
  open over HDMI 3 it still reports `com.webos.app.hdmi3`.
- `com.webos.surfacemanager/getForegroundAppInfo` lists the windows on screen,
  each with `appId`, `displayId` and `windowType`: HDMI 3 as
  `_WEBOS_WINDOW_TYPE_CARD`, Settings (`com.palm.app.settings`) as
  `_WEBOS_WINDOW_TYPE_OVERLAY`, and Home (`com.webos.app.home`) as
  `_WEBOS_WINDOW_TYPE_HOME`, not as an overlay. Opening User Guide from
  Settings replaces the overlay with `com.webos.app.tvuserguide`.
- Quick Settings (`com.webos.app.quicksettings`) is not in that list. It is in
  `com.webos.surfacemanager/getFocusedWindowInfo` and
  `getForegroundWindowInfo`, as `SYSTEM_UI_TYPE_OVERLAY`. The focused window
  is the one the remote's keys reach.
- All three accept `subscribe: true`. SurfaceManager's replies are formatted
  JSON over several lines even without luna-send's `-f`.

## Disconnected input devices (webOS 6.4.0, C1)

A stale evdev descriptor can remain readable to `select` while reads fail or
return EOF. Retrying without closing it creates a busy loop. On 14 October
2026, the remote-button worker reached 8.16 million read calls with only
451 KB read, and a `top` sample showed 85% CPU. Reopening its devices stopped
the loop. The patched worker closes EOF/permanent-error descriptors, retains
EAGAIN/EINTR descriptors, and retries discovery every five seconds. Four
minutes after deployment it had 189 read calls and 0.1% lifetime CPU.

## Home screen (webOS 9.2.2, C2)

**The home app** is `com.webos.app.home`, a native QML app in
`/usr/palm/applications/com.webos.app.home/qml`. The source is readable. It
uses the "multiple home" layout (`isMultipleHome`), built from
`Standalone/Components`.

**The first screen is laid out from an XML file.** `MainView_M.qml` loads
`/mnt/lg/cmn_data/manifest/home_layoutShelfView.xml` (or `home_layout.xml`,
depending on `testLayout`), and falls back to the copy in
`qml/UserInterfaceLayer/` when that is missing or empty. The folder does not
exist on a stock C2 and is writable. LG's file lists four parts:

| `type` | On screen |
|---|---|
| `Hero` | The banner, and the profile, notification, settings and search icons beside it |
| `Qcard` | The coloured "Quick Card" ribbon: Get Special Offers, Sports, Gaming, Music |
| `AppList` | The app tiles |
| `AdShelf` | Recent Input and Device Functions (Edit App List, TV Guide, User Guide, Home Hub) |

A layout with only `<item type="AppList" itemX="24" itemY="24" itemWidth="1872"
itemHeight="173" focus="true" option="webOS24"/>` shows the app tiles alone at
the top. The `<layout>` element also takes `bgColor`, and `type` can be
`ShelfView`, `LifeStyle` or `TabView`.

**Moving the parts is not possible.** The parts stack one under another from
the top: `itemY` on the app list, `vMargin` on `<layout>`, and a `margin` item
(whose `MarginComponent.qml` is missing from this firmware) all left the app
tiles at the top. Only the banner uses its `itemY`.

**The rows below the first screen** (Live TV, LG Channels, Shopping, Amazon,
Editor's Pick and others) come from LG's server, as `ai_home_info` in the reply
to a `service_setting_secure` `getConfig` request with `requester: ai_home`.
The home app logs that reply to `/var/log/home`. No setting or layout attribute
turns them off: `Model/ShelfList.js` `_filterShelfItem()` decides which are
shown, so removing them means changing that file.

**With Home Promotion off** (`general.homePromotion`), the banner does not go
away: it shows "Start a new experience with webOS." and a Go to Apps button.
With Content Recommendation off as well (`other.contentRecommendation`), the
advert row shows Recent Input and Device Functions instead.

**An HDMI input can be a Home tile.** `applicationManager/addLaunchPoint` with
`{ id: "com.webos.app.hdmi2", title: "Mac", params: {} }` is accepted, and the
tile shows LG's HDMI icon and opens the input.

**A tile can be moved.** `applicationManager/moveLaunchPoint` with
`{ launchPointId, position }` (0 is first) changes the order the app manager
lists, and the order stays, but the home app shows it only once it starts
again. A tile added with `addLaunchPoint` goes at the end of the apps, and
shows straight away.

**The banner cannot be blanked.** The layout's other banner types,
`AlwaysReadyPreview` and `Seiro`, in the `Hero` item's place, draw the same
picture, "Start a new experience with webOS." and Go to Apps button while Home
Promotion is off. That picture and text are in the home app's own files.

**The home app reads its layout only when it starts.** Reopening Home does not
reload it. Restarting it:

- `applicationManager/closeByAppId` only sends it to the background.
- Killing the process makes the TV restore it from its CRIU checkpoint, so the
  old layout comes back. The checkpoint is in `/tmp/checkpoint/com.webos.app.home`,
  restored from a copy in `/mnt/lg/cmn_data/checkpoint/com.webos.app.home`
  (LG's `criu_copy_img.sh` copies one to the other at boot). With only the
  `/tmp` copy deleted, the kill restored the flash copy and the old layout;
  with both deleted, it starts fresh.
- A fresh start makes a new checkpoint straight away, and a restart afterwards
  restores that one.

**At boot the home app starts fresh.** After `reboot` (`/sys/power/mode` reads
`resume`), it was a new process (pid 2442 is simply its place in the boot
order), and the copy in flash was rejected: `criu images( com.webos.app.home )
hashes are different !!.. will be deleted` in `dmesg`. So:

- The layout file survives a restart, and a power-on after the TV was unplugged
  at the wall, with nothing re-applied, since a fresh start reads it. Both
  booted with `/sys/power/mode` reading `resume` and the home app started fresh.
- A bind mount over one of the app's files (a changed `ShelfList.js`) does not:
  the home app starts about 5 s into boot, before anything a rooted TV runs, so
  it has to be mounted again and the home app restarted.

**Undoing it**: deleting `/mnt/lg/cmn_data/manifest` and restarting the home app
brings back LG's layout. Launch points added with `addLaunchPoint` are removed
with `removeLaunchPoint`.

**Which TVs have this home app.** Glasshouse's Home screen layout is offered
only on webOS 9. webOS 3 and 4 have a different, plainer home app, and webOS 10
and later have a Flutter one (its log lines come from `flutter-client`). The
QML has code for LG's webOS 23 (`webOS23Test`, the `webOS23` app list style),
so a webOS 8 TV may read the same layout file; that has not been tried.

## The clock since boot stops in suspend (webOS 4.4.3, B8)

With Quick Start, the B8 suspends in standby, and `/proc/uptime` and `/proc/stat`'s `btime` leave the suspended time out: rebooted at 07:47 UTC and put in standby twice, it gave its boot as 18:18 the same day. Time since boot, and a boot time worked out from it, are wrong on such a TV after its first standby.

## Keeping a TV awake while off (webOS 4.4.3, B8)

The question was whether the B8 could stay reachable while switched off, as
the C2 does with LG's Stay connected (`general.alwaysOn`, Active Standby at
12.5 W). It cannot in any useful way.

- **Switching off passes through Active Standby**: screen off, everything
  running, at about **37 W** on an OLED65B8SLC (50 W on). With Quick Start+
  it then suspends to RAM, and the PSU clicks off. Panel maintenance after
  switch-off runs in that Active Standby state.
- **`com.webos.service.tvpower` takes votes.** Programs register with
  `power/registerSuspendRequest`, `registerPrepareSuspend` and
  `registerActiveStandbyRequest` (`{ clientName, subscribe: true }`), and
  answer with the matching `response…` method. `power/getClientList` lists
  them; besides LG's services, `homekit`, `physical-device-manager` and
  `webos-connman-adapter` ask for Active Standby, and the AirPlay module
  votes on suspend. homekit answers `{ "clientName", "ack": true|false,
  "timestamp" }`, echoing the request's timestamp.
- **Refusing to suspend does not keep it awake.** With a client registered on
  all three answering `ack: false` to suspend and `ack: true` to Active
  Standby, the next switch-off went from 37 W to 0 W and the TV booted from
  scratch when switched on again (uptime 156 s, power-on reason `remoteKey`),
  instead of resuming. A switch-off with no such client resumed with its
  uptime intact.
- Even held there, 37 W around the clock is about 0.9 kWh a day. The low-power
  awake state behind Stay connected arrived with LG's 2022 TVs (webOS 7).

## Standby power with Stay connected (webOS 9.2.2, C2)

With `general.alwaysOn` on and the TV switched off (`power/getPowerState`
reads Active Standby), an OLED42C24LA drew 11.9 to 12.2 W at the wall. The
processor is fixed at 1.4 GHz (the only frequency offered, `performance`
governor), and LG runs three of its four cores, switching cores on and off
itself (224 core starts in five hours). About 40% of those three cores was in
use: `ls-hubd`, `iconnectivity`, Glasshouse's server and YouTube kept ready.
None of it showed at the wall:

| Change | Draw |
|---|---|
| None | 12.0 W |
| Glasshouse's server and watchdog stopped | 11.9 to 12.2 W |
| Also down to two cores (LG kept bringing a third back) | 11.9 to 12.1 W |

`iconnectivity` cannot be stopped: `ls-hubd` starts it again on demand within
5 s. The load average of about 12 comes from a dozen of LG's driver threads in
uninterruptible sleep, not from work.

## LG's blocked-app list on webOS 10 (C2, webOS 10.3.1)

On a C2 updated to webOS 10.3.1, adding an app on the Home screen
(`com.webos.app.camera`) to configd's `profile.blockedAppList` left it on Home
and sam's pid unchanged, checked from 0.01 s to 10 s after. On webOS 9.2.2 the
same change takes the app off Home within 2 s, which is how tile hiding and
screen savers make sam reread apps without restarting it (#366). On webOS 9.2.2
`/usr/sbin/sam` names `profile.blockedAppList`; whether webOS 10's does is not
yet known.

## The TV's time zone (C5, webOS 10.3.1)

`com.webos.service.systemservice/time/getSystemTime` gives the time zone with
the time: `localtime` as year, month, day, hour, minute and second, `utc` in
Unix seconds, `offset` in minutes (120 in Ljubljana in October), `timezone`
(`Europe/Ljubljana`), `TZ` (`CEST`), `isDST` and `timeValid`. `localtime` less
`utc` matched `offset`. Watch time works its offset out from `localtime` and
`utc`. Which of these fields older webOS versions give is not yet known.

## Toasts as the screen comes on (C4, webOS 10.3.1)

A toast sent through `com.webos.notification/createToast` in the moment
`turnOnScreen` brings the screen back is accepted (`returnValue: true`) but not
seen. The same toast sent with the screen already on is. Screen-time limits
wait 5 seconds after the screen comes on before sending one.

`turnOffScreen` while LG's screen saver is showing does not hold: tvpower goes
from Screen Saver to Screen Off and back to Active 0.2 s later, with the screen
on. From Active it holds. Screen-time limits dismiss the screen saver with
Back first, as the screen saver tab does.

## Switching off (C5, webOS 10.3.1)

`power/powerOff` with reason `remoteKey` switched the TV off, going Active,
Active Standby 3.3 s after the request, then Power Off 5.7 s later, but its
answer was taken as a failure: a second `powerOff` with reason `localKey` got
"com.webos.service.tvpower/power is busy". From Power Off, switching on with
the remote booted the TV from scratch (uptime 42 s), so the server started
again.

## The Magic Remote's battery (C4, webOS 10.3.1)

`/mnt/lg/cmn_data/mrcu/mrcu1.info` is written when the remote pairs and not
after: on a C4 its time and `Paired Time` were the same, a day old. Its
`Battery = 52(M) 35(L)` is not the charge. `/usr/sbin/lginput2`, which writes
it, logs the same pair as `Battery threshold : Mid %d, Low %d`, and an MR24 on
a C4, the remote on a C5 and the remotes in the test fixtures all read 52.
`mrcu1.scd` has `BA 35`, the Low threshold.

Swapping the batteries left `mrcu1.info` unchanged. The remote's reconnect
went out from `com.webos.service.mrcu` as `getConnectionStatus` replies, with
no battery in them, and the binary `.dcd` file beside it was rewritten. Nothing
else showed a level: `/sys/class/power_supply` is empty, the system log has
only button presses, and `getDiagnosisItem` stays empty. `getDeviceInfo`
answers "Invalid Parameter" to `{}`, `deviceId` 0 and 1, and `deviceType`
`mrcu`, `MRCU` and 0.

The remote has the standard Battery Service, and `com.webos.service.bluetooth2`
reads it. The remote is in `device/getStatus` (name `LGE MR24`, type `ble`), but
`gatt/getServices` answers "Device is not connected to profile" until
`gatt/connect` is called with its address, which returns a `clientId`. After
`gatt/discoverServices`, the remote lists `180f` among its services, and
`gatt/readCharacteristicValue` with that `clientId`, service
`0000180f-0000-1000-8000-00805f9b34fb` and characteristic
`00002a19-0000-1000-8000-00805f9b34fb` returned `"bytes": [61]` with old
batteries in it. The call takes no `address`. The characteristic also has
notify. `gatt/disconnect` with the `clientId` ended it, and the remote worked
after each of the two connections. How often this can be done
without disturbing lginput2's own connection, and whether webOS 9 and earlier
have these calls, is not yet known.

On a B8 (4.4.3) and a C2 (9.2.2), `getConnectionStatus` asked once answers
`isBleRemocon: false` even with the Magic Remote connected. Subscribed, the
update sent as the remote wakes has `connected: true, isBleRemocon: true`, and
the one as it sleeps keeps `isBleRemocon: true`.

On the B8, `getDeviceInfo` with `deviceName` `MagicRemote_1` answers
`batteryLevel` 49, and 63 once other batteries were put in: the charge, not a
threshold. Its `mrcu1.info` (in `/mnt/lg/cmn_data/btsvc`) has no battery line.
Its `gatt/connect` answers `appId` and no `clientId`. The C2 answers
`batteryLevel` `"-"`.

On the B8, lginput2 once started a diagnostic capture, a
`/tmp/var/log/<date>_MRCU.log` with columns for motion, RSSI, voltage,
temperature and gyro, beside a `ManualDevice-<remote MAC>-rawInput.dsf`. A new
`mrcu_LS2` thread started with it and used a whole core until the TV was
rebooted, through a night in standby. lginput2's luna methods include
`enableLoggingMotion`, `getSensorData` and `enablePrintRfStatus`, none of which
Glasshouse calls; `getConnectionStatus` and `getDeviceInfo` left it at 0%.

## Boot and app state (webOS 9.2.2, C2)

- The kernel command line has `snapshot resume=/dev/mmcblk0p51 criu_enabled`.
  Apps such as the home app and `com.webos.app.inputcommon` are checkpointed
  with CRIU and restored from it when killed; at boot the home app's copy in
  flash was rejected and it started fresh.
- `/usr/sbin/snapshot-boot-manager --remove` discards the memory image; the next
  boot is a slower "making" boot (`/sys/power/mode` reads `making`) that remakes
  it, and clears the CRIU copies in flash.
- `com.webos.service.capture/executeOneShot` with `{ path, method: "DISPLAY",
  width: 1920, height: 1080, format: "JPEG" }` saves what is on screen,
  including the home app.
- `luna-send` run from an SSH shell can print nothing for
  `com.webos.applicationManager` calls, while the same call from a node child
  process answers.
