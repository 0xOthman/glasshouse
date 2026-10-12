# TV research

Findings about how LG's webOS works, kept so the same ground is not covered
twice. Each entry names the TV and webOS version it was found on. For how
Glasshouse itself works, see [IMPLEMENTATION.md](../IMPLEMENTATION.md).

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
QML has code for webOS 23 (`webOS23Test`, the `webOS23` app list style), so a
webOS 8 TV may read the same layout file; that has not been tried.

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
