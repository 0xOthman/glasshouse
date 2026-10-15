/**
 * test/test-screentime.js - Screen-time limits
 */

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var history = require('../server/lib/history');
var screentime = require('../server/lib/screentime');
var StateManager = require('../server/lib/state').StateManager;

console.log('Running test-screentime.js ...');

var root = path.join(os.tmpdir(), 'gh-screentime-' + process.pid);
// 20:50 on the TV, in CEST, is 18:50 UTC.
var T = Date.UTC(2026, 9, 14, 18, 50);

function rmrf(p) {
  try {
    fs.readdirSync(p).forEach(function (f) { fs.unlinkSync(path.join(p, f)); });
    fs.rmdirSync(p);
  } catch (e) {}
}

function setup(limits, historyOn) {
  rmrf(root);
  var clock = { wall: T, mono: 1000 };
  var state = new StateManager();
  var liveState = { state: state, startGroup: function () {}, stopGroup: function () {} };
  var settings = { enabled: true };
  for (var k in limits) settings[k] = limits[k];
  var config = { history: { enabled: historyOn !== false }, screenTime: settings, allowPower: true };
  var calls = [], toasts = [], waiting = [];
  history.init({
    config: config, dir: root, liveState: liveState,
    luna: function (uri, p, cb) {
      cb({ returnValue: true, utc: T / 1000, localtime: { year: 2026, month: 10, day: 14, hour: 20, minute: 50, second: 0 } });
    },
    now: function () { return clock.wall; },
    mono: function () { return clock.mono; }
  });
  history.start();
  screentime.init({
    config: config, liveState: liveState,
    control: function (action, value, cb) {
      if (action === 'toast') toasts.push(value); else calls.push(value ? action + ':' + value : action);
      cb({ ok: true });
    },
    later: function (fn) {
      var entry = { fn: fn, cancelled: false };
      waiting.push(entry);
      return function () { entry.cancelled = true; };
    }
  });
  screentime.start();
  return {
    state: state, calls: calls, toasts: toasts,
    advance: function (ms) { clock.wall += ms; clock.mono += ms; screentime.check(); },
    // The minute's grace running out.
    elapse: function () {
      var due = waiting.splice(0);
      due.forEach(function (e) { if (!e.cancelled) e.fn(); });
    },
    on: function (app) {
      state.update('power', 'systemOn', true);
      state.update('power', 'screenOn', true);
      state.update('application', 'app_id', app);
      state.update('application', 'app', app);
    },
    done: function () { screentime.stop(); history.stop(); }
  };
}

(function testDailyLimit() {
  var tv = setup({ dailyMinutes: 60, action: 'off' });
  tv.on('netflix');
  tv.advance(54 * 60000);
  assert.deepEqual(tv.toasts, []);
  tv.advance(2 * 60000);
  assert.deepEqual(tv.toasts, ['4 minutes of screen time left today.']);
  tv.advance(60000);
  assert.strictEqual(tv.toasts.length, 1, 'warned once');
  tv.advance(3 * 60000);
  assert.strictEqual(tv.toasts[1], 'Today\'s screen time is used up. The TV switches off in a minute.');
  tv.advance(30000);
  assert.strictEqual(tv.toasts.length, 2, 'said once while it waits');
  assert.deepEqual(tv.calls, []);
  tv.elapse();
  assert.deepEqual(tv.calls, ['powerOff']);
  tv.done();
  console.log('  ✓ the daily limit warns five minutes before, then switches the TV off a minute after it is reached');
})();

(function testScreenOffCancels() {
  var tv = setup({ dailyMinutes: 30, action: 'off' });
  tv.on('netflix');
  tv.advance(31 * 60000);
  tv.state.update('power', 'screenOn', false);
  tv.elapse();
  assert.deepEqual(tv.calls, [], 'the screen went off within the minute');
  tv.done();
  console.log('  ✓ a pending action is dropped once the screen is off');
})();

(function testAppLimit() {
  var tv = setup({ apps: { netflix: 30 }, appAction: 'home' });
  tv.on('netflix');
  tv.advance(29 * 60000);
  assert.deepEqual(tv.toasts, ['1 minute left for this today.']);
  tv.on('youtube');
  tv.advance(60 * 60000);
  assert.strictEqual(tv.toasts.length, 1, 'another app has no limit');
  tv.on('netflix');
  tv.advance(2 * 60000);
  assert.strictEqual(tv.toasts[1], 'Today\'s time for this is used up. Going to Home in a minute.');
  tv.elapse();
  assert.deepEqual(tv.calls, ['rcu:home']);
  tv.done();
  console.log('  ✓ an app\'s limit counts only that app, and goes to Home');
})();

(function testBedtime() {
  var tv = setup({ bedtimeStart: '21:00', bedtimeEnd: '07:00', action: 'screenOff' });
  tv.on('netflix');
  tv.advance(6 * 60000);
  assert.deepEqual(tv.toasts, ['Bedtime in 4 minutes.']);
  tv.advance(5 * 60000);
  assert.strictEqual(tv.toasts[1], 'It is bedtime. The screen goes off in a minute.');
  tv.elapse();
  assert.deepEqual(tv.calls, ['screenOff']);
  tv.done();

  var b = screentime.bedtime({ bedtimeStart: '22:30', bedtimeEnd: '06:00' }, Date.UTC(2026, 9, 15, 2, 0));
  assert.deepEqual(b, { inside: true, untilStart: 20.5 * 3600 }, 'past midnight is inside');
  b = screentime.bedtime({ bedtimeStart: '22:30', bedtimeEnd: '06:00' }, Date.UTC(2026, 9, 15, 6, 0));
  assert.strictEqual(b.inside, false, 'the end is outside');
  assert.strictEqual(screentime.bedtime({ bedtimeStart: '', bedtimeEnd: '06:00' }, T), null);
  console.log('  ✓ bedtime warns, acts, and runs past midnight');
})();

(function testWarnOnly() {
  var tv = setup({ dailyMinutes: 30, action: 'warn' });
  tv.on('netflix');
  tv.advance(29 * 60000);
  tv.advance(2 * 60000);
  tv.advance(10 * 60000);
  tv.elapse();
  assert.deepEqual(tv.toasts, ['1 minute of screen time left today.', 'Today\'s screen time is used up.']);
  assert.deepEqual(tv.calls, []);
  tv.done();
  console.log('  ✓ Only warn says so once and does nothing else');
})();

(function testNeedsWatchTime() {
  var tv = setup({ dailyMinutes: 30 }, false);
  tv.on('netflix');
  tv.advance(60 * 60000);
  tv.elapse();
  assert.deepEqual(tv.toasts, []);
  assert.deepEqual(tv.calls, []);
  assert.strictEqual(screentime.status(T).historyOn, false);
  tv.done();
  console.log('  ✓ nothing is limited while watch time is off');
})();

(function testValidate() {
  assert.strictEqual(screentime.validate({ dailyMinutes: 90, action: 'screenOff', bedtimeStart: '' }).error, null);
  assert.ok(screentime.validate({ dailyMinutes: 2000 }).error);
  assert.ok(screentime.validate({ bedtimeStart: '25:00' }).error);
  assert.ok(screentime.validate({ action: 'home' }).error, 'Home is for an app only');
  assert.ok(screentime.validate({ apps: { netflix: 0 } }).error);
  assert.ok(screentime.validate({ apps: [] }).error);
  assert.ok(screentime.validate({ allowPower: true }).error, 'nothing outside screenTime');
  console.log('  ✓ settings are checked before they are saved');
})();

rmrf(root);
console.log('test-screentime.js passed');
