/*
 * Screen-time limits: a daily total, a bedtime and a daily limit per app or
 * input, each acted on as the owner chose. Counted by watch time (history.js),
 * so the limits apply only while it is on. Off until turned on
 * (config.screenTime.enabled).
 * Strict ES5 for Node 0.12.2 on webOS 4.
 *
 * Checked every 30 seconds and at each change of app, input or screen. Five
 * minutes before a limit the TV shows a toast; at the limit it shows another
 * and acts a minute later, so a TV switched on after its limit or in bedtime
 * gets the same warning before it goes off again.
 */
/** @type {typeof import('./history')} */
var history = require('./history');

var CHECK_MS = 30000;
var WARN_S = 300;
var GRACE_MS = 60000;
var DAY_MS = 86400000;
var MAX_APPS = 50;

// What the whole TV does at the daily limit or bedtime, and what an app does at its own.
var TV_ACTIONS = ['off', 'screenOff', 'warn'];
var APP_ACTIONS = ['home', 'off', 'screenOff', 'warn'];
var THEN = {
  off: 'The TV switches off in a minute.',
  screenOff: 'The screen goes off in a minute.',
  home: 'Going to Home in a minute.'
};
var DEFAULTS = {
  enabled: false, dailyMinutes: 0, bedtimeStart: '', bedtimeEnd: '',
  action: 'off', appAction: 'home', apps: {}
};

var config = null;
var liveState = null;
/** @type {function(string, any, function(any): void): void} */
var control = function (a, v, cb) { cb({ ok: false }); };
// Runs fn after ms and returns its cancel; a test runs it when it chooses.
var later = function (fn, ms) {
  var timer = setTimeout(fn, ms);
  return function () { clearTimeout(timer); };
};
var checkTimer = null;
var listening = false;
var running = false;
// The action waiting out its minute: { id, cancel }.
var pending = null;
// Toasts already shown today, by id, so each is shown once.
var warned = {};
var warnedDay = null;

function isMinutes(v, min) { return typeof v === 'number' && v % 1 === 0 && v >= min && v <= 1440; }
function isClock(v) { return v === '' || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)); }
function isApps(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  var keys = Object.keys(v);
  if (keys.length > MAX_APPS) return false;
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].length > 200 || !isMinutes(v[keys[i]], 1)) return false;
  }
  return true;
}

// Each setting's check, shared with backup.js.
var VALID = {
  enabled: function (v) { return typeof v === 'boolean'; },
  dailyMinutes: function (v) { return isMinutes(v, 0); },
  bedtimeStart: isClock,
  bedtimeEnd: isClock,
  action: function (v) { return TV_ACTIONS.indexOf(v) !== -1; },
  appAction: function (v) { return APP_ACTIONS.indexOf(v) !== -1; },
  apps: isApps
};

function settings() {
  var c = (config && config.screenTime) || {};
  var out = {};
  for (var k in DEFAULTS) out[k] = c[k] !== undefined && VALID[k](c[k]) ? c[k] : DEFAULTS[k];
  return out;
}

/**
 * The settings in patch that are known and valid, or an error naming the first that is not.
 * @param {any} patch
 * @returns {{ value: Object, error: ?string }}
 */
function validate(patch) {
  var value = {};
  if (!patch || typeof patch !== 'object') return { value: value, error: 'no settings' };
  for (var k in patch) {
    if (!VALID[k]) return { value: value, error: 'unknown setting: ' + k };
    if (!VALID[k](patch[k])) return { value: value, error: 'invalid ' + k };
    value[k] = patch[k];
  }
  return { value: value, error: null };
}

function minuteOf(clock) {
  var m = /^(\d\d):(\d\d)$/.exec(clock);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/*
 * Whether local (the TV's local time) is in bedtime, and the seconds until it
 * starts. A window that ends earlier than it starts runs past midnight.
 */
function bedtime(s, local) {
  var from = minuteOf(s.bedtimeStart), to = minuteOf(s.bedtimeEnd);
  if (from === null || to === null || from === to) return null;
  var sec = Math.floor((local % DAY_MS) / 1000);
  var minute = Math.floor(sec / 60);
  var inside = from < to ? minute >= from && minute < to : minute >= from || minute < to;
  return { inside: inside, untilStart: ((from * 60 - sec) % 86400 + 86400) % 86400 };
}

function toast(text) {
  control('toast', text, function (r) {
    if (!r || !r.ok) console.error('screentime: toast failed: ' + ((r && r.error) || 'no answer'));
  });
}

function minutesText(sec) {
  var m = Math.max(1, Math.round(sec / 60));
  return m === 1 ? '1 minute' : m + ' minutes';
}

function warnOnce(id, text) {
  if (warned[id]) return;
  warned[id] = true;
  toast(text);
}

function run(action) {
  var done = function (r) {
    if (!r || !r.ok) console.error('screentime: ' + action + ' failed: ' + ((r && r.error) || 'no answer'));
  };
  console.log('screentime: limit reached, ' + action);
  if (action === 'off') control('powerOff', null, done);
  else if (action === 'screenOff') control('screenOff', null, done);
  else if (action === 'home') control('rcu', 'home', done);
}

function cancelPending() {
  if (pending) pending.cancel();
  pending = null;
}

/*
 * What is due now: { id, action, text } for a limit reached, or null. The
 * whole TV's limits come before an app's.
 */
function evaluate(s, key, local, today) {
  var tvLeft = Infinity, tvWhy = null;
  var bed = bedtime(s, local);
  if (bed && bed.inside) {
    return { id: 'bedtime', action: s.action, text: 'It is bedtime.' };
  }
  if (s.dailyMinutes) {
    tvLeft = s.dailyMinutes * 60 - history.watched(today);
    tvWhy = 'daily';
  }
  if (bed && bed.untilStart < tvLeft) { tvLeft = bed.untilStart; tvWhy = 'bedtime'; }
  if (tvWhy === 'daily' && tvLeft <= 0) {
    return { id: 'daily', action: s.action, text: 'Today\'s screen time is used up.' };
  }
  if (tvWhy && tvLeft <= WARN_S) {
    warnOnce('soon:' + tvWhy, tvWhy === 'bedtime' ?
      'Bedtime in ' + minutesText(tvLeft) + '.' :
      minutesText(tvLeft) + ' of screen time left today.');
  }

  var limit = s.apps[key];
  if (!limit) return null;
  var appLeft = limit * 60 - (today[key] || 0);
  if (appLeft <= 0) {
    return { id: 'app:' + key, action: s.appAction, text: 'Today\'s time for this is used up.' };
  }
  if (appLeft <= WARN_S) warnOnce('soon:app:' + key, minutesText(appLeft) + ' left for this today.');
  return null;
}

function due() {
  var s = settings();
  if (!running || !s.enabled || !liveState) return null;
  var key = history.keyFor(liveState.state.snapshot());
  if (!key || key === history.SCREEN_OFF) return null;
  var local = history.localNow();
  var today = history.today();
  if (local === null || !today) return null;
  var day = new Date(local).toISOString().slice(0, 10);
  if (day !== warnedDay) { warned = {}; warnedDay = day; }
  return evaluate(s, key, local, today);
}

function check() {
  var d = due();
  if (!d) return cancelPending();
  if (d.action === 'warn') {
    cancelPending();
    return warnOnce(d.id, d.text);
  }
  if (pending && pending.id === d.id) return;
  cancelPending();
  // Said each time it comes due, as the TV may have just been switched back on.
  toast(d.text + ' ' + THEN[d.action]);
  var id = d.id;
  pending = {
    id: id,
    cancel: later(function () {
      pending = null;
      var now = due();
      if (now && now.id === id && now.action !== 'warn') run(now.action);
    }, GRACE_MS)
  };
}

function start() {
  if (running || !settings().enabled) return;
  running = true;
  if (liveState && !listening) {
    listening = true;
    // After history's own listener, so the time is counted first.
    liveState.state.onChange(function (ev) {
      if (ev.group === 'power' || (ev.group === 'application' && ev.key === 'app')) check();
    });
  }
  checkTimer = setInterval(check, CHECK_MS);
  check();
  console.log('screentime: limits on');
}

function stop() {
  if (!running) return;
  running = false;
  cancelPending();
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
}

// Applies saved settings: restarts the checks, as a limit raised may cancel what is pending.
function apply(patch) {
  if (config) {
    config.screenTime = config.screenTime || {};
    for (var k in patch) config.screenTime[k] = patch[k];
  }
  stop();
  warned = {};
  start();
}

/**
 * For the dashboard: the settings, today's time and the apps and inputs to
 * offer limits for (those watched in the last 30 days and those limited).
 * @param {number} nowMs
 */
function status(nowMs) {
  var s = settings();
  var hist = history.status();
  var today = hist.running ? history.today() : null;
  var recent = history.query(nowMs - 30 * DAY_MS, nowMs);
  var titles = recent.titles || {};
  var keys = {};
  for (var h in recent.hours) for (var k in recent.hours[h]) keys[k] = true;
  for (var a in s.apps) keys[a] = true;
  delete keys[history.SCREEN_OFF];
  var choices = Object.keys(keys).map(function (key) {
    return { key: key, title: titles[key] || null, today: today ? Math.round(today[key] || 0) : null };
  });
  return {
    settings: s,
    historyOn: hist.running,
    clockSet: history.localNow() !== null,
    allowPower: !!(config && config.allowPower),
    watchedToday: today ? Math.round(history.watched(today)) : null,
    choices: choices
  };
}

/**
 * @param {Object} opts
 * @param {any} opts.config the server's config
 * @param {any} [opts.liveState] state.init()'s result
 * @param {function(string, any, function(any): void): void} opts.control controls.doControl
 * @param {function(function(): void, number): function(): void} [opts.later] for tests
 */
function init(opts) {
  stop();
  listening = false;
  config = opts.config;
  liveState = opts.liveState || null;
  control = opts.control;
  if (opts.later) later = opts.later;
  warned = {};
  warnedDay = null;
}

module.exports = {
  TV_ACTIONS: TV_ACTIONS,
  APP_ACTIONS: APP_ACTIONS,
  VALID: VALID,
  init: init,
  start: start,
  stop: stop,
  apply: apply,
  check: check,
  validate: validate,
  settings: settings,
  status: status,
  bedtime: bedtime
};
