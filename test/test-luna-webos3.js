/**
 * test/test-luna-webos3.js - Settings service fallback for older webOS
 *
 * luna.js tries com.webos.service.settings first. When the TV answers
 * "Service does not exist", it remembers and remaps every later call to
 * com.webos.settingsservice.
 */

var assert = require('assert');
var child = require('child_process');

console.log('Running test-luna-webos3.js ...');

var calls = [];
var nextResponse = null;

child.execFile = function (file, args, opts, cb) {
  var uri = args[args.length - 2].replace('luna://', '');
  calls.push(uri);
  var res = typeof nextResponse === 'function' ? nextResponse(uri) : nextResponse;
  process.nextTick(function () { cb(null, JSON.stringify(res)); });
};
child.spawn = function () {
  var EventEmitter = require('events').EventEmitter;
  var c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  c.kill = function () {};
  return c;
};

// Fresh require for each scenario
function freshLuna() {
  delete require.cache[require.resolve('../server/lib/luna')];
  return require('../server/lib/luna');
}

// --- Scenario 1: newer TV, first call succeeds ---
calls = [];
nextResponse = { returnValue: true, settings: { backlight: '50' } };
var luna1 = freshLuna();

luna1.call('com.webos.service.settings/getSystemSettings', {}, function () {
  assert.strictEqual(calls[0], 'com.webos.service.settings/getSystemSettings',
    'newer TV: first call should use the new name');

  // Second call should still use the new name
  luna1.call('com.webos.service.settings/setSystemSettings', {}, function () {
    assert.strictEqual(calls[1], 'com.webos.service.settings/setSystemSettings',
      'newer TV: second call should keep the new name');
    console.log('  ✓ newer TV keeps com.webos.service.settings');

    // Non-settings URIs are never remapped
    luna1.call('com.webos.audio/getVolume', {}, function () {
      assert.strictEqual(calls[2], 'com.webos.audio/getVolume',
        'non-settings URI should pass through');
      console.log('  ✓ non-settings URIs are not touched');

      // --- Scenario 2: older TV, first call fails, retry with old name ---
      calls = [];
      var firstCall = true;
      nextResponse = function (uri) {
        if (firstCall && uri.indexOf('com.webos.service.settings') === 0) {
          firstCall = false;
          return {
            returnValue: false,
            errorCode: -1,
            errorText: 'Service does not exist: com.webos.service.settings.'
          };
        }
        return { returnValue: true, settings: { backlight: '50' } };
      };

      var luna2 = freshLuna();
      luna2.call('com.webos.service.settings/setSystemSettings', {}, function (res) {
        assert.strictEqual(calls[0], 'com.webos.service.settings/setSystemSettings',
          'older TV: first attempt should try the new name');
        assert.strictEqual(calls[1], 'com.webos.settingsservice/setSystemSettings',
          'older TV: retry should use the old name');
        assert.strictEqual(res.returnValue, true,
          'older TV: caller should get the successful retry result');
        console.log('  ✓ older TV falls back to com.webos.settingsservice on first call');

        // After fallback is learned, subsequent calls go straight to old name
        calls = [];
        luna2.call('com.webos.service.settings/getSystemSettings', {}, function () {
          assert.strictEqual(calls[0], 'com.webos.settingsservice/getSystemSettings',
            'older TV: subsequent calls should use the old name directly');
          console.log('  ✓ subsequent calls use the remembered old name');

          console.log('ALL test-luna-webos3.js assertions passed!\n');
        });
      });
    });
  });
});
