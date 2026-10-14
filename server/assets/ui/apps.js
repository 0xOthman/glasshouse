// The Apps tab: installed apps, tiles, background services and saved web pages.

let appsData = null;
/*
 * Tiles with a hide or unhide on its way, by id: true to hide. Kept across
 * redraws, and the list is read from the server again only once none are left,
 * so a quick run of clicks never shows a count part of the way through.
 */
const tilePending = {};
let appsLoading = false;

async function loadApps() {
  if (appsLoading) return;
  appsLoading = true;
  try {
    const r = await fetch(api('/api/apps'), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d && d.ok) {
      appsData = d;
      renderAppsPanel();
    }
  } catch (e) {
    console.error('loadApps failed:', e);
  } finally {
    appsLoading = false;
  }
}

// The address without its scheme, as a reminder of which page a tile opens.
function pageHost(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return url || ''; }
}

function renderSavedPages(d) {
  const pages = d.savedPages || [];
  q('apps-pages-summary').textContent = !pages.length ? t('apps.pages.none', 'None yet')
    : pages.length === 1 ? t('apps.pages.one', '1 page') : t('apps.pages.count', '{n} pages', { n: pages.length });
  q('page-add').hidden = !d.writable;
  q('apps-pages-list').innerHTML = pages.map(p => {
    const id = esc(p.launchPointId);
    const where = pageHost(p.address);
    return `<div class="prot-row" id="page-${id}">
      <div class="prot-main">
        <div class="prot-title">${esc(p.title)}</div>
        <div class="prot-desc">${esc(where || t('apps.pages.saved', 'Saved page'))}${p.renamed ? ' &middot; ' + esc(t('apps.pages.renamed', 'renamed')) : ''}</div>
      </div>
      <div class="prot-status page-acts">
        <button type="button" class="pill idle" onclick="editPage('${id}')" ${d.writable ? '' : 'disabled'}>${esc(t('apps.pages.edit', 'Edit'))}</button>
        <button type="button" class="pill bad" onclick="removePage('${id}')" ${d.writable ? '' : 'disabled'}>${esc(t('apps.pages.remove', 'Remove'))}</button>
      </div>
    </div>`;
  }).join('');
}

function editPage(lpId) {
  const p = ((appsData && appsData.savedPages) || []).find(x => x.launchPointId === lpId);
  const row = q('page-' + lpId);
  if (!p || !row) return;
  const id = esc(lpId);
  const cancel = `onkeydown="if(event.key==='Escape')renderSavedPages(appsData)"`;
  row.innerHTML = `<div class="prot-main">
      <form class="toast-form page-edit" onsubmit="event.preventDefault();savePage('${id}')">
        <input type="text" id="page-url-${id}" maxlength="2048" autocomplete="off" spellcheck="false"
          placeholder="${esc(t('apps.pages.url', 'Web address'))}" value="${esc(p.address)}" aria-label="${esc(t('apps.pages.url', 'Web address'))}" ${cancel}>
        <input type="text" id="page-name-${id}" maxlength="60" autocomplete="off" spellcheck="false"
          placeholder="${esc(p.renamed ? t('apps.pages.resetName', 'Empty puts back its own title') : t('apps.pages.name', 'Name'))}" value="${esc(p.title)}"
          aria-label="${esc(t('apps.pages.name', 'Name'))}" ${cancel}>
        <button type="submit">${esc(t('apps.pages.save', 'Save'))}</button>
        <button type="button" onclick="renderSavedPages(appsData)">${esc(t('common.cancel', 'Cancel'))}</button>
      </form>
      <div class="sub page-add-msg" id="page-msg-${id}" role="alert"></div>
    </div>`;
  const inp = q('page-name-' + lpId);
  inp.focus();
  inp.select();
}

async function addPage() {
  const url = q('page-add-url'), name = q('page-add-name'), btn = q('page-add-btn'), msg = q('page-add-msg');
  msg.textContent = '';
  if (!url.value.trim()) return url.focus();
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    const r = await fetch(api('/api/apps/add-page'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: url.value, title: name.value })
    });
    const j = await r.json().catch(() => ({}));
    // Beside the field it is about, and in a sentence's case: the server's
    // messages are written to follow "Could not add it:" elsewhere.
    if (!r.ok || !j.ok) {
      const e = j.error || t('apps.pages.addFailed', 'Could not add it');
      msg.textContent = e.charAt(0).toUpperCase() + e.slice(1) + '.';
      url.focus();
    } else { url.value = ''; name.value = ''; }
  } catch (e) { msg.textContent = e.message; }
  finally {
    if (btn) { btn.disabled = false; btn.classList.remove('busy'); }
  }
  loadApps();
}

async function removePage(lpId) {
  const p = ((appsData && appsData.savedPages) || []).find(x => x.launchPointId === lpId);
  if (!p || !confirm(t('apps.pages.remove.confirm', 'Remove "{name}" from the home screen?', { name: p.title }))) return;
  try {
    const r = await fetch(api('/api/apps/remove-page'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchPointId: lpId })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) showErr(j.error || t('apps.pages.removeFailed', 'Could not remove it'));
  } catch (e) { showErr(e.message); }
  loadApps();
}

async function savePage(lpId) {
  const name = q('page-name-' + lpId), url = q('page-url-' + lpId), msg = q('page-msg-' + lpId);
  if (!name || !url) return;
  msg.textContent = '';
  try {
    const r = await fetch(api('/api/apps/edit-page'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchPointId: lpId, title: name.value, address: url.value })
    });
    const j = await r.json().catch(() => ({}));
    // A refused edit stays open with the reason, so nothing typed is lost.
    if (!r.ok || !j.ok) {
      const e = j.error || t('apps.pages.saveFailed', 'Could not save it');
      msg.textContent = e.charAt(0).toUpperCase() + e.slice(1) + '.';
      return;
    }
  } catch (e) { msg.textContent = e.message; return; }
  loadApps();
}

/* Not renderApps: that one draws the launcher grid in the control tab, and a
   second declaration of the same name in this scope silently replaces it. */
function renderAppsPanel() {
  if (!appsData) return;
  const d = appsData;

  // Render Installed Apps
  const instList = q('apps-installed-list');
  const instSummary = q('apps-installed-summary');
  const installed = d.installed || [];

  const appCount = n => n === 1 ? t('apps.count.one', '1 app') : t('apps.count', '{n} apps', { n });
  if (instSummary) instSummary.textContent = appCount(installed.length);

  if (instList) {
    if (installed.length === 0) {
      instList.innerHTML = `<div class="sub" style="padding:16px 0">${esc(t('apps.installed.none', 'No removable apps found on the TV.'))}</div>`;
    } else {
      instList.innerHTML = installed.map(app => {
        const title = esc(app.title || app.id);
        const id = esc(app.id);
        const iconUrl = api('/api/apps/icon?id=' + encodeURIComponent(app.id));
        const meta = [app.version ? 'v' + app.version : '', app.vendor || ''].filter(Boolean).join(' · ');
        const sizeBadge = (app.size && typeof fmtSize === 'function') ? fmtSize(app.size) : '';
        return `<div class="prot-row">
          <img src="${iconUrl}" width="38" height="38" style="border-radius:8px;object-fit:contain;background:var(--w06);flex-shrink:0" onerror="this.style.display='none'">
          <div class="prot-main">
            <div class="prot-title">${title}</div>
            <div class="prot-desc">${esc(meta || t('apps.installed.app', 'Installed app'))}</div>
            ${rowError[app.id] ? `<div class="prot-desc row-err">${esc(rowError[app.id])}</div>` : ''}
          </div>
          <div class="prot-status">
            ${sizeBadge ? `<span class="app-badge" title="${esc(t('apps.installed.storageTooltip', 'Storage footprint'))}">${esc(sizeBadge)}</span>` : ''}
            <button type="button" class="pill good" onclick="sendCommand('launchApp','${jsq(app.id)}')" ${!d.writable || uninstalling[app.id] ? 'disabled' : ''}>${esc(t('apps.launch.button', 'Launch'))}</button>
            <button type="button" class="pill ${uninstalling[app.id] ? 'busy' : 'bad'}" onclick="confirmUninstall('${jsq(app.id)}', '${jsq(app.title || app.id)}')" ${!d.writable || uninstalling[app.id] ? 'disabled' : ''}>${esc(uninstalling[app.id] ? t('apps.uninstall.working', 'Uninstalling\u2026') : t('apps.uninstall.button', 'Uninstall'))}</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  renderSavedPages(d);

  // Render System Tiles
  const tileHidingEnabled = !!d.tileHidingEnabled;
  const tilesDisc = q('disc-system-tiles');
  const tilesList = q('apps-tiles-list');
  const hiddenCount = q('apps-hidden-count');
  const tilesSummary = q('apps-tiles-summary');
  const warningBox = q('tile-hiding-warning');
  const btnOff = q('tile-hiding-off');
  const btnOn = q('tile-hiding-on');
  const tiles = d.systemTiles || [];
  // A tile with a hide or unhide on its way counts as it will be.
  const willHide = tile => tilePending.hasOwnProperty(tile.id) ? tilePending[tile.id] : !!tile.hidden;
  const numHidden = tiles.filter(willHide).length;

  if (tilesDisc) {
    tilesDisc.hidden = d.tileHidingAvailable === false;
  }

  if (btnOff && btnOn) {
    btnOff.classList.toggle('on', !tileHidingEnabled);
    btnOn.classList.toggle('on', tileHidingEnabled);
    btnOff.disabled = !d.writable;
    btnOn.disabled = !d.writable || (!!d.tileHidingHeld && !tileHidingEnabled);
  }
  if (warningBox) {
    warningBox.hidden = !tileHidingEnabled || !!d.tileHidingHeld;
  }
  q('tile-hiding-held').hidden = !d.tileHidingHeld;
  q('tile-hiding-overridden').hidden = !d.tileHidingOverridden;

  if (hiddenCount) {
    if (!tileHidingEnabled) {
      hiddenCount.style.display = 'none';
    } else {
      hiddenCount.style.display = '';
      hiddenCount.textContent = numHidden > 0
        ? t('apps.tiles.hiddenOf', '{hidden} hidden of {n} apps', { hidden: numHidden, n: tiles.length })
        : t('apps.tiles.allVisible', 'All {n} apps visible', { n: tiles.length });
    }
  }

  if (tilesSummary) {
    if (!tileHidingEnabled) {
      tilesSummary.textContent = t('common.off', 'Off');
    } else {
      tilesSummary.textContent = numHidden > 0 ? t('apps.tiles.hidden', '{n} hidden', { n: numHidden }) : appCount(tiles.length);
    }
  }

  if (tilesList) {
    if (!tileHidingEnabled) {
      tilesList.innerHTML = `<div class="sub" style="padding:16px 0">${esc(t('apps.tiles.stock', 'All built-in apps are visible (stock behavior). Select On (Custom) above to hide apps from the home launcher.'))}</div>`;
    } else if (tiles.length === 0) {
      tilesList.innerHTML = `<div class="sub" style="padding:16px 0">${esc(t('apps.tiles.none', 'No eligible system apps found.'))}</div>`;
    } else {
      tilesList.innerHTML = tiles.map(tile => {
        const title = esc(tile.title || tile.id);
        const id = esc(tile.id);
        const iconUrl = api('/api/apps/icon?id=' + encodeURIComponent(tile.id));
        const pending = tilePending.hasOwnProperty(tile.id);
        const isHidden = willHide(tile);
        return `<div class="prot-row">
          <img src="${iconUrl}" width="38" height="38" style="border-radius:8px;object-fit:contain;background:var(--w06);flex-shrink:0" onerror="this.style.display='none'">
          <div class="prot-main">
            <div class="prot-title">${title}</div>
            <div class="prot-desc">${esc(isHidden ? t('apps.tile.hidden.desc', 'Hidden from home launcher ribbon') : t('apps.tile.visible.desc', 'Visible on home launcher ribbon'))}</div>
          </div>
          <div class="prot-status">
            ${renderToggle({
              id: 'btn-tile-' + id,
              cls: isHidden ? 'warn' : 'good',
              label: pending ? (isHidden ? t('apps.tile.hiding', 'Hiding\u2026') : t('apps.tile.restoring', 'Restoring\u2026'))
                : isHidden ? t('apps.tile.hidden', 'Hidden') : t('apps.tile.visible', 'Visible'),
              disabled: !d.writable || pending,
              onclick: "toggleTileVisibility('" + id + "', " + (!isHidden) + ")"
            })}
          </div>
        </div>`;
      }).join('');
    }
  }

  renderPreload(d);
  renderQuickAccess(d);
  renderHomeScreen(d);

  // Render Background Services
  const svcsList = q('apps-services-list');
  const svcsDisc = q('disc-system-services');
  const svcsSummary = q('apps-services-summary');
  const svcs = d.services || [];

  if (svcsDisc) {
    if (!svcs.length) {
      svcsDisc.hidden = true;
    } else {
      svcsDisc.hidden = false;
      const numDisabled = svcs.filter(s => s.disabled).length;
      if (svcsSummary) {
        svcsSummary.textContent = numDisabled > 0
          ? t('apps.services.disabledOf', '{disabled} disabled of {n}', { disabled: numDisabled, n: svcs.length })
          : svcs.length === 1 ? t('apps.services.one', '1 service') : t('apps.services.count', '{n} services', { n: svcs.length });
      }
      if (svcsList) {
        svcsList.innerHTML = svcs.map(svc => {
          const id = esc(svc.id);
          const title = esc(svc.title);
          const badge = esc(svc.badge || '');
          const desc = esc(svc.desc || '');
          const unit = esc(svc.unit || '');
          const isDisabled = !!svc.disabled;
          const stillRunning = isDisabled && svc.running;
          return `<div class="prot-row">
            <div class="prot-main">
              <div class="prot-title">${title} <span class="prot-sub">&middot; ${unit}</span></div>
              <div class="prot-desc">${desc}</div>
            </div>
            <div class="prot-status">
              ${badge ? `<span class="app-badge">${badge}</span>` : ''}
              ${renderToggle({
                id: 'btn-svc-' + id,
                cls: isDisabled ? 'warn' : 'good',
                label: stillRunning ? t('apps.service.stillRunning', 'Disabled, still running') : isDisabled ? t('apps.service.disabled', 'Disabled') : t('apps.service.active', 'Active'),
                disabled: !d.writable,
                onclick: "toggleService('" + id + "', " + (!isDisabled) + ")",
                attrs: stillRunning ? `title="${esc(t('apps.service.restarted', 'Switched off, but something on the TV has started it again.'))}"` : ''
              })}
            </div>
          </div>`;
        }).join('');
      }
    }
  }
}

// The remote's Quick Access keys: holding 1 to 9 opens what is set here.
function renderQuickAccess(d) {
  const disc = q('disc-quickaccess');
  const list = q('apps-qa-list');
  const qa = d.quickAccess;
  if (!disc) return;
  disc.hidden = !qa;
  if (!qa) return;
  const set = qa.keys.filter(k => k.id).length;
  if (q('apps-qa-summary')) q('apps-qa-summary').textContent = t('apps.quickAccess.count', '{n} of 9 set', { n: set });
  if (!list || list.contains(document.activeElement)) return;
  const inputs = qa.choices.filter(c => c.kind === 'input');
  const apps = qa.choices.filter(c => c.kind === 'app');
  const opt = (c, cur) => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>${esc(c.title)}</option>`;
  list.innerHTML = qa.keys.map(k => {
    const known = !k.id || qa.choices.some(c => c.id === k.id);
    // A key set to something not offered here (a channel, a hidden LG app)
    // keeps it on the list, so the select shows what the key does now.
    const current = known ? '' : `<option value="${esc(k.id)}" selected>${esc(k.title)}</option>`;
    const icon = k.id ? `<img src="${api('/api/apps/icon?id=' + encodeURIComponent(k.id))}" width="38" height="38"
      style="border-radius:8px;object-fit:contain;background:var(--w06);flex-shrink:0" onerror="this.style.visibility='hidden'">`
      : `<div style="width:38px;height:38px;flex-shrink:0"></div>`;
    return `<div class="prot-row qa-row">
      ${icon}
      <div class="prot-main">
        <div class="prot-title"><span class="qa-key">${k.key}</span> ${esc(k.id ? k.title : t('apps.quickAccess.none', 'Nothing set'))}</div>
        ${!k.installed ? `<div class="prot-desc" translate="no">${esc(k.id)}</div>` : ''}
        ${k.lgDefault ? `<div class="prot-desc">${esc(t('apps.quickAccess.lgDefault', 'Set by LG'))}</div>` : ''}
      </div>
      <div class="prot-status">
        <select class="pill-sel qa-sel" data-key="${k.key}" ${d.writable ? '' : 'disabled'}
          aria-label="${esc(t('apps.quickAccess.keyLabel', 'Key {key}', { key: k.key }))}" onchange="setQuickAccessKey(this)">
          ${current}
          <option value=""${!k.id ? ' selected' : ''}>${esc(t('apps.quickAccess.reset', 'None'))}</option>
          <optgroup label="${esc(t('apps.quickAccess.inputs', 'Inputs'))}">${inputs.map(c => opt(c, k.id)).join('')}</optgroup>
          <optgroup label="${esc(t('apps.quickAccess.apps', 'Apps'))}">${apps.map(c => opt(c, k.id)).join('')}</optgroup>
        </select>
      </div>
    </div>`;
  }).join('');
}

async function setQuickAccessKey(sel) {
  sel.disabled = true;
  let error = null;
  try {
    const res = await fetch(api('/api/quickaccess'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: Number(sel.dataset.key), id: sel.value })
    });
    const r = await res.json();
    if (!r || !r.ok) error = (r && r.error) || t('common.unknownError', 'unknown error');
  } catch (e) {
    error = e.message;
  }
  sel.blur();
  if (error) alert(t('apps.quickAccess.failed', 'Could not change it: {error}', { error }));
  await loadApps();
}

// Apps LG keeps loaded in the background (#624).
// Parts of LG's Home screen, and inputs as tiles on it (lib/homescreen.js).
function renderHomeScreen(d) {
  const disc = q('disc-homescreen');
  const hs = d.homeScreen;
  if (!disc) return;
  disc.hidden = !hs;
  if (!hs) return;
  const hidden = hs.parts.filter(p => !p.shown).length;
  const summary = q('apps-home-summary');
  if (summary) {
    summary.textContent = hidden
      ? t('apps.home.hiddenOf', '{n} of {total} hidden', { n: hidden, total: hs.parts.length })
      : t('apps.home.asLg', 'As LG has it');
  }
  const parts = q('apps-home-parts');
  if (parts) {
    parts.innerHTML = hs.parts.map(p => `<div class="prot-row">
      <div class="prot-main">
        <div class="prot-title">${esc(p.title)}</div>
        <div class="prot-desc">${esc(p.desc)}</div>
      </div>
      <div class="prot-status">
        ${renderToggle({
          id: 'btn-home-' + esc(p.id),
          cls: p.shown ? 'good' : 'idle',
          label: p.shown ? t('apps.home.shown', 'Shown') : t('apps.home.hidden', 'Hidden'),
          disabled: !d.writable,
          onclick: "setHomePart('" + esc(p.id) + "', " + (!p.shown) + ")"
        })}
      </div>
    </div>`).join('');
  }
  const inputs = q('apps-home-inputs');
  const inputsHead = q('apps-home-inputs-h');
  const showInputs = !!(hs.inputs && hs.inputs.length);
  if (inputsHead) inputsHead.hidden = !showInputs;
  if (inputs) {
    inputs.hidden = !showInputs;
    inputs.innerHTML = showInputs ? hs.inputs.map(i => `<div class="prot-row">
      <div class="prot-main"><div class="prot-title">${esc(i.title)}</div></div>
      <div class="prot-status">
        ${renderToggle({
          id: 'btn-home-' + esc(i.id),
          cls: i.onHome ? 'good' : 'idle',
          label: i.onHome ? t('apps.home.onHome', 'On Home') : t('apps.home.notOnHome', 'Not on Home'),
          disabled: !d.writable,
          onclick: "setHomeInput('" + esc(i.id) + "', " + (!i.onHome) + ")"
        })}
      </div>
    </div>`).join('') : '';
  }
  const restore = q('btn-home-restore');
  if (restore) {
    restore.disabled = !d.writable;
    restore.textContent = t('apps.home.restore', 'Put back LG’s Home screen');
  }
}

async function postHomeScreen(btnId, body) {
  const btn = q(btnId);
  if (btn) {
    btn.disabled = true;
    btn.classList.add('busy');
    btn.textContent = t('apps.service.updating', 'Updating…');
  }
  let error = null;
  try {
    const res = await fetch(api('/api/homescreen'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const r = await res.json();
    if (!r || !r.ok) error = (r && r.error) || t('common.unknownError', 'unknown error');
  } catch (e) {
    error = e.message;
  } finally {
    if (btn) btn.classList.remove('busy');
  }
  if (error) alert(t('apps.home.failed', 'Could not change the Home screen: {error}', { error }));
  loadApps();
}

function setHomePart(id, shown) { return postHomeScreen('btn-home-' + id, { part: id, shown }); }
function setHomeInput(id, onHome) { return postHomeScreen('btn-home-' + id, { input: id, onHome }); }
function restoreHome() { return postHomeScreen('btn-home-restore', { restore: true }); }

function renderPreload(d) {
  const disc = q('disc-preload');
  const list = q('apps-preload-list');
  const summary = q('apps-preload-summary');
  const apps = d.preload || [];
  if (!disc) return;
  disc.hidden = !apps.length;
  if (!apps.length) return;
  const numOff = apps.filter(a => a.off).length;
  if (summary) {
    summary.textContent = numOff
      ? t('apps.preload.offOf', '{off} switched off of {n}', { off: numOff, n: apps.length })
      : apps.length === 1 ? t('apps.preload.one', '1 app') : t('apps.preload.count', '{n} apps', { n: apps.length });
  }
  if (!list) return;
  list.innerHTML = apps.map(a => {
    const id = esc(a.id);
    const size = a.memoryMb ? t('apps.preload.size', 'about {mb} MB when loaded', { mb: a.memoryMb }) : '';
    const loadedNow = a.loaded ? ` <span class="prot-sub">&middot; ${esc(t('apps.preload.loaded', 'loaded now'))}</span>` : '';
    const iconUrl = api('/api/apps/icon?id=' + encodeURIComponent(a.id));
    // Some of LG's apps have no icon (Yandex Alice on a C2): the space stays, so the names line up.
    return `<div class="prot-row">
      <img src="${iconUrl}" width="38" height="38" style="border-radius:8px;object-fit:contain;background:var(--w06);flex-shrink:0" onerror="this.style.visibility='hidden'">
      <div class="prot-main">
        <div class="prot-title">${esc(a.title)}${size ? ` <span class="prot-sub">&middot; ${esc(size)}</span>` : ''}${loadedNow}</div>
      </div>
      <div class="prot-status">
        ${renderToggle({
          id: 'btn-preload-' + id,
          cls: a.off ? 'idle' : 'good',
          label: a.off ? t('apps.preload.off', 'Switched off') : t('apps.preload.kept', 'Kept ready'),
          disabled: !d.writable,
          onclick: "togglePreload('" + id + "', " + (!a.off) + ")"
        })}
      </div>
    </div>`;
  }).join('');
}

async function togglePreload(appId, makeOff) {
  const btn = q('btn-preload-' + appId);
  if (btn) {
    btn.disabled = true;
    btn.classList.add('busy');
    btn.textContent = t('apps.service.updating', 'Updating\u2026');
  }
  let error = null;
  try {
    const res = await fetch(api('/api/preload/toggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId, off: makeOff })
    });
    const d = await res.json();
    if (d && d.ok) {
      const item = appsData && (appsData.preload || []).find(a => a.id === appId);
      if (item) item.off = makeOff;
    } else {
      error = (d && d.error) || t('common.unknownError', 'unknown error');
    }
  } catch (e) {
    error = e.message;
  } finally {
    if (btn) btn.classList.remove('busy');
  }
  if (appsData) renderPreload(appsData);
  if (error) alert(t('apps.preload.failed', 'Could not change it: {error}', { error }));
}

async function toggleService(serviceId, makeDisabled) {
  const btn = document.getElementById('btn-svc-' + serviceId);
  if (btn) {
    btn.disabled = true;
    btn.classList.add('busy');
    btn.textContent = t('apps.service.updating', 'Updating\u2026');
  }
  try {
    const res = await fetch(api('/api/services/toggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: serviceId, disabled: makeDisabled })
    });
    const d = await res.json();
    if (d && d.ok) {
      if (appsData && appsData.services) {
        const item = appsData.services.find(s => s.id === serviceId);
        if (item) item.disabled = makeDisabled;
        renderAppsPanel();
      }
    } else {
      if (btn) {
        btn.disabled = false;
        btn.textContent = makeDisabled ? t('apps.service.active', 'Active') : t('apps.service.disabled', 'Disabled');
      }
      alert(t('apps.service.failed', 'Could not update service: {error}', { error: (d && d.error) || t('common.unknownError', 'unknown error') }));
    }
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = makeDisabled ? t('apps.service.active', 'Active') : t('apps.service.disabled', 'Disabled');
    }
    alert(t('apps.service.failed', 'Could not update service: {error}', { error: e.message }));
  } finally {
    if (btn) btn.classList.remove('busy');
  }
}

/*
 * From the catalog or the installed list, which can both show the app: both
 * say it is going while it does (about ten seconds with tiles hidden, as the
 * home screen restarts), then the catalog's says so for a moment and the
 * installed list's row goes.
 */
async function confirmUninstall(appId, appTitle) {
  if (!confirm(t('apps.uninstall.confirm', 'Uninstall "{name}" from the TV?\n\nThis will permanently delete the application and its stored data.', { name: appTitle }))) {
    return;
  }
  delete rowError[appId];
  uninstalling[appId] = true;
  renderCatalog();
  renderAppsPanel();
  let error = null;
  try {
    const res = await fetch(api('/api/apps/uninstall'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId })
    });
    const d = await res.json();
    if (!d || !d.ok) error = (d && d.error) || t('common.unknownError', 'unknown error');
  } catch (e) {
    error = e.message;
  }
  delete uninstalling[appId];
  if (error) {
    rowError[appId] = sentence(error);
    showErr(t('apps.uninstall.failed', 'Could not uninstall {name}: {error}', { name: appTitle, error }));
  } else {
    if (appsData && appsData.installed) appsData.installed = appsData.installed.filter(a => a.id !== appId);
    setCatalogState(appId, null);
    flashRow(appId, t('apps.uninstall.removed', 'Removed'), 'idle flash');
  }
  renderCatalog();
  renderAppsPanel();
  loadApps();
  loadCatalog();
}

async function toggleTileVisibility(appId, makeHidden) {
  if (tilePending.hasOwnProperty(appId)) return;
  tilePending[appId] = makeHidden;
  renderAppsPanel();
  const ep = makeHidden ? '/api/apps/hide' : '/api/apps/unhide';
  let error = null;
  try {
    const res = await fetch(api(ep), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId })
    });
    const d = await res.json();
    if (!d || !d.ok) error = (d && d.error) || t('common.unknownError', 'unknown error');
  } catch (e) {
    error = e.message;
  }
  delete tilePending[appId];
  const tile = !error && appsData && (appsData.systemTiles || []).find(x => x.id === appId);
  if (tile) tile.hidden = makeHidden;
  if (Object.keys(tilePending).length) renderAppsPanel();
  else await loadApps();
  if (error) alert(t('apps.tile.failed', 'Could not update tile: {error}', { error }));
}

async function setTileHiding(enabled) {
  const btnOff = q('tile-hiding-off');
  const btnOn = q('tile-hiding-on');
  const target = enabled ? btnOn : btnOff;
  if (btnOff) btnOff.disabled = true;
  if (btnOn) btnOn.disabled = true;
  if (target) target.classList.add('busy');
  try {
    const res = await fetch(api('/api/apps/tile-hiding'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled })
    });
    const d = await res.json();
    if (d && d.ok) {
      if (appsData) {
        appsData.tileHidingEnabled = enabled;
        renderAppsPanel();
      }
      await loadApps();
    } else {
      alert(t('apps.tiles.failed', 'Could not update tile hiding: {error}', { error: (d && d.error) || t('common.unknownError', 'unknown error') }));
      renderAppsPanel();
    }
  } catch (e) {
    alert(t('apps.tiles.failed', 'Could not update tile hiding: {error}', { error: e.message }));
    renderAppsPanel();
  } finally {
    if (target) target.classList.remove('busy');
    if (btnOff) btnOff.disabled = false;
    if (btnOn) btnOn.disabled = false;
  }
}
