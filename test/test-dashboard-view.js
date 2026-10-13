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

// 4. page() jumps through rows skipping headers and clamps to bounds
(function testPagePaging() {
  assert.strictEqual(typeof sandbox.page, 'function', 'page function exists');
  sandbox.rows = [
    { label: 'Row 0' },
    { label: 'Row 1' },
    { label: 'Row 2' },
    { label: 'Header A', head: true },
    { label: 'Row 4' },
    { label: 'Row 5' },
    { label: 'Row 6' },
    { label: 'Row 7' },
    { label: 'Row 8' },
    { label: 'Row 9' },
    { label: 'Row 10' }
  ];
  sandbox.sel = 0;
  // Page down by 6 selectable rows: 0 -> 1 -> 2 -> (skip 3) -> 4 -> 5 -> 6 -> 7
  sandbox.page(1);
  assert.strictEqual(sandbox.sel, 7, 'pages down 6 selectable rows skipping header');
  // Page down again: from 7, only 8, 9, 10 remain (3 rows) -> clamps to last row 10
  sandbox.page(1);
  assert.strictEqual(sandbox.sel, 10, 'clamps to last row at bottom');
  // Page down again when already at bottom: stays at 10
  sandbox.page(1);
  assert.strictEqual(sandbox.sel, 10, 'stays at last row when already at bottom');
  // Page up by 6 selectable rows: from 10 -> 9 -> 8 -> 7 -> 6 -> 5 -> 4
  sandbox.page(-1);
  assert.strictEqual(sandbox.sel, 4, 'pages up 6 selectable rows');
  // Page up again: from 4 -> (skip 3) -> 2 -> 1 -> 0 -> clamps to 0
  sandbox.page(-1);
  assert.strictEqual(sandbox.sel, 0, 'clamps to first row at top');
  // Page up again: stays at 0
  sandbox.page(-1);
  assert.strictEqual(sandbox.sel, 0, 'stays at first row when already at top');
  console.log('  ✓ page() jumps 6 rows, skips headers, and respects list bounds');
})();

console.log('ALL test-dashboard-view.js assertions passed!\n');
