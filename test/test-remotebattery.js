/**
 * test/test-remotebattery.js - The Magic Remote's battery over Bluetooth
 */

var assert = require('assert');
var path = require('path');
var util = require('../server/lib/util');
var rb = require('../server/lib/remotebattery');

console.log('Running test-remotebattery.js ...');

var tmpFile = path.join(__dirname, 'tmp-battery.json');
var REMOTE = { paired: true, typeOfDevice: 'ble', name: 'LGE MR24', address: '00:00:5e:00:53:02' };

// A TV answering as a C4 (webOS 10.3.1) did, with what is asked recorded.
function fakeLuna(opts) {
  opts = opts || {};
  var calls = [];
  var fn = function (uri, payload, cb) {
    var m = uri.replace(/^com\.webos\.service\./, '');
    calls.push(m);
    if (m === 'mrcu/getConnectionStatus') return cb(opts.status || { returnValue: true, connected: true, isBleRemocon: true });
    if (m === 'bluetooth2/device/getStatus') return cb({ returnValue: true, devices: opts.devices || [REMOTE] });
    if (m === 'bluetooth2/gatt/connect') return cb(opts.connect === undefined ? { returnValue: true, clientId: '004' } : opts.connect);
    if (m === 'bluetooth2/gatt/discoverServices') return cb({ returnValue: true });
    if (m === 'bluetooth2/gatt/readCharacteristicValue') {
      assert.deepEqual(payload, { clientId: '004', service: '0000180f-0000-1000-8000-00805f9b34fb',
        characteristic: '00002a19-0000-1000-8000-00805f9b34fb' }, 'by clientId, with no address');
      return cb(opts.read || { returnValue: true, value: { value: { bytes: [61] } } });
    }
    if (m === 'bluetooth2/gatt/disconnect') { assert.strictEqual(payload.clientId, '004'); return cb({ returnValue: true }); }
    throw new Error('unexpected ' + uri);
  };
  fn.calls = calls;
  return fn;
}

var pending = 0;
function check(name, opts, expectLevel, expectCalls) {
  pending++;
  var luna = fakeLuna(opts);
  var heard = [];
  rb.init({ luna: luna, discoverMs: 0, onLevel: function (l) { heard.push(l); } });
  rb.read(function (level) {
    assert.strictEqual(level, expectLevel, name + ': level');
    assert.deepEqual(luna.calls, expectCalls, name + ': calls');
    assert.deepEqual(heard, expectLevel === null ? [] : [expectLevel], name + ': onLevel');
    console.log('  ✓ ' + name);
    pending--;
  });
}

var ALL = ['mrcu/getConnectionStatus', 'bluetooth2/device/getStatus', 'bluetooth2/gatt/connect',
  'bluetooth2/gatt/discoverServices', 'bluetooth2/gatt/readCharacteristicValue', 'bluetooth2/gatt/disconnect'];

// Each read waits on a timer, so they run one after another.
var steps = [
  function () { check('the level is read, and the connection given back', {}, 61, ALL); },
  function () { check('a remote that is asleep is not woken', { status: { returnValue: true, connected: false } }, null, ['mrcu/getConnectionStatus']); },
  function () { check('no paired remote, no connection', { devices: [{ paired: true, typeOfDevice: 'classic', name: 'Soundbar' }] }, null,
    ['mrcu/getConnectionStatus', 'bluetooth2/device/getStatus']); },
  function () { check('a refused connection has nothing to give back', { connect: { returnValue: false } }, null,
    ['mrcu/getConnectionStatus', 'bluetooth2/device/getStatus', 'bluetooth2/gatt/connect']); },
  function () { check('a failed read still disconnects', { read: { returnValue: false, errorText: 'x' } }, null, ALL); },
  function () { check('a value out of range is no level', { read: { returnValue: true, value: { value: { bytes: [255] } } } }, null, ALL); }
];
// When it reads: at the remote's wake, at most hourly, sooner after switching on.
steps.push(function () {
  pending++;
  var luna = fakeLuna();
  var on = true;
  rb.init({ luna: luna, discoverMs: 0, settleMs: 0 });
  var awake = { returnValue: true, connected: true, isBleRemocon: true };
  function reads() { return luna.calls.filter(function (c) { return c === 'bluetooth2/gatt/readCharacteristicValue'; }).length; }
  function after(fn) { setTimeout(fn, 20); }
  rb.connectionChanged({ returnValue: true, connected: false });
  after(function () {
    assert.strictEqual(luna.calls.length, 0, 'a remote going to sleep is no chance');
    rb.connectionChanged(awake);
    after(function () {
      assert.strictEqual(reads(), 1, 'read when it wakes');
      rb.connectionChanged(awake);
      after(function () {
        assert.strictEqual(reads(), 1, 'not again within the hour');
        rb.poweredOn();
        rb.connectionChanged(awake);
        after(function () {
          assert.strictEqual(reads(), 2, 'again at the first wake after switching on');
          console.log('  ✓ it reads when the remote wakes, at most hourly, and again after switching on');
          pending--;
        });
      });
    });
  });
});
steps.push(function () {
  pending++;
  var status = { returnValue: true, connected: false };
  var luna = fakeLuna({ status: status });
  rb.init({ luna: luna, discoverMs: 0, settleMs: 0 });
  rb.read(function (level) {
    assert.strictEqual(level, null);
    // The remote wakes: no connection was tried before, so it is still due.
    status.connected = true;
    status.isBleRemocon = true;
    rb.connectionChanged(status);
    setTimeout(function () {
      assert.ok(luna.calls.indexOf('bluetooth2/gatt/readCharacteristicValue') !== -1, 'read at the wake');
      console.log('  ✓ a check that finds the remote asleep does not put off the next wake');
      pending--;
    }, 20);
  });
});
steps.push(function () {
  util.writeJsonAtomic(tmpFile, { level: 75, at: 1234567, mac: REMOTE.address });
  rb.init({ stateFile: tmpFile });
  assert.strictEqual(rb.level(), 75);
  assert.strictEqual(rb.level(REMOTE.address), 75);
  assert.strictEqual(rb.level('11:22:33:44:55:66'), null, 'refused on MAC mismatch');
  util.unlinkQuiet(tmpFile);
  console.log('  ✓ last known battery level is loaded from disk on start and keyed by MAC');
});
steps.push(function () {
  pending++;
  util.unlinkQuiet(tmpFile);
  var luna = fakeLuna({ read: { returnValue: true, value: { value: { bytes: [88] } } } });
  rb.init({ luna: luna, discoverMs: 0, settleMs: 0, stateFile: tmpFile });
  rb.read(function (level) {
    assert.strictEqual(level, 88);
    var saved = util.readJson(tmpFile, null);
    assert.ok(saved, 'stateFile was written');
    assert.strictEqual(saved.level, 88);
    assert.strictEqual(saved.mac, REMOTE.address);
    util.unlinkQuiet(tmpFile);
    console.log('  ✓ a successful read saves the level and MAC to disk');
    pending--;
  });
});

(function next(i) {
  if (i === steps.length) {
    assert.strictEqual(rb.remoteAddress([{ paired: false, typeOfDevice: 'ble', name: 'LGE MR24', address: 'a' }, REMOTE]), REMOTE.address,
      'the paired remote');
    assert.strictEqual(rb.levelFrom(null), null);
    console.log('  ✓ the remote is the paired LG one, and only a byte from 0 to 100 is a level');
    console.log('test-remotebattery.js passed');
    return;
  }
  steps[i]();
  (function wait() { if (pending) return setTimeout(wait, 5); next(i + 1); })();
})(0);
