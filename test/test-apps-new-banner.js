/**
 * test/test-apps-new-banner.js - Unit tests for passive "new app" alert banner:
 * baseline tracking, initial boot seeding, detection of unknown app IDs,
 * acknowledging/keeping apps, pruning uninstalled apps, and /api/apps/ack-app route.
 *
 * Strict ES5 for Node 0.12.
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var events = require('events');
var apps = require('../server/lib/apps');
var routes = require('../server/lib/routes');

console.log('Running test-apps-new-banner.js ...');

var TMP_KNOWN = path.join(__dirname, 'tmp-known-apps-' + process.pid + '.json');
try { if (fs.existsSync(TMP_KNOWN)) fs.unlinkSync(TMP_KNOWN); } catch (e) {}

var mockAppsList = [
  { id: 'youtube.leanback.v4', title: 'YouTube', removable: true, folderPath: '/media/cryptofs/apps/usr/palm/applications/youtube.leanback.v4' },
  { id: 'lgchannels.uk', title: 'LG Channels', removable: true, folderPath: '/media/cryptofs/apps/usr/palm/applications/lgchannels.uk' }
];

function mockLuna(uri, params, cb) {
  if (uri === 'com.webos.applicationManager/listApps') {
    return process.nextTick(function () {
      cb({ returnValue: true, apps: mockAppsList });
    });
  }
  if (uri === 'com.webos.applicationManager/listLaunchPoints') {
    var lps = mockAppsList.map(function (a) {
      return { id: a.id, title: a.title, removable: a.removable, folderPath: a.folderPath };
    });
    return process.nextTick(function () {
      cb({ returnValue: true, launchPoints: lps });
    });
  }
  if (uri === 'com.webos.applicationManager/closeByAppId') {
    return process.nextTick(function () { cb({ returnValue: true }); });
  }
  if (uri === 'com.webos.appInstallService/remove') {
    return process.nextTick(function () { cb({ returnValue: true }); });
  }
  process.nextTick(function () { cb({ returnValue: false }); });
}

apps.init({
  luna: mockLuna,
  config: { allowControl: true },
  knownAppsFile: TMP_KNOWN
});

// 1. Initial boot baseline seeding
apps.getApps(function (d1) {
  assert.strictEqual(d1.ok, true, 'getApps should succeed');
  assert.strictEqual(d1.installed.length, 2, 'installed should have 2 apps');
  assert.strictEqual(d1.newApps.length, 0, 'first run must seed baseline and report 0 newApps');
  assert.strictEqual(d1.installed[0].isNew, false);
  assert.strictEqual(d1.installed[1].isNew, false);
  assert.strictEqual(fs.existsSync(TMP_KNOWN), true, 'known_apps.json should be created on disk');

  var savedKnown = JSON.parse(fs.readFileSync(TMP_KNOWN, 'utf8'));
  assert.strictEqual(savedKnown['youtube.leanback.v4'], true);
  assert.strictEqual(savedKnown['lgchannels.uk'], true);
  console.log('  ✓ initial boot baseline seeds known_apps.json without flagging existing apps');

  // 2. Detection of newly pushed/installed app
  mockAppsList.push({
    id: 'com.sponsored.bloatware',
    title: 'Sponsored App',
    version: '1.2.0',
    vendor: 'AdCorp',
    removable: true,
    folderPath: '/media/cryptofs/apps/usr/palm/applications/com.sponsored.bloatware'
  });

  apps.getApps(function (d2) {
    assert.strictEqual(d2.installed.length, 3, 'installed should have 3 apps');
    assert.strictEqual(d2.newApps.length, 1, 'should detect exactly 1 new app');
    assert.strictEqual(d2.newApps[0].id, 'com.sponsored.bloatware');
    assert.strictEqual(d2.newApps[0].title, 'Sponsored App');

    var bloatInst = null;
    for (var i = 0; i < d2.installed.length; i++) {
      if (d2.installed[i].id === 'com.sponsored.bloatware') bloatInst = d2.installed[i];
    }
    assert.notStrictEqual(bloatInst, null);
    assert.strictEqual(bloatInst.isNew, true, 'new app in installed list should have isNew: true');
    console.log('  ✓ newly installed/pushed app is detected and flagged as isNew');

    // 3. Acknowledge single app via ackApp
    apps.ackApp('com.sponsored.bloatware', function (ackRes) {
      assert.strictEqual(ackRes.ok, true);

      apps.getApps(function (d3) {
        assert.strictEqual(d3.newApps.length, 0, 'acknowledged app should no longer appear in newApps');
        console.log('  ✓ ackApp acknowledges app and removes it from newApps');

        // 4. Pruning: when app is removed from TV, it is pruned from known_apps
        mockAppsList = mockAppsList.filter(function (a) { return a.id !== 'com.sponsored.bloatware'; });

        apps.getApps(function (d4) {
          assert.strictEqual(d4.installed.length, 2);
          var updatedKnown = JSON.parse(fs.readFileSync(TMP_KNOWN, 'utf8'));
          assert.strictEqual(updatedKnown['com.sponsored.bloatware'], undefined, 'uninstalled app pruned from known_apps');

          // If the app is pushed AGAIN later, it triggers new app banner again!
          mockAppsList.push({
            id: 'com.sponsored.bloatware',
            title: 'Sponsored App',
            version: '1.2.0',
            vendor: 'AdCorp',
            removable: true,
            folderPath: '/media/cryptofs/apps/usr/palm/applications/com.sponsored.bloatware'
          });

          apps.getApps(function (d5) {
            assert.strictEqual(d5.newApps.length, 1, 're-pushed app is flagged as new again');
            assert.strictEqual(d5.newApps[0].id, 'com.sponsored.bloatware');
            console.log('  ✓ pruning ensures previously removed apps alert again if re-installed');

            // 5. Test routes: POST /api/apps/ack-app
            routes.init({
              config: { allowControl: true, token: '', web: { enabled: false } },
              apps: apps,
              services: { getServices: function (cb) { cb({ ok: true, services: [] }); } },
              fromHomebrewChannel: function () { return false; }
            });

            function postJson(url, payload, onDone) {
              var r = new events.EventEmitter();
              r.url = url;
              r.method = 'POST';
              r.headers = { host: '127.0.0.1:8080', 'content-type': 'application/json' };
              r.connection = { remoteAddress: '127.0.0.1' };
              r.destroy = function () {};
              var resp = {
                statusCode: null,
                body: '',
                writeHead: function (code) { resp.statusCode = code; },
                setHeader: function () {},
                end: function (chunk) {
                  if (chunk) resp.body += chunk;
                  onDone(resp.statusCode, resp.body ? JSON.parse(resp.body) : null);
                }
              };
              routes.handleRequest(r, resp);
              r.emit('data', JSON.stringify(payload));
              r.emit('end');
            }

            postJson('/api/apps/ack-app', { id: 'com.sponsored.bloatware' }, function (status, body) {
              assert.strictEqual(status, 200);
              assert.strictEqual(body.ok, true);

              apps.getApps(function (d6) {
                assert.strictEqual(d6.newApps.length, 0, 'ack-app route successfully acknowledged app');
                console.log('  ✓ POST /api/apps/ack-app successfully acknowledges app');

                // 6. Test acknowledge all via route { all: true }
                mockAppsList.push({
                  id: 'com.extra1', title: 'Extra 1', removable: true, folderPath: '/media/cryptofs/apps/usr/palm/applications/com.extra1'
                });
                mockAppsList.push({
                  id: 'com.extra2', title: 'Extra 2', removable: true, folderPath: '/media/cryptofs/apps/usr/palm/applications/com.extra2'
                });

                apps.getApps(function (d7) {
                  assert.strictEqual(d7.newApps.length, 2, 'two new apps detected');

                  postJson('/api/apps/ack-app', { all: true }, function (allStatus, allBody) {
                    assert.strictEqual(allStatus, 200);
                    assert.strictEqual(allBody.ok, true);

                    apps.getApps(function (d8) {
                      assert.strictEqual(d8.newApps.length, 0, 'all new apps acknowledged');
                      console.log('  ✓ POST /api/apps/ack-app with { all: true } acknowledges all apps');

                      // Cleanup
                      try { if (fs.existsSync(TMP_KNOWN)) fs.unlinkSync(TMP_KNOWN); } catch (e) {}
                      console.log('ALL test-apps-new-banner.js assertions passed!\n');
                      process.exit(0);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
