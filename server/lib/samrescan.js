/*
 * lib/samrescan.js - make sam read its apps again without restarting it (#366)
 *
 * Hiding a Home tile and replacing the screen saver both bind-mount an
 * appinfo.json, which sam reads only when it scans. Restarting sam was the
 * only way found to make it scan, and that restart is the one thing every
 * black-picture report in #366 has in common.
 *
 * sam also scans when configd's profile.blockedAppList changes: LG uses it to
 * block apps by region, and sam watches it. Adding an id no app has and then
 * putting the list back exactly as it was blocks nothing, and sam rereads every
 * appinfo.json, overlays included, within seconds and without restarting: on a
 * C2 on webOS 9.2 a visible:false overlay took effect and sam kept its pid.
 * configd saves any setConfigs as a user-defined value that outlives reboots,
 * and has no call to drop one, so the list stays at LG's value as of the
 * nudge: should LG's own list change later, with a firmware update or a new
 * country, the saved copy still wins.
 *
 * webOS 4 has no such setting (a B8 reports it missing), and there callers
 * restart sam as before. They also do if sam has not caught up in time.
 *
 * sam ignores that list on webOS 10 (a C2 on 10.3.1 kept a blocked app on
 * Home), so there rereadApp() asks sam for one app instead:
 * applicationManager/blockSystemApp followed by releaseBlockSystemApp makes
 * sam drop and reread that app's appinfo.json, overlay included. The block is
 * written to /var/preferences/com.webos.applicationManager/
 * blockedSystemAppList/<country>.json and the release takes it out again; on
 * a C5 on 10.3.1 the file was byte-identical afterwards, a Flutter manifest
 * replaced by a QML one was reported within the second and sam kept its pid.
 * The two calls stay together, and the release is tried again if it fails,
 * since an app left blocked cannot launch. A running instance is not stopped:
 * the caller relaunches it.
 *
 * Strict ES5: runs on node 0.12.
 */
var KEY = 'profile.blockedAppList';
// Not an app: blocking it blocks nothing.
var NUDGE_ID = 'io.github.rorygallagher2024.lg-webos-dashboard.rescan';
var NUDGE_MS = 1500;
var CHECK_POLL_MS = 500;
var CHECK_POLLS = 16;

var lunaFn = null;
var supported = null;
var running = false;
var waiting = [];

function init(opts) {
  opts = opts || {};
  lunaFn = opts.luna || null;
  supported = null;
  if (opts.nudgeMs !== undefined) NUDGE_MS = opts.nudgeMs;
  if (opts.pollMs !== undefined) CHECK_POLL_MS = opts.pollMs;
}

function readList(cb) {
  lunaFn('com.webos.service.config/getConfigs', { configNames: [KEY] }, function (r) {
    var list = r && r.configs && r.configs[KEY];
    cb(Array.isArray(list) ? list : null);
  });
}

function writeList(list, cb) {
  var configs = {};
  configs[KEY] = list;
  lunaFn('com.webos.service.config/setConfigs', { configs: configs }, function (r) {
    cb(!!(r && r.returnValue));
  });
}

/*
 * One nudge at a time: a second one reading the list mid-nudge would take the
 * nudge id for LG's own and put it back.
 */
function nudge(cb) {
  waiting.push(cb);
  if (running) return;
  running = true;
  (function run() {
    var batch = waiting.splice(0, waiting.length);
    nudgeOnce(function (ok) {
      batch.forEach(function (f) { f(ok); });
      if (waiting.length) return run();
      running = false;
    });
  })();
}

function nudgeOnce(cb) {
  if (!lunaFn || supported === false) return cb(false);
  readList(function (list) {
    if (!list) {
      supported = false;
      console.log('samrescan: no ' + KEY + ' on this TV - sam is restarted instead');
      return cb(false);
    }
    supported = true;
    // A run cut short could have left the id in; LG's list is the rest.
    var lg = list.filter(function (id) { return id !== NUDGE_ID; });
    writeList(lg.concat([NUDGE_ID]), function (ok) {
      if (!ok) return cb(false);
      setTimeout(function () { restore(lg, 3, cb); }, NUDGE_MS);
    });
  });
}

function restore(lg, tries, cb) {
  writeList(lg, function (ok) {
    if (ok) return cb(true);
    if (tries <= 1) {
      console.error('samrescan: could not put ' + KEY + ' back; it clears at the next reboot');
      return cb(false);
    }
    setTimeout(function () { restore(lg, tries - 1, cb); }, 1000);
  });
}

/*
 * Nudges sam, then waits until check(done) says the change has taken, for up
 * to CHECK_POLLS polls. cb(true) once it has; cb(false) where the TV cannot be
 * nudged or sam did not catch up, so the caller restarts sam instead.
 */
function refresh(check, cb) {
  nudge(function (ok) {
    if (!ok) return cb(false);
    waitFor(check, 'the nudge', cb);
  });
}

// cb(true) once check(done) says the change has taken, cb(false) after
// CHECK_POLLS polls without it. No check: cb(true) at once.
function waitFor(check, what, cb) {
  if (!check) return cb(true);
  var polls = 0;
  (function poll() {
    polls++;
    check(function (done) {
      if (done) return cb(true);
      if (polls >= CHECK_POLLS) {
        console.log('samrescan: sam had not caught up after ' + what);
        return cb(false);
      }
      setTimeout(poll, CHECK_POLL_MS);
    });
  })();
}

function samCall(method, appId, cb) {
  lunaFn('com.webos.applicationManager/' + method, { id: appId }, function (r) {
    cb(!!(r && r.returnValue));
  });
}

function release(appId, tries, cb) {
  samCall('releaseBlockSystemApp', appId, function (ok) {
    if (ok) return cb(true);
    if (tries <= 1) {
      console.error('samrescan: could not release ' + appId + '; it stays blocked in '
                    + '/var/preferences/com.webos.applicationManager/blockedSystemAppList until released');
      return cb(false);
    }
    setTimeout(function () { release(appId, tries - 1, cb); }, 1000);
  });
}

/*
 * Makes sam reread one system app's appinfo.json with a block and a release,
 * then waits as refresh() does. cb(false) where sam has no such call (the
 * block is refused and nothing is released), where the release failed, or
 * where sam did not report the change in time, so the caller tries the nudge
 * or restarts sam.
 */
function rereadApp(appId, check, cb) {
  if (!lunaFn) return cb(false);
  samCall('blockSystemApp', appId, function (blocked) {
    if (!blocked) {
      console.log('samrescan: sam did not take blockSystemApp for ' + appId);
      return cb(false);
    }
    release(appId, 3, function (released) {
      if (!released) return cb(false);
      waitFor(check, 'the block and release', cb);
    });
  });
}

module.exports = {
  init: init,
  refresh: refresh,
  rereadApp: rereadApp,
  KEY: KEY,
  NUDGE_ID: NUDGE_ID
};
