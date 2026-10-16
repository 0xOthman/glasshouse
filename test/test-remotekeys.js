/**
 * test/test-remotekeys.js - The remote's keys are changed through the
 * compositor's key filter chain: a filter file written from what is set and put
 * first in com.webos.surfacemanager.keyFilters, taken out again when nothing
 * is set, and only the keys this TV's own filters name are offered
 *
 * Strict ES5: runs on node 0.12.
 */
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');
var rk = require('../server/lib/remotekeys');

console.log('Running test-remotekeys.js ...');

var dir = path.join(os.tmpdir(), 'tvweb-remotekeys-' + process.pid);
var stateDir = path.join(dir, 'state');
var filtersDir = path.join(dir, 'KeyFilters');
fs.mkdirSync(dir);
fs.mkdirSync(stateDir);
fs.mkdirSync(filtersDir);
// A CX's filters name Netflix, Prime Video, Guide and the color keys; no Disney+ key.
fs.writeFileSync(path.join(filtersDir, 'systemUi.js'), 'case Qt.Key_Super_L: case WebOS.Key_webOS_Red:');
fs.writeFileSync(path.join(filtersDir, 'appLaunch.js'), 'case WebOS.Key_webOS_Netflix: case WebOS.Key_webOS_Amazon: case WebOS.Key_webOS_TVGuide:');
fs.writeFileSync(path.join(filtersDir, 'notes.txt'), 'WebOS.Key_webOS_Disneyplus');

var FILTER = path.join(stateDir, 'remotekeys-filter.js');
var MAP = path.join(stateDir, 'remotekeys.json');
var LG = [
  { file: '/usr/lib/qt5/qml/KeyFilters/systemUi.js', handler: 'handleScreenSaver' },
  { file: '/usr/lib/qt5/qml/KeyFilters/appLaunch.js', handler: 'handleHotkeys' }
];
var APPS = [
  { id: 'youtube.leanback.v4', title: 'YouTube', visible: true },
  { id: 'netflix', title: 'Netflix', visible: true },
  { id: 'com.webos.app.hdmi2', title: 'HDMI2', visible: false },
  { id: 'com.webos.app.livetv', title: 'Live TV', visible: true }
];

var tv = { chain: LG.slice(), writes: [] };
function luna(uri, params, cb) {
  var r = { returnValue: true };
  if (uri === 'com.webos.service.config/getConfigs') {
    r.configs = {};
    r.configs[rk.CONFIG_KEY] = tv.chain.slice();
  } else if (uri === 'com.webos.service.config/setConfigs') {
    tv.chain = params.configs[rk.CONFIG_KEY].slice();
    tv.writes.push(tv.chain.slice());
  } else if (uri === 'com.webos.applicationManager/listApps') {
    r.apps = APPS;
  }
  process.nextTick(function () { cb(r); });
}
rk.init({ luna: luna, inputNames: { hdmi1: 'HDMI 1', hdmi2: 'Apple TV' }, stateDir: stateDir, filtersDir: filtersDir });

function checked(fn) {
  return function (arg) {
    try { fn(arg); } catch (e) {
      console.error('  ✗ ' + e.message);
      process.exit(1);
    }
  };
}

function exists(p) { try { fs.statSync(p); return true; } catch (e) { return false; } }

// Runs the written filter as the compositor would, with the symbols it names.
// broken: 'launch' makes the launch throw, 'symbols' leaves WebOS undefined.
function loadFilter(broken) {
  var launched = [];
  var ctx = {
    WebOS: { Key_webOS_Netflix: 1001, Key_webOS_Amazon: 1002, Key_webOS_TVGuide: 1003, Key_webOS_Red: 1004 },
    Qt: { Key_Super_L: 2001 },
    KeyPolicy: { NextPolicy: 'next', Accepted: 'accepted', NotAccepted: 'notAccepted' },
    applicationManager: { launch: function (id, params) {
      if (broken === 'launch') throw new Error('no such app');
      launched.push({ id: id, params: params });
    } },
    console: { info: function () {}, warn: function () {} }
  };
  if (broken === 'symbols') delete ctx.WebOS;
  vm.runInNewContext(fs.readFileSync(FILTER, 'utf8') + '\nthis.handler = ' + rk.HANDLER + '; this.init = init;', ctx);
  ctx.init();
  return { handle: ctx.handler, launched: launched };
}

rk.getRemoteKeys(checked(function (r) {
  assert.strictEqual(r.supported, true);
  assert.deepEqual(r.keys.map(function (k) { return k.key; }), ['netflix', 'amazon', 'guide', 'red']);
  assert.ok(r.keys.every(function (k) { return k.action === 'lg' && k.id === ''; }));
  assert.strictEqual(r.inChain, false);
  assert.deepEqual(r.choices.map(function (c) { return c.id; }),
    ['com.webos.app.hdmi1', 'com.webos.app.hdmi2', 'com.webos.app.livetv', 'netflix', 'youtube.leanback.v4']);
  console.log('  ✓ only the keys the TV\'s filters name are offered, each as LG has it, with the inputs and apps a key can open');

  rk.setRemoteKey('netflix', 'open', 'youtube.leanback.v4', checked(function (s) {
    assert.strictEqual(s.ok, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(MAP, 'utf8')).keys, { netflix: 'youtube.leanback.v4' });
    assert.deepEqual(tv.chain[0], { file: FILTER, handler: rk.HANDLER });
    assert.deepEqual(tv.chain.slice(1), LG);
    var f = loadFilter();
    assert.strictEqual(f.handle(1001, true, false), 'accepted');
    assert.strictEqual(f.handle(1001, false, false), 'accepted');
    assert.strictEqual(f.handle(1001, true, true), 'accepted');
    assert.deepEqual(f.launched, [{ id: 'youtube.leanback.v4', params: '{}' }]);
    assert.strictEqual(f.handle(1002, true, false), 'next');
    assert.strictEqual(f.handle(2001, true, false), 'next');
    assert.strictEqual(f.launched.length, 1);
    console.log('  ✓ a key set to open an app: the filter is written and first in the chain, opens it once per press and consumes the release; every other key goes on to LG\'s filters');

    var writesBefore = tv.writes.length;
    rk.setRemoteKey('guide', 'nothing', '', checked(function (s2) {
      assert.strictEqual(s2.ok, true);
      assert.strictEqual(tv.chain.filter(function (e) { return e.file === FILTER; }).length, 1);
      assert.strictEqual(tv.chain.length, 3);
      // configd does not tell the compositor about a list written unchanged,
      // so the entry went out and came back: two writes, the first LG's alone.
      assert.strictEqual(tv.writes.length, writesBefore + 2);
      assert.deepEqual(tv.writes[writesBefore], LG);
      assert.deepEqual(tv.writes[writesBefore + 1][0], { file: FILTER, handler: rk.HANDLER });
      var f2 = loadFilter();
      assert.strictEqual(f2.handle(1003, true, false), 'accepted');
      assert.strictEqual(f2.launched.length, 0);
      assert.strictEqual(f2.handle(1001, true, false), 'accepted');
      assert.strictEqual(f2.launched.length, 1);
      console.log('  ✓ a key set to nothing is consumed without a launch; a second change takes the entry out and puts it back so the compositor reloads');

      // First in the chain, the filter sees every key: an error in it must
      // pass the key on, never stop LG's filters seeing it.
      var f3 = loadFilter('launch');
      assert.strictEqual(f3.handle(1001, true, false), 'next');
      var f4 = loadFilter('symbols');
      assert.strictEqual(f4.handle(1001, true, false), 'next');
      assert.strictEqual(f4.handle(2001, true, false), 'next');
      console.log('  ✓ an error in the filter, a failed launch or a key name the firmware lacks, passes the key on to LG\'s filters');

      rk.getRemoteKeys(checked(function (r2) {
        assert.deepEqual(r2.keys.map(function (k) { return k.action + ':' + k.opens; }), ['open:YouTube', 'lg:', 'nothing:', 'lg:']);
        assert.strictEqual(r2.inChain, true);
        console.log('  ✓ the keys read back with what each does');

        rk.setRemoteKey('disneyplus', 'open', 'netflix', checked(function (s3) {
          assert.strictEqual(s3.ok, false);
          rk.setRemoteKey('red', 'open', 'com.webos.app.browser', checked(function (s4) {
            assert.strictEqual(s4.ok, false);
            assert.deepEqual(JSON.parse(fs.readFileSync(MAP, 'utf8')).keys, { netflix: 'youtube.leanback.v4', guide: '' });
            console.log('  ✓ a key the TV does not have, or an app not on it, is refused and changes nothing');

            // At a start with the chain intact nothing is written; after a
            // configd reset (the chain LG's again, the map still set) it is put back.
            var intact = tv.writes.length;
            rk.ensure(checked(function (ok0) {
              assert.strictEqual(ok0, true);
              assert.strictEqual(tv.writes.length, intact);
            tv.chain = LG.slice();
            fs.unlinkSync(FILTER);
            rk.ensure(checked(function (ok) {
              assert.strictEqual(ok, true);
              assert.strictEqual(tv.chain[0].file, FILTER);
              assert.ok(exists(FILTER));
              console.log('  ✓ ensure() at start leaves an intact chain alone and puts a set map back into one that lost it');

              rk.setRemoteKey('netflix', 'lg', '', checked(function (s5) {
                assert.strictEqual(s5.ok, true);
                assert.ok(exists(FILTER));
                rk.setRemoteKey('guide', 'lg', '', checked(function (s6) {
                  assert.strictEqual(s6.ok, true);
                  assert.ok(!exists(MAP));
                  assert.ok(!exists(FILTER));
                  assert.deepEqual(tv.chain, LG);
                  console.log('  ✓ with every key as LG has it the map and the filter are gone and the chain is LG\'s');

                  rk.setRemoteKey('red', 'open', 'com.webos.app.hdmi2', checked(function (s7) {
                    assert.strictEqual(s7.ok, true);
                    var before = tv.writes.length;
                    rk.restore(checked(function (ok2) {
                      assert.strictEqual(ok2, true);
                      assert.ok(!exists(MAP));
                      assert.ok(!exists(FILTER));
                      assert.deepEqual(tv.chain, LG);
                      assert.strictEqual(tv.writes.length, before + 1);
                      rk.restore(checked(function () {
                        assert.strictEqual(tv.writes.length, before + 1);
                        console.log('  ✓ restore() puts LG\'s chain back, and does not write it again when it already is');

                        rk.init({ luna: luna, stateDir: stateDir, filtersDir: path.join(dir, 'missing') });
                        rk.getRemoteKeys(checked(function (r3) {
                          assert.strictEqual(r3.supported, false);
                          console.log('  ✓ a TV without the filter files is not offered the keys');
                          fs.readdirSync(filtersDir).forEach(function (f) { fs.unlinkSync(path.join(filtersDir, f)); });
                          fs.rmdirSync(filtersDir);
                          fs.rmdirSync(stateDir);
                          fs.rmdirSync(dir);
                          console.log('test-remotekeys.js passed');
                        }));
                      }));
                    }));
                  }));
                }));
              }));
            }));
            }));
          }));
        }));
      }));
    }));
  }));
}));
