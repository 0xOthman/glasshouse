# 261017-1727 - Home settings: channels added and removed, not hidden

The operator asked for a coherence pass over the Home section of the TV app
and the Home tab of the browser dashboard, singling out channels: a channel
should be added, and later removed from the list, with no separate hide.
The frontend-design skill was applied. The existing dashboards' visual
language was kept, since this is a section of an established design system,
not a new page.

## What was incoherent

- A channel had two states that both kept it off Home: not picked, and
  picked but hidden. The web tab listed picked channels with Shown/Hidden
  under "Rows and tiles", and again in a separate Channels section as
  "On Home"/"Add" toggles. The TV app did the same: a Shown/Hidden row per
  channel, and a separate "Pick channels" list.
- Channel order was stored twice: the `channels` list and `order.ch`.
- The arranging bar on the TV offered "Hide or show" on a channel.
- The empty Channels row told owners to pick channels in "the Home tab of the
  Glasshouse dashboard", although the TV app's section does it too.
- The web tab collapsed every row except the first after each change, and a
  change cleared the channel search.
- Reset said nothing about what it leaves alone.

## Decisions

- One model: apps and inputs come from the TV, so they are shown or hidden.
  Channels are chosen, so they are added and removed. Hidden is gone for
  channels everywhere.
- `channels` is the only order. `setLayout` applies a sent `order.ch` to the
  list (so the view's arranging and the web arrows still work), and stores
  `order.ch` and `hidden.ch` empty.
- A `home.json` from before is migrated on read: the moved order becomes the
  list's, and a hidden channel is removed, which keeps what Home showed.
  Alternative considered: unhiding them. Rejected, as it would put channels
  back on Home that the owner had hidden.
- Web tab: the Channels row lists added channels with arrows and Remove, and
  "Add channels" sits inside that row, with a search and only the channels
  not yet added. The separate Channels section is removed. Arrows are
  compact (36 px) instead of 116 px pills. Open rows and the search text
  survive redraws.
- TV app: sections follow the rows' order (Row order, then Apps, Inputs,
  Channels). The Channels section lists added channels (OK removes) and ends
  with "Add channels", a list of the rest; adding one drops it from that
  list. Placing Add after the channels keeps focus on a row when the last
  channel is removed (the shared refocus falls back to the top on a head).
- On the TV's arranging bar, "Hide or show" reads "Remove channel" on a
  channel; Back while held removes it. The removal is sent as `channels` when
  arranging ends.
- "Remove" rather than "Take off", in the operator's own word; the row note
  says "4 added" rather than "4 picked".

## Verification

- New test in test/test-home.js: migration of a moved and hidden channel,
  a moved Channels row reordering the list, and a move plus an addition in
  one save. It fails against the previous normalise (hidden.ch kept).
- Local, against the real server with /api/home faked statefully in
  Playwright (Chrome): web add with search kept and row kept open, arrow
  move, Remove; TV app Add channels list and removal; the real home.html
  arranging: bar label on a channel and on an app, remove from the bar, Done
  posting `channels` without the removed one. No page errors.
- Office OLED55G36LA, webOS 9.2.2, Node 16.19.1: backed up the six files and
  home.json to /tmp/home-coherence-bak/before.tar on the TV, deployed
  lib/home.js, assets/home.html, dashboard.html, ui.html, ui/home.js and
  ui/ui.css (MD5 match), restarted. home.json migrated with the same four
  channels, `order.ch` and `hidden.ch` empty. Over the LAN with the token:
  the web tab offered 178 channels, added one, moved it up, removed it, back
  to the original four; the TV app page added one from its list and removed
  it, back to the original four. The on-TV view loaded the new code (banner
  text, 4 channel tiles). The final home.html ("4 added") was copied over
  afterwards; all six files on the TV match the commit by MD5.
- `node test/run-all.js` 81/81 on Node 22; tsc; check-es5, module-calls,
  ui-ids, strings, screensavers, drift, entity-stability, entities (B8);
  check-upgrade; check-dashboards (24 tabs, 0 problems); git diff --check.

## Failed or partial

- Reloading the on-TV view through the devtools tunnel while it was going to
  the background left the hidden page in `readyState=loading` (webOS
  suspends hidden pages). Last good action: the deploy and live dashboard
  runs. First bad evidence: `document.body` null on the Home target. Live TV
  was then in front: Channel 4 had been opened from Glasshouse Home at 17:17
  BST, not by these scripts as far as could be established (no key had been
  sent by then), so someone was likely using the TV. No keys were injected
  after that. The stuck background instance was closed with
  `closeByAppId`; Glasshouse Home was next in front, freshly loaded and
  complete. Injected arranging on the TV was therefore not run; it is
  covered by the local run of the same page.
- Node 16 is not installed on this Mac, so the suite was not run on Node 16
  locally; the TV's Node 16.19.1 ran the changed server module.
- The docs screenshots (home-tv-app.jpg, home-dashboard.png)
  still show the earlier sections.

Final TV state: Glasshouse Home on and in front, the original four channels
in their original order, other layout unchanged; the six deployed files
match this change.
