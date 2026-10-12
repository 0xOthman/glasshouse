/*
 * lib/quickaccess.js - the remote's Quick Access keys: holding 1 to 9 opens
 * the app or input set for that key
 *
 * LG calls it Magic Number. Each key is a setting in the option category,
 * magicNum1 to magicNum9, holding { id, params }; LG's own Quick Access screen
 * (com.webos.app.magicnum) writes one with setSystemSettings and clears one
 * with resetSystemSettings, which puts back LG's default for that key. That is
 * empty, or an app LG ships there with override: true (self-diagnosis on 9 on
 * a C2). A live TV channel is com.webos.app.livetv with params.channelNumber.
 * A B8 (webOS 4.4) and a C2 (webOS 9.2) both have the keys. 0 is not one: it
 * opens the list.
 *
 * Strict ES5: runs on node 0.12.
 */
var msg = require('./say').msg;

var SERVICE = 'com.webos.settingsservice';
var KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
var LIVE_TV = 'com.webos.app.livetv';
var APP_PREFIX = 'com.webos.app.';

var lunaFn = null;
var inputNames = null;

function init(opts) {
  opts = opts || {};
  lunaFn = opts.luna || null;
  // telemetry's inputNameMap: hdmi1 to "Apple TV", as the TV's settings name them.
  inputNames = opts.inputNames || {};
}

function settingKey(n) {
  return 'magicNum' + n;
}

function validKey(n) {
  n = parseInt(n, 10);
  return KEYS.indexOf(n) !== -1 ? n : null;
}

// The inputs a key can open: each HDMI input the TV names, then Live TV.
function inputChoices() {
  var out = Object.keys(inputNames || {}).filter(function (k) { return /^hdmi[1-4]$/.test(k); }).sort()
    .map(function (k) { return { id: APP_PREFIX + k, title: inputNames[k] || k.toUpperCase(), kind: 'input' }; });
  out.push({ id: LIVE_TV, title: msg('srv.quickAccess.liveTv', 'Live TV'), kind: 'input' });
  return out;
}

/*
 * The apps a key can open: those on the Home screen, by title. Hidden ones
 * (the HDMI apps, LG's services) are left out, as LG's own screen does.
 */
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

function readKeys(cb) {
  lunaFn(SERVICE + '/getSystemSettings', { category: 'option', keys: KEYS.map(settingKey) }, function (r) {
    var s = r && r.returnValue !== false && r.settings;
    cb(s && s.hasOwnProperty(settingKey(1)) ? s : null);
  });
}

function listApps(cb) {
  lunaFn('com.webos.applicationManager/listApps', {}, function (r) {
    cb((r && Array.isArray(r.apps)) ? r.apps : []);
  });
}

/*
 * The nine keys and what each can be set to. cb({ ok, supported, keys,
 * choices }). A key's title is the app's or input's, with a live TV channel's
 * number; lgDefault marks an app LG put there.
 */
function getQuickAccess(cb) {
  if (!lunaFn) return cb({ ok: true, supported: false });
  readKeys(function (settings) {
    if (!settings) return cb({ ok: true, supported: false });
    listApps(function (apps) {
      var titles = {};
      apps.forEach(function (a) { if (a && a.id) titles[a.id] = a.title || a.id; });
      var inputs = inputChoices();
      inputs.forEach(function (c) { titles[c.id] = c.title; });
      var keys = KEYS.map(function (n) {
        var v = settings[settingKey(n)] || {};
        var id = typeof v.id === 'string' ? v.id : '';
        var params = v.params && typeof v.params === 'object' ? v.params : {};
        // LG presets keys for its region's apps whether or not they are
        // installed (BBC iPlayer and others on a UK C2 without them).
        var title = !id ? '' : titles[id] ||
          msg('srv.quickAccess.notInstalled', '{id} (not installed)', { id: id });
        if (id === LIVE_TV && params.channelNumber) {
          title = msg('srv.quickAccess.channel', 'Live TV, channel {channel}', { channel: params.channelNumber });
        }
        return { key: n, id: id, title: title, lgDefault: v.override === true, installed: !id || !!titles[id] };
      });
      cb({ ok: true, supported: true, keys: keys, choices: inputs.concat(appChoices(apps)) });
    });
  });
}

/*
 * Sets key n to open id, or with no id puts back LG's default for it, as
 * clearing a key on the TV does. id has to be an input or an app on the Home
 * screen. cb({ ok, error }).
 */
function setQuickAccess(n, id, cb) {
  if (!lunaFn) return cb({ ok: false, error: 'no luna wrapper' });
  n = validKey(n);
  if (n === null) return cb({ ok: false, error: msg('srv.quickAccess.badKey', 'Quick Access keys are 1 to 9') });
  id = String(id || '').trim();
  if (!id) {
    return lunaFn(SERVICE + '/resetSystemSettings', { category: 'option', keys: [settingKey(n)] }, function (r) {
      cb(r && r.returnValue ? { ok: true } : { ok: false, error: msg('srv.quickAccess.saveFailed', 'The TV did not save the change') });
    });
  }
  listApps(function (apps) {
    var allowed = inputChoices().concat(appChoices(apps)).some(function (c) { return c.id === id; });
    if (!allowed) return cb({ ok: false, error: msg('srv.quickAccess.unknownApp', 'That app is not on this TV') });
    var settings = {};
    settings[settingKey(n)] = { id: id, params: {} };
    lunaFn(SERVICE + '/setSystemSettings', { category: 'option', settings: settings }, function (r) {
      if (!r || !r.returnValue) return cb({ ok: false, error: msg('srv.quickAccess.saveFailed', 'The TV did not save the change') });
      console.log('quickaccess: key ' + n + ' opens ' + id);
      cb({ ok: true });
    });
  });
}

module.exports = {
  init: init,
  getQuickAccess: getQuickAccess,
  setQuickAccess: setQuickAccess,
  KEYS: KEYS
};
