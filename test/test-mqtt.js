/**
 * test/test-mqtt.js - The client reconnects to a broker that stopped answering
 */

var assert = require('assert');
var net = require('net');
var MiniMQTT = require('../server/lib/mqtt');
var toBuffer = require('../server/lib/util').toBuffer;

console.log('Running test-mqtt.js ...');

// A broker that answers CONNECT and nothing else, counting connections.
var connects = 0;
var server = net.createServer(function (sock) {
  sock.on('data', function (d) {
    if ((d[0] >> 4) === 1) {
      connects++;
      sock.write(toBuffer([0x20, 0x02, 0x00, 0x00])); // CONNACK
    }
  });
  sock.on('error', function () {});
});

function waitFor(what, test, ms, cb) {
  var start = Date.now();
  (function poll() {
    if (test()) return cb();
    if (Date.now() - start > ms) { console.error('  ✗ timed out waiting for ' + what); process.exit(1); }
    setTimeout(poll, 50);
  })();
}

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  var client = new MiniMQTT({ host: '127.0.0.1', port: port, clientId: 't', will: { topic: 's', payload: 'offline', retain: true } });
  client.on('error', function () {});
  client.connect();

  waitFor('first connect', function () { return client.connected; }, 3000, function () {
    assert.strictEqual(typeof client.latencyMs, 'number');
    assert.ok(client.latencyMs >= 0);
    // Latency is updated on PINGRESP (packet 13)
    client.pingStart = Date.now() - 40;
    client.client.emit('data', toBuffer([0xd0, 0x00]));
    assert.ok(client.latencyMs >= 40);
    console.log('  ✓ CONNACK and PINGRESP record and update latency');

    // 1. A close the broker never acknowledges is forced, and the client connects again
    client.client.end = function () {};
    client.setWill('asleep');
    waitFor('reconnect after a stuck close', function () { return connects === 2 && client.connected; }, 6000, function () {
      console.log('  ✓ a close left hanging is forced after a few seconds');

      // 2. A broker silent since before the last ping is dropped and reconnected
      var realNow = Date.now;
      var realSetInterval = global.setInterval;
      var ping = null;
      global.setInterval = function (fn) { ping = fn; return 0; };
      client.client.destroy();   // reconnects, and the new CONNACK captures the ping timer
      waitFor('reconnect', function () { return connects === 3 && client.connected && ping; }, 8000, function () {
        global.setInterval = realSetInterval;
        Date.now = function () { return realNow() + 60000; };
        ping();
        Date.now = realNow;
        waitFor('reconnect after silence', function () { return connects === 4 && client.connected; }, 8000, function () {
          console.log('  ✓ a broker silent past a ping is reconnected');
          client.disconnect();

          // 3. MiniMQTT.testConnection probes a responsive broker
          MiniMQTT.testConnection({ host: '127.0.0.1', port: port }, function (err, res) {
            assert.ifError(err);
            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.code, 0);
            assert.strictEqual(typeof res.latencyMs, 'number');
            console.log('  ✓ testConnection reports reachability and latency for an answering broker');

            // 4. MiniMQTT.testConnection reports failure on an unreachable port
            MiniMQTT.testConnection({ host: '127.0.0.1', port: 1 }, function (err2, res2) {
              assert.ifError(err2);
              assert.strictEqual(res2.ok, false);
              assert.strictEqual(typeof res2.error, 'string');
              console.log('  ✓ testConnection reports clean error on an unreachable port');

              // 5. MiniMQTT client and testConnection handle auth failure (CONNACK code 4)
              var authServer = net.createServer(function (sock) {
                sock.on('data', function (d) {
                  if ((d[0] >> 4) === 1) {
                    sock.write(toBuffer([0x20, 0x02, 0x00, 0x04])); // CONNACK code 4
                    sock.end();
                  }
                });
                sock.on('error', function () {});
              });
              authServer.listen(0, '127.0.0.1', function () {
                var authPort = authServer.address().port;
                var authClient = new MiniMQTT({ host: '127.0.0.1', port: authPort, clientId: 'badauth' });
                var authErr = null;
                authClient.on('error', function (e) { authErr = e; });
                authClient.connect();
                waitFor('auth error event', function () { return !!authErr; }, 3000, function () {
                  assert.strictEqual(authErr.message, 'bad username or password');
                  authClient.disconnect();
                  MiniMQTT.testConnection({ host: '127.0.0.1', port: authPort }, function (err3, res3) {
                    assert.ifError(err3);
                    assert.strictEqual(res3.ok, false);
                    assert.strictEqual(res3.code, 4);
                    assert.strictEqual(res3.error, 'bad username or password');
                    console.log('  ✓ bad username or password (CONNACK 4) surfaces descriptive error');

                    // 6. MiniMQTT client and testConnection handle not authorized (CONNACK code 5)
                    authServer.close(function () {
                      var unauthServer = net.createServer(function (sock) {
                        sock.on('data', function (d) {
                          if ((d[0] >> 4) === 1) {
                            sock.write(toBuffer([0x20, 0x02, 0x00, 0x05])); // CONNACK code 5
                            sock.end();
                          }
                        });
                        sock.on('error', function () {});
                      });
                      unauthServer.listen(0, '127.0.0.1', function () {
                        var unauthPort = unauthServer.address().port;
                        var unauthClient = new MiniMQTT({ host: '127.0.0.1', port: unauthPort, clientId: 'unauth' });
                        var unauthErr = null;
                        unauthClient.on('error', function (e) { unauthErr = e; });
                        unauthClient.connect();
                        waitFor('not authorized error event', function () { return !!unauthErr; }, 3000, function () {
                          assert.strictEqual(unauthErr.message, 'not authorized');
                          unauthClient.disconnect();
                          MiniMQTT.testConnection({ host: '127.0.0.1', port: unauthPort }, function (err4, res4) {
                            assert.ifError(err4);
                            assert.strictEqual(res4.ok, false);
                            assert.strictEqual(res4.code, 5);
                            assert.strictEqual(res4.error, 'not authorized');
                            console.log('  ✓ not authorized (CONNACK 5) surfaces descriptive error');

                            unauthServer.close();
                            server.close();
                            console.log('test-mqtt.js passed');
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
    });
  });
});
