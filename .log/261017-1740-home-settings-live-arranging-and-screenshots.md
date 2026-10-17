# 261017-1740 - Home settings: live arranging on the TV, two fixes, new screenshots

Follow-up to 261017-1727, after the operator allowed further testing on the
Office TV and asked for the PR images to be updated.

## Live arranging (Office OLED55G36LA, webOS 9.2.2)

Keys were sent to the Glasshouse Home view as CDP `Input.dispatchKeyEvent`
over the devtools tunnel (local 19998 to the TV's 9998), with the view in
front. Checked, in order: long OK enters arranging; the bar reads "Remove
channel" on a channel and "Hide or show" on an input; a channel picked up,
moved right and dropped; Back while held removes it; the bar's Remove
channel removes another; Done saves exactly the remaining channels; a
move-only arrangement (ITV1 to the front) saves the new order; an empty
Channels row shows "Add channels in Glasshouse's Home settings" and "This
row is empty" while arranging, and Done leaves it empty; a layout posted by
an old page with `hidden.ch` removes that channel and stores `hidden.ch`
empty. The original four channels were restored after each case and read
back equal.

## Found and fixed

- The bar label was set before `state.last` was updated, so it lagged one
  focus move (it read "Remove channel" on HDMI 1 after leaving the Channels
  row). The label is now set after. Confirmed on the TV after the fix.
- The "Rows and tiles" description touched the first row's rule on the web
  tab; `#home-rows` has a 14 px top margin.

## Failed runs

- The first injected run reported "Done" not saving. Cause: the script
  pressed the bar button and then right, right, OK, but pressing a bar button
  returns focus to the tiles, so those keys moved and picked up tiles. Not a
  product fault; the corrected sequence (down to the bar, then right twice)
  saved. The unsaved arranging state was discarded by the next page load.
- The fixed home.html did not reach the view after being copied to the TV:
  the server keeps assets in memory (`ASSET_CACHE` in routes.js), so a
  restart is needed after copying files. `Page.reload` additionally reused
  the cached URL. After `tvwebctl restart` and navigating with a fresh
  `?t=`, the view showed the new code.

## Screenshots

Retaken on the TV at 1920x1080 via CDP `Page.captureScreenshot` and scaled
to 1600x900 (home.jpg after opening Channel 4 and returning, so "Last
watched" shows; home-arrange.jpg with ITV1 focused; home-tv-app.jpg on the
TV app's Channels section), and home-dashboard.png from the live web tab at
1440x1100 with Apps and Inputs collapsed and "BBC" in the channel search.
home-evening.jpg and home-idle.jpg are unchanged; nothing in them changed.

The operator is resizing the wallpapers in server/assets/home/wallpapers at
the same time; those files are left out of this commit.

## End state

TV on Glasshouse Home, original four channels in order, the deployed
home.js, home.html, dashboard.html, ui.html, ui/home.js and ui/ui.css match
this commit by MD5. Older wallpaper .jpg files from an earlier iteration
remain in /var/lib/tvweb/assets/home/wallpapers on the TV; nothing refers
to them.

`node test/run-all.js` 81/81 (Node 22), check-es5, check-strings,
check-ui-ids and check-dashboards rerun after the fixes.
