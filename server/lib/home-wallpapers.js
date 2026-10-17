/* Optional Home wallpapers. No download happens until requested by an owner.
 * Kept outside assets so updates do not carry them into the rollback copy.
 * Strict ES5 for the TV's Node 0.10/0.12. */
var fs = require('fs');
var path = require('path');
var execFile = require('child_process').execFile;
var util = require('./util');
var installer = require('./installer');
var fetch = require('./fetch');
var msg = require('./say').msg;

// Immutable source and independently checked bytes; never accept a URL from a request.
var SOURCE = 'https://raw.githubusercontent.com/Nutcasey/glasshouse/45816061619243e1be44a7dceda671aa753749b8/server/assets/home/wallpapers/';
var FILES = {
  morning: { size: 4610197, sha256: '76a605da632aad4f3d06437ffe9ecf7266b8d23c7225470dc59bcc1c4492dade' },
  afternoon: { size: 6352521, sha256: '3a94e01ac9298c57fd0065531630fc5fb2fc361a377582c6fa077334dbbb7119' },
  evening: { size: 4546106, sha256: '52d3e14d674eb66bfeec2b4c1ba3d2c3c93c630014c87e66d073bf8da476904f' },
  night: { size: 3587026, sha256: '9436aa3f385c16c5f69ef543356ff841aaf095c4001b3ccff205d4680d498740' }
};
var dir = '/var/lib/tvweb/home-wallpapers';
var uploadsDir = '/var/lib/tvweb/home-wallpaper-uploads';
var downloading = false, uploading = false, error = null;
var MAX_UPLOAD = 5 * 1024 * 1024;
var total = Object.keys(FILES).reduce(function (n, key) { return n + FILES[key].size; }, 0);

function init(stateDir) {
  dir = path.join(stateDir, 'home-wallpapers');
  uploadsDir = path.join(stateDir, 'home-wallpaper-uploads');
}

function available() {
  return Object.keys(FILES).every(function (key) {
    try { return fs.statSync(path.join(dir, key + '.png')).size === FILES[key].size; }
    catch (e) { return false; }
  });
}

function status() {
  var slots = {}, custom = {}, revision = [];
  Object.keys(FILES).forEach(function (key) {
    var file = image(key), st = null;
    try { if (file) st = fs.statSync(file); } catch (e) {}
    slots[key] = !!st;
    custom[key] = !!(st && path.dirname(file) === uploadsDir);
    revision.push(st ? String(Number(st.mtime)) + '-' + st.size : '0');
  });
  return { available: Object.keys(slots).some(function (key) { return slots[key]; }),
    downloaded: available(), downloading: downloading, uploading: uploading,
    slots: slots, custom: custom, revision: revision.join('.'), error: error, bytes: total };
}

function image(key) {
  if (!Object.prototype.hasOwnProperty.call(FILES, key)) return null;
  var custom = path.join(uploadsDir, key + '.jpg');
  try { if (fs.statSync(custom).isFile()) return custom; } catch (e) {}
  return available() ? path.join(dir, key + '.png') : null;
}

function clear(folder) {
  Object.keys(FILES).forEach(function (key) { util.unlinkQuiet(path.join(folder, key + '.png')); });
  try { fs.rmdirSync(folder); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

// A background job: both dashboards can poll, even on a slow connection.
function download(cb) {
  if (downloading || available()) return cb({ ok: true, wallpapers: status() });
  downloading = true;
  error = null;
  cb({ ok: true, wallpapers: status() });
  var staging = dir + '.part';
  function fail(e) {
    try { clear(staging); } catch (cleanupError) { console.error('home wallpapers: ' + cleanupError.message); }
    downloading = false;
    error = e.message;
    console.error('home wallpapers: ' + error);
  }
  try { clear(staging); fs.mkdirSync(staging); } catch (e) { return fail(e); }
  execFile('df', ['-k', staging], { timeout: 5000 }, function (err, out) {
    var free = err ? null : installer.parseDf(out);
    if (free === null || free < total + 5 * 1024 * 1024) {
      return fail(new Error(msg('srv.home.wallSpace', 'The wallpapers need 24 MB of free space. Free space could not be confirmed.')));
    }
    var keys = Object.keys(FILES), index = 0;
    function next() {
      if (index === keys.length) {
        try { clear(dir); fs.renameSync(staging, dir); } catch (e) { return fail(e); }
        downloading = false;
        return;
      }
      var key = keys[index++], file = path.join(staging, key + '.png');
      fetch.download(SOURCE + key + '.png', file, { expectedSize: FILES[key].size }, function (fetchError) {
        if (fetchError) return fail(fetchError);
        var size = 0;
        try { size = fs.statSync(file).size; } catch (e) { return fail(e); }
        if (size !== FILES[key].size) return fail(new Error(msg('srv.home.wallIncomplete', 'The wallpaper download is incomplete. Try again.')));
        installer.hashFile(file, function (hashError, hash) {
          if (hashError) return fail(hashError);
          if (hash !== FILES[key].sha256) return fail(new Error(msg('srv.home.wallHash', 'The wallpaper does not match its published checksum. Try again.')));
          next();
        });
      });
    }
    next();
  });
}

function remove(cb) {
  if (downloading) return cb({ ok: false, error: msg('srv.home.wallBusy', 'Wait for the wallpaper download to finish.') });
  try { clear(dir); clear(dir + '.part'); } catch (e) { return cb({ ok: false, error: e.message }); }
  error = null;
  cb({ ok: true, wallpapers: status() });
}

function removeUploads(cb) {
  if (uploading) return cb({ ok: false, error: msg('srv.home.wallUploading', 'Wait for the wallpaper upload to finish.') });
  try {
    Object.keys(FILES).forEach(function (key) {
      [key + '.jpg', key + '.jpg.part'].forEach(function (name) {
        try { fs.unlinkSync(path.join(uploadsDir, name)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      });
    });
  } catch (e) { return cb({ ok: false, error: e.message }); }
  cb({ ok: true, wallpapers: status() });
}

// The browser re-encodes uploads as JPEG. Check the format and frame bounds
// again here; no filename or image metadata becomes a filesystem path.
function validJpeg(buf) {
  if (buf.length < 12 || buf.readUInt16BE(0) !== 65496 || buf.readUInt16BE(buf.length - 2) !== 65497) return false;
  var at = 2, components = 0, scanned = false, quantised = false, huffman = false;
  while (at + 2 <= buf.length) {
    if (buf[at++] !== 255) return false;
    while (buf[at] === 255) at++;
    var marker = buf[at++];
    if (marker === 217) return at === buf.length && !!components && scanned && quantised && huffman;
    if (at + 2 > buf.length) return false;
    var len = buf.readUInt16BE(at);
    if (len < 2 || at + len > buf.length) return false;
    if (marker === 192 || marker === 194) {
      if (len < 8) return false;
      var height = buf.readUInt16BE(at + 3), width = buf.readUInt16BE(at + 5);
      var count = buf[at + 7];
      if (components || buf[at + 2] !== 8 || (count !== 1 && count !== 3) || len !== 8 + 3 * count ||
          !width || !height || width > 3840 || height > 2160) return false;
      components = count;
    }
    if (marker === 219) { if (len < 67) return false; quantised = true; }
    if (marker === 196) { if (len < 20) return false; huffman = true; }
    if (marker === 218) {
      var scanComponents = buf[at + 2];
      if (!components || !quantised || !huffman || !scanComponents || scanComponents > components || len !== 6 + 2 * scanComponents) return false;
      at += len;
      var start = at;
      // Entropy data may contain escaped FF bytes and restart markers.
      // A scan must reach another marker, not merely end in a claimed EOI.
      while (at < buf.length) {
        if (buf[at] !== 255) { at++; continue; }
        var next = buf[at + 1];
        if (next === 0 || (next >= 208 && next <= 215)) { at += 2; continue; }
        break;
      }
      if (at === start) return false;
      scanned = true;
      continue;
    }
    at += len;
  }
  return false;
}

function upload(key, req, cb) {
  function refused(text, code) { cb({ ok: false, error: text, status: code || 400 }); }
  if (!Object.prototype.hasOwnProperty.call(FILES, key)) return refused('unknown wallpaper slot');
  if (uploading) return refused(msg('srv.home.wallUploading', 'Wait for the wallpaper upload to finish.'), 409);
  var length = String(req.headers['content-length'] || '');
  if (req.headers['transfer-encoding'] || !/^\d{1,8}$/.test(length) || +length < 1 || +length > MAX_UPLOAD) {
    return refused(msg('srv.home.wallUploadSize', 'The uploaded JPEG must be at most 5 MB and state its size.'), 413);
  }
  uploading = true;
  var chunks = [], got = 0, ended = false, finished = false;
  var file = path.join(uploadsDir, key + '.jpg'), staging = file + '.part';
  var timer = setTimeout(function () { finish(msg('srv.home.wallUploadTimeout', 'The wallpaper upload timed out.'), 408); }, 30000);
  function finish(text, code, abandoned) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    chunks = [];
    uploading = false;
    if (abandoned) return;
    if (text) return refused(text, code);
    cb({ ok: true, wallpapers: status() });
  }
  req.on('aborted', function () { if (!ended) finish(null, null, true); });
  req.on('error', function () { if (!ended) finish(null, null, true); });
  req.on('close', function () { if (!ended) finish(null, null, true); });
  req.on('data', function (chunk) {
    if (finished) return;
    got += chunk.length;
    if (got > +length) return finish(msg('srv.home.wallUploadSize', 'The uploaded JPEG must be at most 5 MB and state its size.'), 413);
    chunks.push(chunk);
  });
  req.on('end', function () {
    if (finished) return;
    ended = true;
    clearTimeout(timer);
    var buf = Buffer.concat(chunks);
    chunks = [];
    if (got !== +length || !validJpeg(buf)) {
      return finish(msg('srv.home.wallUploadImage', 'Choose a valid JPEG up to 3840 × 2160 pixels.'));
    }
    try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir); }
    catch (e) { return finish(e.message, 500); }
    execFile('df', ['-k', uploadsDir], { timeout: 5000 }, function (err, out) {
      var free = err ? null : installer.parseDf(out);
      if (free === null || free < buf.length + 5 * 1024 * 1024) {
        return finish(msg('srv.home.wallUploadSpace', 'Not enough confirmed free space for the wallpaper.'), 507);
      }
      fs.writeFile(staging, buf, { mode: parseInt('600', 8) }, function (writeError) {
        if (writeError) { util.unlinkQuiet(staging); return finish(writeError.message, 500); }
        fs.rename(staging, file, function (renameError) {
          if (renameError) util.unlinkQuiet(staging);
          finish(renameError && renameError.message, renameError ? 500 : null);
        });
      });
    });
  });
}

module.exports = { init: init, status: status, image: image, download: download, remove: remove,
  upload: upload, removeUploads: removeUploads };
