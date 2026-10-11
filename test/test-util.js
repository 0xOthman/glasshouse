/**
 * test/test-util.js - The small helpers the server's modules share
 *
 * Strict ES5: runs on node 0.12.
 */
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('../server/lib/util');

console.log('Running test-util.js ...');

var dir = fs.mkdtempSync ? fs.mkdtempSync(path.join(os.tmpdir(), 'tvweb-util-')) :
  path.join(os.tmpdir(), 'tvweb-util-' + process.pid);
util.mkdirp(dir);

assert.strictEqual(util.toInt('42', 0), 42);
assert.strictEqual(util.toInt('7px', 0), 7);
assert.strictEqual(util.toInt('', 5), 5);
assert.strictEqual(util.toInt(undefined, 0), 0);
assert.strictEqual(util.toInt('0', 5), 0);
console.log('  ✓ toInt parses an integer, or gives the default');

var a = util.monotonicMs();
var b = util.monotonicMs();
assert.strictEqual(typeof a, 'number');
assert.ok(b >= a);
console.log('  ✓ monotonicMs does not go back');

assert.deepEqual(Array.prototype.slice.call(util.toBuffer([1, 2, 255])), [1, 2, 255]);
assert.strictEqual(util.toBuffer('hé', 'utf8').length, 3);
assert.strictEqual(util.toBuffer('hé', 'utf8').toString('utf8'), 'hé');
console.log('  ✓ toBuffer takes bytes or a string in an encoding');

var zero = util.allocBuffer(8);
assert.strictEqual(zero.length, 8);
for (var i = 0; i < zero.length; i++) assert.strictEqual(zero[i], 0);
console.log('  ✓ allocBuffer gives zeroed bytes');

var file = path.join(dir, 'state.json');
util.writeJsonAtomic(file, { a: 1, b: [2] });
assert.strictEqual(fs.readFileSync(file, 'utf8'), JSON.stringify({ a: 1, b: [2] }, null, 2));
assert.ok(!fs.existsSync(file + '.tmp'));
console.log('  ✓ writeJsonAtomic writes the JSON and leaves no temporary file');

var secret = path.join(dir, 'config.json');
util.writeJsonAtomic(secret, { token: 'x' }, parseInt('600', 8));
assert.strictEqual(fs.statSync(secret).mode & parseInt('777', 8), parseInt('600', 8));
console.log('  ✓ writeJsonAtomic sets the mode when given one');

assert.throws(function () { util.writeJsonAtomic(path.join(dir, 'missing', 'x.json'), {}); });
console.log('  ✓ writeJsonAtomic throws when it cannot write');

assert.deepEqual(util.readJson(file, null), { a: 1, b: [2] });
assert.strictEqual(util.readJson(path.join(dir, 'missing.json'), null), null);
fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
assert.deepEqual(util.readJson(path.join(dir, 'bad.json'), {}), {});
console.log('  ✓ readJson parses a file, or gives the default when it is missing or bad');

fs.writeFileSync(path.join(dir, 'padded'), '  qml\n');
assert.strictEqual(util.readTrimmed(path.join(dir, 'padded')), 'qml');
assert.strictEqual(util.readTrimmed(path.join(dir, 'missing')), null);
console.log('  ✓ readTrimmed trims, or gives null');

assert.strictEqual(util.existsQuiet(file), true);
assert.strictEqual(util.existsQuiet(path.join(dir, 'missing')), false);
util.unlinkQuiet(file);
assert.strictEqual(util.existsQuiet(file), false);
util.unlinkQuiet(file);
console.log('  ✓ unlinkQuiet removes a file, and says nothing when it is not there');

[secret, path.join(dir, 'bad.json'), path.join(dir, 'padded')].forEach(util.unlinkQuiet);
fs.rmdirSync(dir);
