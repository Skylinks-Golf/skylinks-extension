/* Pro Shop Orders — main worker (extension service worker).
   The order page hands it one order run; it starts one mini worker per order-online vendor (and opens the
   Gmail compose windows), keeps each vendor's progress in chrome.storage.session under 'orderRun', and keeps
   going if the order page is closed. The order page only shows that progress.
   Mini worker, per vendor: open the vendor's list page, wait for staff to sign in (checks every 10 s, up to 45 min),
   then take a turn in the fill lane: bring its tab to the front, fill the approved lines (orders/portals.js),
   confirm, and put the order page back in front. Fills take turns because Chrome slows background tabs.
   Never checks out, submits, adds a whole list or types a login. */
importScripts('sipmarket.js', 'portals.js');

const KEY = 'orderRun';
const SIGNIN_LIMIT = 45 * 60e3;
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- progress (what the order page shows) ----------
let saving = Promise.resolve();
function update(code, patch) {
  saving = saving.then(async () => {
    const run = (await chrome.storage.session.get(KEY))[KEY];
    if (!run || !run.vendors[code]) return;
    Object.assign(run.vendors[code], patch, { at: Date.now() });
    await chrome.storage.session.set({ [KEY]: run });
  }).catch(() => {});
  return saving;
}

// ---------- keep the worker awake while vendors are in progress ----------
let active = 0, beat = null;
function busy(on) {
  active += on ? 1 : -1;
  if (active > 0 && !beat) beat = setInterval(() => chrome.runtime.getPlatformInfo(), 20e3);
  if (active <= 0 && beat) { clearInterval(beat); beat = null; active = 0; }
}

// ---------- fill lane: one vendor fills at a time, with its tab in front ----------
let lane = Promise.resolve();
function inTurn(fn) { const p = lane.then(fn, fn); lane = p.catch(() => {}); return p; }
async function toFront(tabId) {
  try { const t = await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); } catch (e) {}
}
async function orderPageTab() {
  const [t] = await chrome.tabs.query({ url: chrome.runtime.getURL('orders/app.html') + '*' });
  return t || null;
}
const exists = async id => { try { await chrome.tabs.get(id); return true; } catch (e) { return false; } };
const execIn = tabId => async (func, args = []) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return r.result;
};

// ---------- mini worker: one vendor ----------
async function miniWorker(v) {
  const P = PORTALS[v.code];
  busy(true);
  try {
    const lines = v.lines.filter(l => l.cases > 0).map(l => ({ item: l.item, cases: l.cases, sku: P.sku(l.item) }));
    const todo = lines.filter(l => l.sku);
    const pick = lines.filter(l => !l.sku).map(l => [l.item, `not matched to a ${P.site} item yet (needs your pick)`]);
    const tab = await chrome.tabs.create({ url: P.start, active: false });
    const exec = execIn(tab.id);
    await update(v.code, { phase: 'opening', text: `opening ${P.site}…`, tabId: tab.id });
    const t0 = Date.now();
    await wait(3000);
    while (Date.now() - t0 < SIGNIN_LIMIT) {
      if (!(await exists(tab.id))) return update(v.code, { phase: 'stopped', text: `the ${P.site} tab was closed, so the cart was not filled. Press the button again to retry.` });
      let st; try { st = (await exec(P.state)).state; } catch (e) { st = 'loading'; }
      const go2 = P.relist(st);
      if (st === 'signin') await update(v.code, { phase: 'signin', text: `sign into ${P.site} in its tab. Checking every 10 seconds.` });
      else if (go2) { await chrome.tabs.update(tab.id, { url: go2 }); await wait(4000); continue; }
      else if (st === 'list') {
        await update(v.code, { phase: 'queued', text: 'signed in. Waiting for its turn to fill…' });
        const res = await inTurn(() => fillInFront(v, P, tab, exec, todo));
        if (!res) return;
        if (res.error) return update(v.code, { phase: 'error', text: `something went wrong while filling the cart (${res.error}). Nothing was submitted.` });
        const cases = res.added.reduce((a, x) => a + x[1], 0);
        return update(v.code, {
          phase: 'done', added: res.added.length, cases, total: res.total || '',
          note: P.note ? P.note(res).trim() : '', skipped: res.skipped.concat(pick),
          text: `${res.added.length} ${res.added.length === 1 ? 'item' : 'items'}, ${cases} ${cases === 1 ? 'case' : 'cases'} added${res.total ? ', cart ' + res.total : ''}.`,
        });
      }
      await wait(10000);
    }
    return update(v.code, { phase: 'stopped', text: `no ${P.site} sign-in after 45 minutes, so the cart was not filled. Press the button again when you're ready.` });
  } catch (e) {
    return update(v.code, { phase: 'error', text: `stopped unexpectedly (${String(e.message || e).slice(0, 120)}). Nothing was submitted.` });
  } finally { busy(false); }
}

async function fillInFront(v, P, tab, exec, todo) {
  if (!(await exists(tab.id))) { await update(v.code, { phase: 'stopped', text: `the ${P.site} tab was closed, so the cart was not filled. Press the button again to retry.` }); return null; }
  await toFront(tab.id); await wait(1500);
  let st; try { st = (await exec(P.state)).state; } catch (e) { st = 'loading'; }
  for (let k = 0; k < 10 && st !== 'list'; k++) { await wait(1500); try { st = (await exec(P.state)).state; } catch (e) { st = 'loading'; } }
  const back = async () => { const me = await orderPageTab(); if (me) await toFront(me.id); };
  if (st !== 'list') { await update(v.code, { phase: 'stopped', text: `the ${P.site} tab left its list page before filling, so the cart was not filled. Press the button again to retry.` }); await back(); return null; }
  await update(v.code, { phase: 'filling', text: `adding ${todo.length} items now. Leave the ${P.site} tab in front until it finishes.` });
  let res;
  try { res = await exec(P.fill, [todo]); }
  catch (e) { await back(); return { added: [], skipped: [], error: String(e.message || e).slice(0, 120) }; }
  if (res.pending && res.pending.length && P.verify) {
    await update(v.code, { phase: 'filling', text: 'adding to the cart…' });
    let ok = null;
    for (let k = 0; k < 6 && !ok; k++) { await wait(4000); try { ok = await exec(P.verify, [res.pending]); } catch (e) {} }
    if (ok) { res.added = res.added.concat(ok.added); res.skipped = res.skipped.concat(ok.skipped); }
    else res.skipped = res.skipped.concat(res.pending.map(x => [x[0], 'not confirmed in the cart; check it']));
    delete res.pending;
  }
  await back();
  return res;
}

// ---------- main worker: start one order run ----------
async function startRun(run) {
  const vendors = {};
  for (const v of run.portals) vendors[v.code] = { name: v.name, site: PORTALS[v.code].site, phase: 'waiting', text: 'starting…' };
  await chrome.storage.session.set({ [KEY]: { id: Date.now(), weekOf: run.weekOf, startedAt: Date.now(), vendors } });
  for (const url of run.otherUrls || []) await chrome.tabs.create({ url, active: false });   // vendors without a mini worker yet
  for (const url of run.mailUrls || []) await chrome.tabs.create({ url, active: false });    // email mini worker: Gmail compose windows
  run.portals.forEach(v => miniWorker(v));
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'orderRun:start') {
    const known = (msg.run.portals || []).filter(v => PORTALS[v.code]);
    startRun({ ...msg.run, portals: known }).then(() => reply({ ok: true, started: known.length }), e => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
  return false;
});

// If Chrome restarted the worker mid-run, vendors that were in progress can't be resumed safely: say so.
(async () => {
  const run = (await chrome.storage.session.get(KEY))[KEY];
  if (!run || active) return;
  let changed = false;
  for (const x of Object.values(run.vendors)) if (!['done', 'error', 'stopped'].includes(x.phase)) {
    x.phase = 'stopped'; x.text = 'the order worker restarted before this vendor finished. Press the button again to retry; items already in the cart are skipped.'; changed = true;
  }
  if (changed) await chrome.storage.session.set({ [KEY]: run });
})();
