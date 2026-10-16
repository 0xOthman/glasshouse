/**
 * remotebuttons.js - Remote control button event listener for webOS
 *
 * Reads Linux evdev streams on webOS remote input devices (/dev/input/event*)
 * to detect red, green, yellow, and blue button presses on LG Magic and IR remotes.
 *
 * Runs in a dedicated worker child process to avoid blocking the main server's
 * libuv threadpool when waiting on Linux evdev character devices.
 *
 * Strict ES5 for Node 0.12.2 on webOS 4.
 */

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

// Linux EV_KEY event type and button keycodes
var EV_KEY = 1;
var KEY_PRESS = 1;

var BUTTON_CODES = {
  398: 'red',
  399: 'green',
  400: 'yellow',
  401: 'blue',
  18874385: 'red',
  18874386: 'green',
  18874387: 'yellow',
  18874388: 'blue'
};

var onButtonFn = null;
var workerProc = null;
var activeDevices = [];
var lastPressTime = {};
var DEBOUNCE_MS = 200;
var running = false;

function findRcuDevices() {
  var found = [];
  try {
    if (fs.existsSync('/proc/bus/input/devices')) {
      var content = fs.readFileSync('/proc/bus/input/devices', 'utf8');
      var blocks = content.split('\n\n');
      for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];
        var nameMatch = /Name="([^"]+)"/.exec(block);
        var name = nameMatch ? nameMatch[1] : '';
        if (/LGE RCU|LGE M-RCU|Smart Remote RCU Input|LGE Simple Premium/i.test(name)) {
          var handlerMatch = /Handlers=[^\n]*?(event\d+)/.exec(block);
          if (handlerMatch && handlerMatch[1]) {
            var dev = '/dev/input/' + handlerMatch[1];
            if (found.indexOf(dev) === -1) {
              found.push(dev);
            }
          }
        }
      }
    }
  } catch (e) {}

  if (!found.length) {
    if (fs.existsSync('/dev/input/event1')) found.push('/dev/input/event1');
    if (fs.existsSync('/dev/input/event2')) found.push('/dev/input/event2');
  }

  return found;
}

function handleParsedEvent(type, code, val) {
  if (type !== EV_KEY || val !== KEY_PRESS) return;
  var color = BUTTON_CODES[code];
  if (!color) return;

  var now = Date.now();
  if (lastPressTime[color] && (now - lastPressTime[color] < DEBOUNCE_MS)) {
    return;
  }
  lastPressTime[color] = now;

  if (process.argv.indexOf('--worker') !== -1) {
    try {
      process.stdout.write(color + ' ' + code + '\n');
    } catch (e) {}
  } else if (onButtonFn) {
    onButtonFn(color, code);
  }
}

function createDeviceStream(devPath) {
  var stream;
  try {
    stream = fs.createReadStream(devPath, { flags: 'r' });
  } catch (e) {
    return null;
  }

  var remainder = null;
  // 16 bytes for 32-bit (timeval=8, type=2, code=2, value=4)
  // 24 bytes for 64-bit (timeval=16, type=2, code=2, value=4)
  var evSize = (process.arch === 'arm64' || process.arch === 'x64') ? 24 : 16;
  var typeOff = (evSize === 24) ? 16 : 8;
  var codeOff = (evSize === 24) ? 18 : 10;
  var valOff = (evSize === 24) ? 20 : 12;

  stream.on('data', function (chunk) {
    if (!chunk || !Buffer.isBuffer(chunk)) return;
    var buf = chunk;
    if (remainder && remainder.length) {
      buf = Buffer.concat ? Buffer.concat([remainder, buf]) : buf;
      remainder = null;
    }

    var i = 0;
    while (i + evSize <= buf.length) {
      var type = buf.readUInt16LE(i + typeOff);
      var code = buf.readUInt16LE(i + codeOff);
      var val = buf.readInt32LE(i + valOff);
      handleParsedEvent(type, code, val);
      i += evSize;
    }

    if (i < buf.length) {
      remainder = buf.slice(i);
    }
  });

  stream.on('error', function (err) {});
  return stream;
}

function runWorker() {
  process.stdout.on('error', function (err) {
    if (err && err.code === 'EPIPE') process.exit(0);
  });
  if (process.stdin) {
    process.stdin.resume();
    process.stdin.on('end', function () {
      process.exit(0);
    });
    process.stdin.on('close', function () {
      process.exit(0);
    });
  }
  var devs = findRcuDevices();
  var streams = [];
  for (var i = 0; i < devs.length; i++) {
    var s = createDeviceStream(devs[i]);
    if (s) streams.push(s);
  }
  process.on('SIGTERM', function () {
    for (var j = 0; j < streams.length; j++) {
      try {
        if (streams[j].destroy) streams[j].destroy();
        else if (streams[j].close) streams[j].close();
      } catch (e) {}
    }
    process.exit(0);
  });
  setInterval(function () {}, 60000);
}

function stop() {
  running = false;
  if (workerProc) {
    try {
      workerProc.kill('SIGTERM');
    } catch (e) {}
    workerProc = null;
  }
  activeDevices = [];
}

function getPythonBin() {
  if (fs.existsSync('/usr/bin/python3')) return '/usr/bin/python3';
  if (fs.existsSync('/usr/bin/python')) return '/usr/bin/python';
  return null;
}

function isSupported() {
  var devs = findRcuDevices();
  return devs.length > 0 || fs.existsSync('/tmp/var/log/inputcommon');
}

function start() {
  stop();
  running = true;
  if (!isSupported()) return;
  activeDevices = findRcuDevices();

  var pyBin = getPythonBin();
  var pyScript = path.join(__dirname, 'remotebuttons.py');
  var child;

  try {
    if (pyBin && fs.existsSync(pyScript)) {
      child = child_process.spawn(pyBin, [pyScript], {
        stdio: ['pipe', 'pipe', 'inherit']
      });
    } else {
      /** @type {any} */
      var env = {};
      for (var k in process.env) env[k] = process.env[k];
      env.UV_THREADPOOL_SIZE = '16';
      child = child_process.spawn(process.execPath, [__filename, '--worker'], {
        env: env,
        stdio: ['pipe', 'pipe', 'inherit']
      });
    }
  } catch (e) {
    console.error('remotebuttons: failed to spawn worker: ' + e.message);
    return;
  }

  workerProc = child;
  var remainder = '';

  if (child.stdout) {
    child.stdout.on('error', function () {});
    child.stdout.on('data', function (chunk) {
      if (!chunk) return;
      var str = remainder + chunk.toString('utf8');
      var lines = str.split('\n');
      remainder = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        var parts = line.split(' ');
        var color = parts[0];
        var code = parseInt(parts[1], 10);
        if (BUTTON_CODES[code] && onButtonFn) {
          onButtonFn(color, code);
        }
      }
    });
  }

  child.on('error', function (err) {
    console.error('remotebuttons: worker process error: ' + (err ? err.message : err));
  });

  child.on('exit', function () {
    if (workerProc === child) {
      workerProc = null;
      if (running) {
        console.log('remotebuttons: worker exited, restarting in 1s...');
        setTimeout(function () {
          if (running) start();
        }, 1000);
      }
    }
  });

  var devDesc = activeDevices.length > 2
    ? activeDevices.length + ' input devices'
    : (activeDevices.length ? activeDevices.join(', ') : 'inputcommon');
  console.log('remotebuttons: listening for colored button events on ' + devDesc + ' (worker pid ' + child.pid + ')');
}

function init(opts) {
  opts = opts || {};
  onButtonFn = opts.onButton;
}

function isRunning() {
  return running && !!workerProc;
}

function status() {
  return {
    running: isRunning(),
    supported: isSupported(),
    devices: activeDevices.slice(),
    workerPid: workerProc ? workerProc.pid : null
  };
}

if (process.argv.indexOf('--worker') !== -1) {
  runWorker();
}

module.exports = {
  BUTTON_CODES: BUTTON_CODES,
  findRcuDevices: findRcuDevices,
  handleParsedEvent: handleParsedEvent,
  init: init,
  start: start,
  stop: stop,
  isSupported: isSupported,
  isRunning: isRunning,
  status: status
};
