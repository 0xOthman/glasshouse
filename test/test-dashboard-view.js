/**
 * test/test-dashboard-view.js - Unit tests for TV dashboard view builders
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

console.log('Running test-dashboard-view.js ...');

var htmlPath = path.join(__dirname, '..', 'server', 'assets', 'dashboard.html');
var html = fs.readFileSync(htmlPath, 'utf8');
var scriptMatch = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'Expected inline script in dashboard.html');

var dummyEl = {
  style: {},
  classList: { add: function () {}, remove: function () {} },
  children: [],
  scrollLeft: 0,
  getBoundingClientRect: function () { return { left: 0, width: 0 }; }
};
for (var i = 0; i < 10; i++) {
  dummyEl.children.push({
    style: {},
    classList: { add: function () {}, remove: function () {} },
    getBoundingClientRect: function () { return { left: 0, width: 0 }; }
  });
}

var sandbox = {
  t: function (k, d) { return d; },
  fetch: function () {
    var p = { then: function () { return p; }, catch: function () { return p; } };
    return p;
  },
  document: {
    getElementById: function () { return dummyEl; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  },
  window: { location: { search: '' }, addEventListener: function () {} },
  location: { search: '' },
  setInterval: function () {},
  setTimeout: function () {}
};

// runInNewContext rather than createContext and runInContext: node 0.10's
// createContext returns a copy instead of the sandbox itself.
vm.runInNewContext(scriptMatch[1], sandbox);

// 1. sysRows omits eMMC health when emmcWear is false or health is unknown
(function testEmmcHealthVisibility() {
  var rowsNoWear = sandbox.sysRows({
    ok: true,
    emmc: { health: 'unknown' },
    capabilities: { emmcWear: false }
  });
  assert.strictEqual(
    rowsNoWear.some(function (r) { return r.label === 'eMMC health'; }),
    false,
    'eMMC health omitted when emmcWear is false'
  );

  var rowsUnknown = sandbox.sysRows({
    ok: true,
    emmc: { health: 'unknown' }
  });
  assert.strictEqual(
    rowsUnknown.some(function (r) { return r.label === 'eMMC health'; }),
    false,
    'eMMC health omitted when health is unknown'
  );

  var rowsHealthy = sandbox.sysRows({
    ok: true,
    emmc: { health: '>90% (Healthy)' },
    capabilities: { emmcWear: true }
  });
  assert.strictEqual(
    rowsHealthy.some(function (r) { return r.label === 'eMMC health'; }),
    true,
    'eMMC health included when wear is available and healthy'
  );

  console.log('  ✓ sysRows omits eMMC health when unavailable or unknown');
})();

// 2. OLED Care is dropped on a TV without an OLED panel, as Game and Screen
// Saver are where the TV has neither
(function testOledTabOptional() {
  var oledTab = sandbox.TABS.filter(function (s) { return s.key === 'oled'; })[0];
  assert.ok(oledTab, 'the OLED Care tab exists');
  assert.strictEqual(oledTab.optional, true, 'and is dropped when /api/oledcare says it is unavailable');
  assert.deepEqual(sandbox.oledRows({ ok: true, isOled: false }), [], 'no rows on an LCD TV');
  console.log('  ✓ the OLED Care tab is optional, with no rows on a TV without an OLED panel');
})();

// 3. optionRows groups Power & standby and Timers with separate headers
(function testOptionRowsGrouping() {
  var rows = sandbox.optionRows({
    ok: true,
    quickBoot: true,
    wakeOnLan: true,
    powerTimers: {
      on: { enabled: true, time: '07:00', days: [1, 2, 3, 4, 5] },
      off: { enabled: false, time: '23:00', days: [] }
    }
  });
  var headers = rows.filter(function (r) { return r.head; }).map(function (r) { return r.label; });
  assert.ok(headers.indexOf('Power & standby') !== -1, 'has Power & standby section');
  assert.ok(headers.indexOf('Timers') !== -1, 'has separate Timers section');
  console.log('  ✓ optionRows groups Power & standby and Timers with distinct headers');
})();

console.log('ALL test-dashboard-view.js assertions passed!\n');
