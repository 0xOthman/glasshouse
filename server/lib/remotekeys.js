/*
 * lib/remotekeys.js - what the remote's keys do: a key opens an app or an
 * input, does nothing, or stays as LG has it
 *
 * The compositor (surface-manager) turns remote keys into actions through a
 * chain of JavaScript filters named by the configd key
 * com.webos.surfacemanager.keyFilters: an ordered list of { file, handler }
 * pairs, with LG's own in /usr/lib/qt5/qml/KeyFilters/. Each handler is called
 * with the key, whether it is pressed, and whether it is auto-repeating, and
 * returns KeyPolicy.NextPolicy to let the next filter see the key, Accepted to
 * consume it, or NotAccepted to pass it to the app in front. The Netflix and
 * Prime Video buttons, Guide, Input, Live TV and the rest are those filters'
 * cases, so this is where a key is changed, in JavaScript, with nothing
 * injected into any process.
 *
 * The compositor subscribes to the key and, on a change, destroys its loaded
 * filters and builds the chain again from the files, so a change here applies
 * at once, without a restart of anything. configd keeps a set value across
 * reboots, as it does for the preload list.
 *
 * The keys set here are kept in /var/lib/tvweb/remotekeys.json. From them a
 * filter file is written beside it and put first in the chain, so a key it
 * names never reaches LG's handler: pressed, it opens what was chosen, or
 * nothing; its release is consumed too, as some of LG's handlers act on the
 * release. Every other key falls through to LG's filters untouched. With no key
 * set the entry is taken out of the chain and the file deleted, and the TV is
 * as LG has it, which is also what `node remotekeys.js --restore` (tvwebctl
 * restore-keys) does before an uninstall.
 *
 * A key is offered only where this TV's own filter files name it, since LG's
 * key names differ by model and region (a C5 has a Disney+ button, a CX does
 * not). Home, Back, volume, mute, channel and power are not offered: the first
 * two are what the dashboard's own controls depend on, and the rest the
 * microcontroller handles before any filter sees them.
 *
 * Strict ES5: runs on node 0.12.
 */
var fs = require('fs');
var path = require('path');
var msg = require('./say').msg;

var CONFIG_KEY = 'com.webos.surfacemanager.keyFilters';
var LG_FILTERS_DIR = '/usr/lib/qt5/qml/KeyFilters';
var HANDLER = 'handleGlasshouseKeys';
var LIVE_TV = 'com.webos.app.livetv';
var APP_PREFIX = 'com.webos.app.';

/*
 * The keys that can be changed, in the order shown. Each is a symbol the
 * compositor's filters match on; the title is what the remote prints. The
 * Amazon button is Alexa on some remotes, and the Prime Video button on most.
 */
var KEYS = [
  { key: 'netflix', symbol: 'WebOS.Key_webOS_Netflix', title: 'Netflix' },
  { key: 'amazon', symbol: 'WebOS.Key_webOS_Amazon', title: 'Prime Video' },
  { key: 'disneyplus', symbol: 'WebOS.Key_webOS_Disneyplus', title: 'Disney+' },
  { key: 'lgchannels', symbol: 'WebOS.Key_webOS_LGChannels', title: 'LG Channels' },
  { key: 'rakutentv', symbol: 'WebOS.Key_webOS_RakutenTV', title: 'Rakuten TV' },
  { key: 'hulu', symbol: 'WebOS.Key_webOS_Hulu', title: 'Hulu' },
  { key: 'iplayer', symbol: 'WebOS.Key_webOS_IPlayer', title: 'BBC iPlayer' },
  { key: 'freeviewplay', symbol: 'WebOS.Key_webOS_FreeviewPlay', title: 'Freeview Play' },
  { key: 'slingtv', symbol: 'WebOS.Key_webOS_SlingTV', title: 'Sling TV' },
  { key: 'apps', symbol: 'WebOS.Key_webOS_Apps', title: 'Apps' },
  { key: 'guide', symbol: 'WebOS.Key_webOS_TVGuide', title: 'Guide' },
  { key: 'input', symbol: 'WebOS.Key_webOS_InputSource', title: 'Input' },
  { key: 'livetv', symbol: 'WebOS.Key_webOS_InputTV', title: 'TV' },
  { key: 'search', symbol: 'Qt.Key_Search', title: 'Search' },
  { key: 'info', symbol: 'WebOS.Key_webOS_Info', title: 'Info' },
  { key: 'help', symbol: 'Qt.Key_Help', title: 'Help' },
  { key: 'red', symbol: 'WebOS.Key_webOS_Red', title: 'Red' },
  { key: 'green', symbol: 'WebOS.Key_webOS_Green', title: 'Green' },
  { key: 'yellow', symbol: 'WebOS.Key_webOS_Yellow', title: 'Yellow' },
  { key: 'blue', symbol: 'WebOS.Key_webOS_Blue', title: 'Blue' }
];

var lunaFn = null;
var inputNames = null;
var stateDir = '/var/lib/tvweb';
var filtersDir = LG_FILTERS_DIR;
var tvKeys = null;      // the symbols this TV's filters name, read once

function init(opts) {
  opts = opts || {};
  lunaFn = opts.luna || null;
  inputNames = opts.inputNames || {};
  if (opts.stateDir) stateDir = opts.stateDir;
  filtersDir = opts.filtersDir || LG_FILTERS_DIR;
  tvKeys = null;
}

function mapFile() { return path.join(stateDir, 'remotekeys.json'); }
function filterFile() { return path.join(stateDir, 'remotekeys-filter.js'); }

function keyByName(name) {
  for (var i = 0; i < KEYS.length; i++) if (KEYS[i].key === name) return KEYS[i];
  return null;
}

/*
 * The keys this TV's filters name. The compositor's enum may know more, but
 * a key its filters never match on is not one its remotes send.
 */
function keysOnTv() {
  if (tvKeys) return tvKeys;
  var src = '';
  try {
    fs.readdirSync(filtersDir).forEach(function (f) {
      if (/\.js$/.test(f)) src += fs.readFileSync(path.join(filtersDir, f), 'utf8') + '\n';
    });
  } catch (e) {
    return null;
  }
  tvKeys = KEYS.filter(function (k) { return src.indexOf(k.symbol) !== -1; });
  return tvKeys;
}

// What is set, as { key: id } with '' for a key that does nothing.
function readMap() {
  try {
    var j = JSON.parse(fs.readFileSync(mapFile(), 'utf8'));
    if (!j || typeof j.keys !== 'object') return {};
    var out = {};
    Object.keys(j.keys).forEach(function (k) {
      if (keyByName(k) && typeof j.keys[k] === 'string') out[k] = j.keys[k];
    });
    return out;
  } catch (e) {
    return {};
  }
}

function writeMap(map) {
  if (!Object.keys(map).length) {
    try { fs.unlinkSync(mapFile()); } catch (e) {}
    return;
  }
  fs.writeFileSync(mapFile(), JSON.stringify({ keys: map, updated: new Date().toISOString() }, null, 2) + '\n', 'utf8');
}

/*
 * The filter the compositor loads: one case per key set. It is plain ES5, as
 * the compositor's own filters are, and names only what they name
 * (applicationManager, KeyPolicy, and the key enums the shell imports).
 */
function filterSource(map) {
  var lines = [
    '/* Written by Glasshouse from ' + mapFile() + ': the remote keys set on its Apps tab.',
    ' * First in com.webos.surfacemanager.keyFilters; a key here never reaches LG\'s filters. */',
    'function init() {}',
    'function ' + HANDLER + '(key, pressed, autoRepeat) {',
    '    var id = null;',
    '    switch (key) {'
  ];
  Object.keys(map).forEach(function (k) {
    var def = keyByName(k);
    if (!def) return;
    lines.push('    case ' + def.symbol + ': id = ' + JSON.stringify(map[k]) + '; break;');
  });
  lines.push(
    '    default: return KeyPolicy.NextPolicy;',
    '    }',
    '    if (pressed && !autoRepeat && id) {',
    '        console.info("glasshouse keyfilter: key", key, "opens", id);',
    '        applicationManager.launch(id, "{}");',
    '    }',
    '    return KeyPolicy.Accepted;',
    '}',
    ''
  );
  return lines.join('\n');
}

function readChain(cb) {
  lunaFn('com.webos.service.config/getConfigs', { configNames: [CONFIG_KEY] }, function (r) {
    var list = r && r.configs && r.configs[CONFIG_KEY];
    cb(Array.isArray(list) ? list : null);
  });
}

function writeChain(list, cb) {
  var configs = {};
  configs[CONFIG_KEY] = list;
  lunaFn('com.webos.service.config/setConfigs', { configs: configs }, function (r) {
    cb(!!(r && r.returnValue));
  });
}

function ours(entry) {
  return !!entry && entry.file === filterFile();
}

function withoutOurs(list) {
  return list.filter(function (e) { return !ours(e); });
}

/*
 * Puts the chain as the map says: the filter file written and first in the
 * chain when a key is set, gone from both when none is. The chain is written
 * only when it has to change. cb(ok).
 */
function apply(cb) {
  var map = readMap();
  var want = Object.keys(map).length > 0;
  readChain(function (list) {
    if (!list) return cb(false);
    var rest = withoutOurs(list);
    var have = rest.length !== list.length;
    if (want) {
      try {
        fs.writeFileSync(filterFile(), filterSource(map), 'utf8');
      } catch (e) {
        console.log('remotekeys: could not write ' + filterFile() + ': ' + e.message);
        return cb(false);
      }
      // The compositor reloads its filters when the key's value changes, and
      // configd tells it nothing when the same list is written again (a CX
      // kept running the first filter through two rewrites of the file). So
      // with the entry already in the chain it goes out and comes back: two
      // changes, each a reload, with LG's chain alone for the moment between.
      var full = [{ file: filterFile(), handler: HANDLER }].concat(rest);
      var done = function (ok) {
        if (ok) console.log('remotekeys: ' + Object.keys(map).length + ' key(s) set, filter first in the chain');
        cb(ok);
      };
      if (!have) return writeChain(full, done);
      return writeChain(rest, function (ok) {
        if (!ok) return cb(false);
        writeChain(full, done);
      });
    }
    try { fs.unlinkSync(filterFile()); } catch (e) {}
    if (!have) return cb(true);
    writeChain(rest, function (ok) {
      if (ok) console.log('remotekeys: no key set, filter taken out of the chain');
      cb(ok);
    });
  });
}

// The inputs a key can open: each HDMI input the TV names, then Live TV.
function inputChoices() {
  var out = Object.keys(inputNames || {}).filter(function (k) { return /^hdmi[1-4]$/.test(k); }).sort()
    .map(function (k) { return { id: APP_PREFIX + k, title: inputNames[k] || k.toUpperCase(), kind: 'input' }; });
  out.push({ id: LIVE_TV, title: msg('srv.remoteKeys.liveTv', 'Live TV'), kind: 'input' });
  return out;
}

// The apps a key can open: those on the Home screen, by title.
function appChoices(apps) {
  var seen = {};
  return (apps || []).filter(function (a) {
    if (!a || !a.id || seen[a.id] || a.visible === false) return false;
    if (a.id === LIVE_TV || /^com\.webos\.app\.(hdmi|container)/.test(a.id)) return false;
    seen[a.id] = true;
    return true;
  }).map(function (a) { return { id: a.id, title: a.title || a.id, kind: 'app' }; })
    .sort(function (x, y) { return x.title.toLowerCase() < y.title.toLowerCase() ? -1 : 1; });
}

function listApps(cb) {
  lunaFn('com.webos.applicationManager/listApps', {}, function (r) {
    cb((r && Array.isArray(r.apps) && r.apps.length) ? r.apps : null);
  });
}

/*
 * The keys this TV has and what each does. cb({ ok, supported, keys, choices,
 * inChain }). A key's action is 'lg', 'nothing' or 'open' with the id and its
 * title; inChain says whether the compositor has the filter right now.
 */
function getRemoteKeys(cb) {
  if (!lunaFn) return cb({ ok: true, supported: false });
  var keys = keysOnTv();
  if (!keys || !keys.length) return cb({ ok: true, supported: false });
  readChain(function (list) {
    if (!list) return cb({ ok: true, supported: false });
    listApps(function (apps) {
      var map = readMap();
      var titles = {};
      (apps || []).forEach(function (a) { if (a && a.id) titles[a.id] = a.title || a.id; });
      var inputs = inputChoices();
      inputs.forEach(function (c) { titles[c.id] = c.title; });
      var out = keys.map(function (k) {
        var set = Object.prototype.hasOwnProperty.call(map, k.key);
        var id = set ? map[k.key] : null;
        return {
          key: k.key,
          title: k.title,
          action: !set ? 'lg' : (id ? 'open' : 'nothing'),
          id: id || '',
          opens: id ? (titles[id] || id) : ''
        };
      });
      cb({
        ok: true, supported: true, keys: out,
        choices: inputs.concat(appChoices(apps)),
        inChain: list.some(ours)
      });
    });
  });
}

/*
 * Sets a key: action 'lg' puts it back as LG has it, 'nothing' makes it do
 * nothing, 'open' opens id, an input or an app on the Home screen. The chain
 * is rewritten at once. cb({ ok, error }).
 */
function setRemoteKey(key, action, id, cb) {
  if (!lunaFn) return cb({ ok: false, error: 'no luna wrapper' });
  var def = keyByName(String(key || ''));
  var onTv = keysOnTv();
  if (!def || !onTv || onTv.indexOf(def) === -1) {
    return cb({ ok: false, error: msg('srv.remoteKeys.badKey', 'This TV does not have that key') });
  }
  id = String(id || '').trim();
  var map = readMap();
  if (action === 'lg') {
    delete map[def.key];
    return save(map, cb);
  }
  if (action === 'nothing') {
    map[def.key] = '';
    return save(map, cb);
  }
  if (action !== 'open' || !id) return cb({ ok: false, error: 'lg, nothing or open expected' });
  listApps(function (apps) {
    if (!apps) return cb({ ok: false, error: msg('srv.remoteKeys.noApps', 'Could not read the TV\'s apps. Try again in a moment.') });
    var allowed = inputChoices().concat(appChoices(apps)).some(function (c) { return c.id === id; });
    if (!allowed) return cb({ ok: false, error: msg('srv.remoteKeys.unknownApp', 'That app is not on this TV') });
    map[def.key] = id;
    save(map, cb);
  });
}

function save(map, cb) {
  try {
    writeMap(map);
  } catch (e) {
    return cb({ ok: false, error: msg('srv.remoteKeys.saveFailed', 'Could not save the change: {error}', { error: e.message }) });
  }
  apply(function (ok) {
    if (!ok) return cb({ ok: false, error: msg('srv.remoteKeys.chainFailed', 'The TV did not take the change') });
    cb({ ok: true });
  });
}

/*
 * At the server's start: a map with keys set is put into the chain again only
 * where the chain has lost it or the file is gone (a configd reset, a copy of
 * the data folder); a chain that has it is left alone, as a write would reload
 * the compositor's filters for nothing. cb(ok).
 */
function ensure(cb) {
  cb = cb || function () {};
  if (!lunaFn) return cb(false);
  var map = readMap();
  if (!Object.keys(map).length) return cb(true);
  if (!keysOnTv()) return cb(false);
  readChain(function (list) {
    if (!list) return cb(false);
    var inChain = list.some(ours);
    var fileThere = false;
    try { fileThere = fs.statSync(filterFile()).isFile(); } catch (e) {}
    if (inChain && fileThere) return cb(true);
    console.log('remotekeys: ' + (inChain ? 'filter file missing' : 'filter not in the chain') + ' at start, putting it back');
    apply(cb);
  });
}

// Everything as LG has it: the map and the filter deleted, the entry out of the chain.
function restore(cb) {
  if (!lunaFn) return cb(false);
  try { fs.unlinkSync(mapFile()); } catch (e) {}
  apply(cb);
}

module.exports = {
  init: init,
  getRemoteKeys: getRemoteKeys,
  setRemoteKey: setRemoteKey,
  ensure: ensure,
  restore: restore,
  filterSource: filterSource,
  KEYS: KEYS,
  CONFIG_KEY: CONFIG_KEY,
  HANDLER: HANDLER
};

// tvwebctl restore-keys: no server running, so luna is found here.
if (require.main === module && process.argv[2] === '--restore') {
  var lunaLib = require('./luna');
  init({ luna: lunaLib.call || lunaLib, stateDir: path.join(__dirname, '..') });
  restore(function (ok) {
    console.log(ok ? 'remotekeys: keys as LG has them' : 'remotekeys: could not reach configd; the map file is deleted');
    process.exit(ok ? 0 : 1);
  });
}
