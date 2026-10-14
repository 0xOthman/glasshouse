/*
 * A backup of the TV's settings as one JSON file, and restoring one, onto the
 * same TV or another. Strict ES5 for Node 0.12.2 on webOS 4.
 *
 * It holds LG's settings that lgsettings.js understands, and the Glasshouse
 * settings that are the same on any TV. Left out:
 * - LG's game settings, which LG keeps per input and genre: restoring them
 *   would change whichever is current.
 * - What decides who can reach or change this server (port, host, token,
 *   allowControl and the like), so a file cannot open a TV up.
 * - MQTT, whose topic prefix and device id must differ between TVs.
 * - The experimental switches.
 *
 * A restore sets only what this TV has and offers, one setting at a time
 * through lgsettings.set, and says what it skipped and why.
 */

var msg = require('./say').msg;

var FORMAT = 'glasshouse-backup';
var VERSION = 1;
var SECTIONS = ['promotions', 'sound', 'devices', 'hdmi'];

/*
 * The Glasshouse settings a backup carries, each with a check of the value it
 * may take. syslog.hostname is left out: it names one TV.
 */
function isString(v) { return typeof v === 'string' && v.length <= 260; }
function isBool(v) { return typeof v === 'boolean'; }
function isPort(v) { return typeof v === 'number' && v % 1 === 0 && v >= 1 && v <= 65535; }
var GLASSHOUSE = {
  logging: { level: function (v) { return v === 'quiet' || v === 'info' || v === 'debug'; } },
  syslog: {
    server: isString,
    port: isPort,
    sources: function (v) {
      if (!Array.isArray(v)) return false;
      for (var i = 0; i < v.length; i++) if (['system', 'glasshouse', 'kernel'].indexOf(v[i]) === -1) return false;
      return true;
    },
    redact: isBool
  },
  ntp: { server: isString, port: isPort, enabled: isBool },
  history: { enabled: isBool },
  prometheus: { enabled: isBool },
  update: { check: isBool }
};

/** @type {typeof import('./lgsettings')} */
var lgSettings = null;
var config = null;
var writeSettings = null;
var about = function () { return {}; };

// The allowed part of a config, or of a backup's glasshouse section.
function pickGlasshouse(src) {
  var out = {};
  src = src && typeof src === 'object' ? src : {};
  for (var section in GLASSHOUSE) {
    var have = src[section];
    if (!have || typeof have !== 'object') continue;
    for (var key in GLASSHOUSE[section]) {
      if (have[key] === undefined || !GLASSHOUSE[section][key](have[key])) continue;
      out[section] = out[section] || {};
      out[section][key] = have[key];
    }
  }
  return out;
}

// A row's value as the dashboard sets it: true or false for a switch.
function rowSetting(row) {
  return row.type === 'switch' ? row.on : row.value;
}

/**
 * The backup, as an object to save as JSON.
 * @param {function(Object): void} cb
 */
function create(cb) {
  lgSettings.collect(SECTIONS, function (res) {
    var lg = {};
    ((res && res.rows) || []).forEach(function (r) { lg[r.id] = rowSetting(r); });
    var from = about() || {};
    cb({
      format: FORMAT,
      version: VERSION,
      created: new Date().toISOString(),
      from: { model: from.model || null, glasshouse: from.version || null },
      lg: lg,
      glasshouse: pickGlasshouse(config)
    });
  });
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function offers(row, value) {
  if (row.type === 'switch') return isBool(value);
  if (row.type === 'number') return typeof value === 'number' && value >= row.min && value <= row.max;
  for (var i = 0; i < (row.choices || []).length; i++) if (row.choices[i].value === value) return true;
  return false;
}

/**
 * Restores a backup onto this TV. cb gets { ok, lg: { applied, unchanged,
 * skipped, failed }, glasshouse: [keys changed], restart }, or { ok: false,
 * error } for something that is not a backup. restart: Glasshouse's own
 * settings changed, which take effect when it restarts.
 * @param {any} backup
 * @param {function(Object): void} cb
 */
function restore(backup, cb) {
  if (!backup || backup.format !== FORMAT || typeof backup.version !== 'number') {
    return cb({ ok: false, error: msg('srv.backup.notBackup', 'That file is not a Glasshouse backup') });
  }
  if (backup.version > VERSION) {
    return cb({ ok: false, error: msg('srv.backup.newer', 'That backup is from a newer Glasshouse: update this TV first') });
  }
  var wanted = backup.lg && typeof backup.lg === 'object' ? backup.lg : {};
  var result = { applied: [], unchanged: 0, skipped: [], failed: [] };
  lgSettings.collect(SECTIONS, function (res) {
    var rows = {};
    ((res && res.rows) || []).forEach(function (r) { rows[r.id] = r; });
    var ids = Object.keys(wanted);
    var i = 0;
    (function next() {
      if (i >= ids.length) return restoreGlasshouse(backup.glasshouse, result, cb);
      var id = ids[i++];
      var row = rows[id];
      var value = wanted[id];
      if (!row) { result.skipped.push({ id: id, reason: 'absent' }); return next(); }
      if (same(rowSetting(row), value)) { result.unchanged++; return next(); }
      if (!offers(row, value)) { result.skipped.push({ id: id, reason: 'value' }); return next(); }
      if (row.active === false) { result.skipped.push({ id: id, reason: 'inactive' }); return next(); }
      lgSettings.set(id, value, function (r) {
        if (r && r.ok) result.applied.push(id);
        else result.failed.push({ id: id, error: (r && r.error) || 'refused' });
        next();
      });
    })();
  });
}

function restoreGlasshouse(src, lgResult, cb) {
  var wanted = pickGlasshouse(src);
  var current = pickGlasshouse(config);
  var patch = {}, changed = [];
  for (var section in wanted) {
    for (var key in wanted[section]) {
      var now = current[section] ? current[section][key] : undefined;
      if (same(now, wanted[section][key])) continue;
      patch[section] = patch[section] || {};
      patch[section][key] = wanted[section][key];
      changed.push(section + '.' + key);
    }
  }
  function done(err) {
    cb({
      ok: !err,
      error: err ? msg('srv.backup.saveFailed', 'Could not save Glasshouse’s own settings: {error}', { error: err.message }) : undefined,
      lg: lgResult,
      glasshouse: err ? [] : changed,
      restart: !err && changed.length > 0
    });
  }
  if (!changed.length || !writeSettings) return done(null);
  writeSettings(patch, done);
}

/**
 * @param {Object} opts
 * @param {typeof import('./lgsettings')} opts.lgSettings
 * @param {any} opts.config the server's config, read for the Glasshouse part
 * @param {function(Object, function(?Error): void): void} opts.writeSettings
 *   saves a patch to config.json
 * @param {function(): {model: ?string, version: ?string}} [opts.about] the TV
 *   and Glasshouse version, for the backup's from
 */
function init(opts) {
  lgSettings = opts.lgSettings;
  config = opts.config;
  writeSettings = opts.writeSettings || null;
  if (opts.about) about = opts.about;
}

module.exports = {
  FORMAT: FORMAT,
  SECTIONS: SECTIONS,
  init: init,
  create: create,
  restore: restore,
  pickGlasshouse: pickGlasshouse
};
