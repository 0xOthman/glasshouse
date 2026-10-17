/**
 * test/test-home.js - Glasshouse Home: the saved layout merges with what the
 * TV has, switching on keeps the TV's Home settings once and switching off
 * puts them back exactly, the guard gives up on LG's Home after its bounce
 * limit, and a view that sends no heartbeat is replaced by LG's Home
 *
 * Strict ES5: runs on node 0.12.
 */
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var home = require('../server/lib/home');

console.log('Running test-home.js ...');

var HOME_APP = 'com.tvweb.home';
var LG_HOME = 'com.webos.app.home';
var dir = path.join(os.tmpdir(), 'tvweb-home-' + process.pid);
fs.mkdirSync(dir);
process.on('exit', function () {
  try { fs.readdirSync(dir).forEach(function (f) { fs.unlinkSync(path.join(dir, f)); }); fs.rmdirSync(dir); } catch (e) {}
});

function copy(o) { return JSON.parse(JSON.stringify(o)); }

// The TV: its general settings, what is installed, and what was launched.
var ORIGINAL = {
  defaultApps: { MembershipApp: 'com.webos.app.overlaymembership' },
  lastInputApp: 'com.webos.app.hdmi2', physicalLastInputApp: 'com.webos.app.hdmi2',
  lastInputAppType: 'HDMI_2', physicalLastInputType: 'HDMI_2',
  screenSaverEnabled: 'on'
};
var tv;
function freshTv() { tv = { settings: copy(ORIGINAL), launched: [], homeInstalled: true }; }
freshTv();

function luna(uri, p, cb) {
  var r = { returnValue: true };
  if (uri === 'com.webos.service.settings/getSystemSettings') {
    r.settings = {};
    p.keys.forEach(function (k) { if (tv.settings[k] !== undefined) r.settings[k] = copy(tv.settings[k]); });
  } else if (uri === 'com.webos.service.settings/setSystemSettings') {
    for (var k in p.settings) tv.settings[k] = copy(p.settings[k]);
  } else if (uri === 'com.webos.applicationManager/getAppInfo') {
    r.returnValue = tv.homeInstalled;
  } else if (uri === 'com.webos.applicationManager/launch') {
    tv.launched.push(p.id);
  } else if (uri === 'com.webos.applicationManager/listLaunchPoints') {
    r.launchPoints = [
      { id: 'netflix', title: 'Netflix', icon: '/x/netflix.png' },
      { id: 'youtube.leanback.v4', title: 'YouTube', icon: '/x/yt.png' },
      { id: 'cdp-30', title: 'Plex', icon: '/x/plex.png' },
      { id: 'com.webos.app.hdmi1', title: 'HDMI 1', lptype: 'bookmark' },
      { id: HOME_APP, title: 'Glasshouse Home' }
    ];
  } else if (uri === 'com.webos.service.eim/getAllInputStatus') {
    // As a G3 reports them: a receiver with a console behind it on HDMI 2, HDMI 1 empty.
    r.devices = [
      { id: 'HDMI_1', label: 'HDMI 1', connected: true, hdmiPlugIn: false },
      { id: 'HDMI_2', label: 'STEREO 70s', connected: true, hdmiPlugIn: true, subList: [
        { id: 'SIMPLINK', depth: 1, physicalAddress: 8192, osdName: 'STEREO 70s' },
        { id: 'SIMPLINK', depth: 2, physicalAddress: 9216, osdName: 'PlayStation 5' }
      ] }
    ];
  } else if (uri === 'com.webos.service.apiadapter/tv/getChannelList') {
    r.channelList = [];
  }
  process.nextTick(function () { cb(r); });
}

// The live state as the server keeps it: listeners and the snapshot.
var listeners = [];
var liveState = {
  state: {
    onChange: function (fn) { listeners.push(fn); },
    snapshot: function () { return {}; }
  },
  startGroup: function () {},
  stopGroup: function () {}
};
function foreground(id) {
  listeners.forEach(function (fn) { fn({ group: 'application', key: 'app_id', value: id }); });
}

function start(file) {
  listeners = [];
  freshTv();
  try { fs.unlinkSync(path.join(dir, 'home.json')); } catch (e) {}
  if (file) fs.writeFileSync(path.join(dir, 'home.json'), JSON.stringify(file));
  home.stop();
  home.init({ luna: luna, liveState: liveState, stateDir: dir, webosVersion: '9.2.2', uptime: function () { return 99999; } });
}

function wait(ms, fn) { setTimeout(fn, ms); }

var steps = [];
function step(name, fn) { steps.push({ name: name, fn: fn }); }
function next() {
  var s = steps.shift();
  if (!s) { console.log('All home tests passed.'); return process.exit(0); }
  s.fn(function () { console.log('  ✓ ' + s.name); next(); });
}

step('the saved layout keeps its order, drops what has gone and appends what is new', function (done) {
  start({ order: { app: ['cdp-30', 'gone.app', 'netflix'], dev: [], ch: [] }, hidden: { app: [], dev: [], ch: [] } });
  home.catalogue(function (c) {
    assert.deepEqual(c.order.app, ['cdp-30', 'netflix', 'youtube.leanback.v4', 'lg-home']);
    assert.deepEqual(c.order.dev, ['hdmi1', 'hdmi2:stereo-70s', 'hdmi2:playstation-5']);
    assert.strictEqual(c.devices[0].unused, true, 'an empty input is listed, marked unused');
    assert.strictEqual(c.devices[2].via, 'STEREO 70s');
    assert.strictEqual(c.devices[2].address, '2.4.0.0');
    done();
  });
});

step('a layout naming one row leaves the other rows as they were saved', function (done) {
  start({ order: { app: ['netflix', 'cdp-30'], dev: [], ch: [] } });
  home.setLayout({ order: { dev: ['hdmi2:playstation-5'] } }, function (r) {
    assert.ok(r.ok);
    assert.deepEqual(r.layout.order.app, ['netflix', 'cdp-30']);
    assert.deepEqual(r.layout.order.dev, ['hdmi2:playstation-5']);
    done();
  });
});

step('the LG Home tile cannot be hidden, and timings are kept in range', function (done) {
  start(null);
  home.setLayout({ hidden: { app: ['lg-home', 'netflix'] }, idle: { dimAfter: -5, panelOffAfter: 1e9 }, rows: ['ch', 'bogus'] }, function (r) {
    assert.deepEqual(r.layout.hidden.app, ['netflix']);
    assert.strictEqual(r.layout.idle.dimAfter, 120);
    assert.strictEqual(r.layout.idle.panelOffAfter, 6 * 3600);
    assert.deepEqual(r.layout.rows, ['ch', 'app', 'dev']);
    done();
  });
});

step('switching on keeps the settings once, and switching off puts them back exactly', function (done) {
  start(null);
  home.enable(function (r) {
    assert.ok(r.ok, r.error);
    assert.strictEqual(tv.settings.defaultApps.home, HOME_APP);
    assert.strictEqual(tv.settings.defaultApps.MembershipApp, 'com.webos.app.overlaymembership');
    // The view in front: the TV starts on it, and LG's screen saver is off.
    foreground(HOME_APP);
    wait(50, function () {
      assert.strictEqual(tv.settings.lastInputApp, HOME_APP);
      assert.strictEqual(tv.settings.screenSaverEnabled, 'off');
      home.disable(function (r2) {
        assert.ok(r2.ok, r2.error);
        assert.deepEqual(tv.settings, ORIGINAL);
        // Changed while off, then on and off again: still the first snapshot.
        tv.settings.screenSaverEnabled = 'off';
        home.enable(function () {
          home.disable(function () {
            assert.strictEqual(tv.settings.screenSaverEnabled, 'on');
            done();
          });
        });
      });
    });
  });
});

step('switching on is refused on an untried webOS, changing nothing', function (done) {
  start(null);
  home.init({ luna: luna, liveState: liveState, stateDir: dir, webosVersion: '6.3.1' });
  home.enable(function (r) {
    assert.strictEqual(r.ok, false);
    assert.ok(/webOS 6\.3\.1/.test(r.error));
    assert.deepEqual(tv.settings, ORIGINAL);
    done();
  });
});

step('the app is added without switching anything on, and cannot be removed while on', function (done) {
  start(null);
  tv.homeInstalled = false;
  home.init({ luna: luna, liveState: liveState, stateDir: dir, webosVersion: '9.2.2',
    installApp: function (action, cb) { tv.homeInstalled = action === 'install'; process.nextTick(cb); } });
  home.install(function (r) {
    assert.ok(r.ok && r.installed, r.error);
    assert.deepEqual(tv.settings, ORIGINAL, 'installing changes no setting');
    home.enable(function () {
      home.remove(function (r2) {
        assert.strictEqual(r2.ok, false);
        assert.strictEqual(tv.homeInstalled, true);
        home.disable(function () {
          home.remove(function (r3) {
            assert.ok(r3.ok, r3.error);
            assert.strictEqual(tv.homeInstalled, false);
            done();
          });
        });
      });
    });
  });
});

step('LG\'s Home is sent back at most eight times in ten seconds, then left', function (done) {
  start(null);
  home.enable(function () {
    tv.launched = [];
    for (var i = 0; i < 10; i++) { foreground(LG_HOME); foreground(HOME_APP); }
    foreground(LG_HOME);
    wait(50, function () {
      assert.strictEqual(tv.launched.filter(function (id) { return id === HOME_APP; }).length, 8);
      home.disable(function () { done(); });
    });
  });
});

step('a view in front with no heartbeat is replaced by LG\'s Home; one that beats is not', function (done) {
  start(null);
  home.enable(function () {
    foreground('netflix');
    foreground(HOME_APP);
    tv.launched = [];
    // Beats within the grace period: left alone.
    wait(1000, function () { home.beat(); });
    wait(10500, function () {
      assert.strictEqual(tv.launched.indexOf(LG_HOME), -1);
      foreground('netflix');
      foreground(HOME_APP);
      wait(10500, function () {
        assert.deepEqual(tv.launched, [LG_HOME]);
        home.disable(function () { done(); });
      });
    });
  });
});

next();
