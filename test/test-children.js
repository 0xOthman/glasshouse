/**
 * test/test-children.js - Urgent child starts go ahead of the launch queue, in turn
 */

var assert = require('assert');
var children = require('../server/lib/children');

console.log('Running test-children.js ...');

var order = [];
var startedAt = [];
function start(name) {
  return function () { order.push(name); startedAt.push(Date.now()); };
}

// The first start runs at once; the rest wait their gap, urgent ones first.
children.launch(start('a'));
children.launch(start('b'));
children.launch(start('c'));
children.launch(start('u1'), true);
children.launch(start('u2'), true);
// One queued after the urgent ones are under way still goes ahead of b and c.
setTimeout(function () { children.launch(start('u3'), true); }, 200);

setTimeout(function () {
  assert.deepEqual(order, ['a', 'u1', 'u2', 'u3', 'b', 'c']);
  for (var i = 1; i < startedAt.length; i++) {
    assert.ok(startedAt[i] - startedAt[i - 1] >= 130,
              'start ' + i + ' came ' + (startedAt[i] - startedAt[i - 1]) + 'ms after the one before');
  }
  console.log('  ✓ urgent starts go first, in the order asked, and keep the gap');
  console.log('ALL test-children.js assertions passed!\n');
}, 1200);
