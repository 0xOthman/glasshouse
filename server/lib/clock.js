/*
 * lib/clock.js - whether the clocks Glasshouse draws use 12-hour time
 *
 * They follow the TV's own setting, as LG's menus do: systemservice's
 * timeFormat preference, HH12 or HH24 (HH12 on a webOS 7 TV set to 12-hour,
 * #934). A TV that gives none keeps 24-hour time.
 *
 * Read at start and again at most once a minute while something asks, so the
 * answer to hour12() is always at hand and never waits on the TV.
 *
 * Strict ES5: runs on node 0.12.
 */
var STALE_MS = 60000;

var lunaFn = null;
/** @type {function(boolean): void} */
var onChangeFn = function () {};
var is12 = false;
var readAt = 0;
var reading = false;

function init(opts) {
  opts = opts || {};
  lunaFn = opts.luna || null;
  onChangeFn = opts.onChange || function () {};
  is12 = false;
  readAt = 0;
  reading = false;
}

// Reads the TV's setting; cb(hour12) once it has answered, or at once without luna.
function refresh(cb) {
  cb = cb || function () {};
  if (!lunaFn || reading) return cb(is12);
  reading = true;
  lunaFn('com.webos.service.systemservice/getPreferences', { keys: ['timeFormat'] }, function (r) {
    reading = false;
    readAt = Date.now();
    var format = r && typeof r.timeFormat === 'string' ? r.timeFormat : null;
    if (format) {
      var next = format === 'HH12';
      if (next !== is12) {
        is12 = next;
        onChangeFn(is12);
      }
    }
    cb(is12);
  });
}

// The last answer; one older than a minute is read again for next time.
function hour12() {
  if (Date.now() - readAt > STALE_MS) refresh();
  return is12;
}

module.exports = {
  init: init,
  refresh: refresh,
  hour12: hour12
};
