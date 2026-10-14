/**
 * test/test-backup.js - A backup of the TV's settings, and restoring it
 */

var assert = require('assert');
var backup = require('../server/lib/backup');

console.log('Running test-backup.js ...');

// Rows as lgsettings.collect gives them on a TV, and what set was asked.
function fakeLg(rows) {
  var sets = [];
  return {
    sets: sets,
    collect: function (sections, cb) {
      assert.deepEqual(sections, ['promotions', 'sound', 'devices', 'hdmi'], 'no game settings');
      cb({ ok: true, rows: rows });
    },
    set: function (id, value, cb) {
      sets.push([id, value]);
      cb({ ok: id !== 'refuses' });
    }
  };
}

var C4_ROWS = [
  { id: 'homePromotion', section: 'promotions', type: 'switch', on: false },
  { id: 'soundMode', section: 'sound', type: 'choice', value: 'standard',
    choices: [{ value: 'standard' }, { value: 'cinema' }, { value: 'aiSoundPro' }] },
  { id: 'avSync', section: 'sound', type: 'number', value: 0, min: -5, max: 15 },
  { id: 'deepColor2', section: 'hdmi', type: 'switch', on: false, active: false }
];

var CONFIG = {
  port: 8080, host: '::', token: 'secret', allowControl: true, allowPower: true,
  allowNetworkDebugger: false, allowTileHiding: false,
  mqtt: { enabled: true, host: 'nas', topicPrefix: 'lgtv', password: 'pw' },
  device: { id: 'lg_tv', name: 'Living room', model: 'OLED65C43LA' },
  logging: { level: 'info' },
  syslog: { server: 'nas', port: 514, hostname: 'c4', sources: ['system'], redact: true },
  ntp: { server: '192.168.8.1', port: 123 },
  history: { enabled: true },
  prometheus: { enabled: true },
  update: { check: false, intervalHours: 24 }
};

// 1. What a backup holds
(function () {
  backup.init({ lgSettings: fakeLg(C4_ROWS), config: CONFIG, about: function () { return { model: 'OLED65C43LA', version: '0.95.0' }; } });
  backup.create(function (b) {
    assert.strictEqual(b.format, 'glasshouse-backup');
    assert.strictEqual(b.version, 1);
    assert.deepEqual(b.from, { model: 'OLED65C43LA', glasshouse: '0.95.0' });
    assert.deepEqual(b.lg, { homePromotion: false, soundMode: 'standard', avSync: 0, deepColor2: false });
    assert.deepEqual(b.glasshouse, {
      logging: { level: 'info' },
      syslog: { server: 'nas', port: 514, sources: ['system'], redact: true },
      ntp: { server: '192.168.8.1', port: 123 },
      history: { enabled: true },
      prometheus: { enabled: true },
      update: { check: false }
    }, 'no access, MQTT, device or experimental settings, and no syslog hostname');
    var text = JSON.stringify(b);
    assert.strictEqual(text.indexOf('secret'), -1, 'no token');
    assert.strictEqual(text.indexOf('pw'), -1, 'no MQTT password');
    console.log('  ✓ a backup holds LG\'s known settings and the Glasshouse settings that suit any TV');
  });
})();

// 2. Restoring onto another TV
(function () {
  var lg = fakeLg(C4_ROWS.concat([{ id: 'refuses', section: 'devices', type: 'switch', on: false }]));
  var config = JSON.parse(JSON.stringify(CONFIG));
  var written = null;
  backup.init({ lgSettings: lg, config: config, writeSettings: function (patch, cb) { written = patch; cb(null); } });
  backup.restore({
    format: 'glasshouse-backup', version: 1,
    lg: {
      homePromotion: false,      // already so
      soundMode: 'cinema',       // offered here
      avSync: 40,                // out of this TV's range
      deepColor2: true,          // greyed out now
      eArc: true,                // not on this TV
      refuses: true              // the TV refuses
    },
    glasshouse: {
      ntp: { server: '192.168.8.2', port: 123 },
      history: { enabled: true },
      prometheus: { enabled: 'yes' },
      token: 'other', port: 9999, allowControl: false, host: '0.0.0.0',
      mqtt: { topicPrefix: 'lgtv' }, allowNetworkDebugger: true
    }
  }, function (r) {
    assert.strictEqual(r.ok, true);
    assert.deepEqual(lg.sets, [['soundMode', 'cinema'], ['refuses', true]]);
    assert.deepEqual(r.lg.applied, ['soundMode']);
    assert.strictEqual(r.lg.unchanged, 1);
    assert.deepEqual(r.lg.skipped, [
      { id: 'avSync', reason: 'value' }, { id: 'deepColor2', reason: 'inactive' }, { id: 'eArc', reason: 'absent' }
    ]);
    assert.deepEqual(r.lg.failed, [{ id: 'refuses', error: 'refused' }]);
    assert.deepEqual(written, { ntp: { server: '192.168.8.2' } }, 'only an allowed setting that differs is written');
    assert.deepEqual(r.glasshouse, ['ntp.server']);
    assert.strictEqual(r.restart, true);
    console.log('  ✓ a restore sets what this TV has and offers, and says why it skipped the rest');
    console.log('  ✓ a backup cannot change who can reach or control the server');
  });
})();

// 3. Files that are not a backup this TV can take
(function () {
  var lg = fakeLg(C4_ROWS);
  backup.init({ lgSettings: lg, config: CONFIG });
  backup.restore({ hello: 1 }, function (r) { assert.strictEqual(r.ok, false); });
  backup.restore(null, function (r) { assert.strictEqual(r.ok, false); });
  backup.restore({ format: 'glasshouse-backup', version: 2, lg: { soundMode: 'cinema' } }, function (r) {
    assert.strictEqual(r.ok, false, 'from a newer Glasshouse');
  });
  assert.deepEqual(lg.sets, [], 'nothing set');
  backup.restore({ format: 'glasshouse-backup', version: 1, lg: { homePromotion: false } }, function (r) {
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.restart, false, 'nothing of Glasshouse\'s changed, so no restart');
  });
  console.log('  ✓ anything that is not a backup, or is from a newer Glasshouse, is refused and changes nothing');
})();

console.log('test-backup.js passed');
