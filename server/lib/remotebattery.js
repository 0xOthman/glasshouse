/*
 * The Magic Remote's battery, from its Bluetooth Battery Service. LG's own
 * pairing file has only the remote model's battery thresholds (see
 * readRemoteInfo in telemetry.js), so the level is read from the remote itself.
 * Strict ES5 for Node 0.12.2 on webOS 4.
 *
 * lginput2 holds the remote's own connection; the Bluetooth service reads the
 * level only over a GATT connection of its own, so each read connects, reads
 * and disconnects. Only a remote lginput2 has connected is read: one asleep is
 * not woken for it. It sleeps soon after it is put down, so the read waits for
 * it to wake: the first time after the TV switches on, then at most hourly.
 * See docs/development/TV-RESEARCH.md.
 */

var lunaTransport = require('./luna');

var BT = 'com.webos.service.bluetooth2';
var BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
var BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';
var HOUR_MS = 3600000;
// A failed read is tried again at the next wake after this.
var RETRY_MS = 300000;
// For a remote kept awake, which announces no new connection.
var CHECK_MS = 600000;
// After the remote connects, before a second connection to it.
var SETTLE_MS = 3000;
// discoverServices answers before the services can be read.
var DISCOVER_MS = 2000;
var discoverMs = DISCOVER_MS;
var settleMs = SETTLE_MS;

/** @type {function(string, Object, function(any): void): void} */
var luna = null;
var onLevel = null;
var timer = null;
var subscription = null;
var isOnFn = function () { return true; };
var busy = false;
// When the next read is wanted; 0 is at the next chance.
var dueAt = 0;
// { level: 0-100, at: Unix ms } once read.
var last = null;

function remoteAddress(devices) {
  for (var i = 0; i < (devices || []).length; i++) {
    var d = devices[i];
    if (d && d.paired && d.typeOfDevice === 'ble' && /^LGE MR/i.test(d.name || '')) return d.address;
  }
  return null;
}

function levelFrom(r) {
  var bytes = r && r.returnValue && r.value && r.value.value && r.value.value.bytes;
  var n = bytes && bytes.length ? bytes[0] : null;
  return typeof n === 'number' && n >= 0 && n <= 100 ? n : null;
}

/**
 * Reads the level once, unless a read is under way or the remote is not
 * connected. done gets the level, or null when there is none this time.
 * @param {function(?number): void} [done]
 */
function read(done) {
  done = done || function () {};
  if (!luna || busy) return done(null);
  busy = true;
  var clientId = null;
  // Whether the remote was connected to; until then nothing is put off.
  var tried = false;

  function finish(level) {
    function end() {
      busy = false;
      if (tried) dueAt = Date.now() + (level !== null ? HOUR_MS : RETRY_MS);
      if (level !== null) {
        var changed = !last || last.level !== level;
        last = { level: level, at: Date.now() };
        if (changed && onLevel) onLevel(level);
      }
      done(level);
    }
    // Always given back, whatever failed after connecting.
    if (clientId) luna(BT + '/gatt/disconnect', { clientId: clientId }, function () { end(); });
    else end();
  }

  luna('com.webos.service.mrcu/getConnectionStatus', {}, function (st) {
    if (!st || !st.connected || !st.isBleRemocon) return finish(null);
    luna(BT + '/device/getStatus', {}, function (ds) {
      var address = remoteAddress(ds && ds.devices);
      if (!address) return finish(null);
      tried = true;
      luna(BT + '/gatt/connect', { address: address }, function (c) {
        clientId = c && c.returnValue && c.clientId ? String(c.clientId) : null;
        if (!clientId) return finish(null);
        luna(BT + '/gatt/discoverServices', { address: address }, function () {
          setTimeout(function () {
            luna(BT + '/gatt/readCharacteristicValue', {
              clientId: clientId, service: BATTERY_SERVICE, characteristic: BATTERY_LEVEL
            }, function (r) { finish(levelFrom(r)); });
          }, discoverMs);
        });
      });
    });
  });
}

function due() {
  return Date.now() >= dueAt && isOnFn();
}

// lginput2's connection status: a remote waking is the chance to read.
function connectionChanged(st) {
  if (st && st.connected && st.isBleRemocon && due()) setTimeout(function () { if (due()) read(); }, settleMs);
}

// The TV has switched on: read at the remote's next wake.
function poweredOn() {
  dueAt = 0;
}

/**
 * Starts watching for the remote to wake.
 * @param {function(): boolean} isOn whether the TV is on; nothing is read in
 *   standby
 */
function start(isOn) {
  stop();
  isOnFn = isOn;
  dueAt = 0;
  subscription = new lunaTransport.Subscription('com.webos.service.mrcu/getConnectionStatus',
    { subscribe: true }, null, { message: connectionChanged });
  subscription.start();
  timer = setInterval(function () { if (due()) read(); }, CHECK_MS);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  if (subscription) { subscription.stop(); subscription = null; }
}

// The last level read, or null before one has been.
function level() {
  return last ? last.level : null;
}

/**
 * @param {Object} opts
 * @param {function(string, Object, function(any): void): void} opts.luna
 * @param {function(number): void} [opts.onLevel] called when the level changes
 * @param {number} [opts.discoverMs] the wait after discoverServices, for tests
 * @param {number} [opts.settleMs] the wait after the remote connects, for tests
 */
function init(opts) {
  luna = opts.luna;
  discoverMs = opts.discoverMs !== undefined ? opts.discoverMs : DISCOVER_MS;
  settleMs = opts.settleMs !== undefined ? opts.settleMs : SETTLE_MS;
  onLevel = opts.onLevel || null;
  last = null;
  busy = false;
  dueAt = 0;
  isOnFn = function () { return true; };
}

module.exports = {
  init: init,
  start: start,
  stop: stop,
  read: read,
  poweredOn: poweredOn,
  connectionChanged: connectionChanged,
  level: level,
  remoteAddress: remoteAddress,
  levelFrom: levelFrom
};
