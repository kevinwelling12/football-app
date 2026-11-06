// Saved state: your own entries (results, live scores), followed clubs, FotMob picks, match-of-the-week locks,
// Affinity picks and settings. Always kept in localStorage; with Google sign-in it also syncs through Firestore
// (users/{uid}/app/state; project per docs/firebase-setup.md).
//
// Sync is field by field: every entry, pick and lock is its own key in the cloud document, and a device writes only
// the keys it changed (Firestore merges nested maps). Two devices' changes therefore combine instead of one device's
// whole copy overwriting the other's. The document as Firestore holds it (with this device's pending writes) is the truth.
const LS = 'football-app-v1';
const blank = () => ({ entries: {}, favs: null, picks: {}, settings: {}, motw: {}, affPicks: [], playerPicks: [], updated: 0 });

let state = load(), listeners = [], cloud = null, user = null, status = 'local';
// what Settings shows: last error, when the cloud copy was last seen, and its pick count
const diag = { error: null, seen: null, cloudPicks: null, cloudEntries: null };
const countEntries = e => Object.values(e || {}).reduce((n, m) => n + Object.keys(m || {}).length, 0);

function load() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return blank(); }
}
function persist() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch { /* private mode */ } }
const emit = () => listeners.forEach(f => f(state));
const pairKey = p => [p.a, p.b].sort().join('|');
// In the cloud a pick is one string under its pair ("winner|time"; v3, 2026-11-06). As a map of four fields each pick
// cost Firestore eight index entries, and at ~4,000 picks the document passed its 40,000 limit: every write was refused
// ("too many index entries") and new picks vanished. The old map fields (affPicks, playerPicks) are read, then removed.
const CF = { affPicks: 'affP', playerPicks: 'plP' };
const enc = p => `${p.win ?? ''}|${p.t || 0}`;
const dec = (k, v) => { const [a, b] = k.split('|'), [w, t] = String(v).split('|'); return { a, b, win: w || null, t: +t || 0 }; };
const compact = arr => Object.fromEntries((arr || []).map(p => [pairKey(p), enc(p)]));
const newer = (x, y) => (!x ? y : !y ? x : (y.t || 0) >= (x.t || 0) ? y : x);
// the newest pick per pair from the old map field and the compact one
const readPicks = (old, cmp) => { const m = new Map(); for (const p of Object.values(old || {})) m.set(pairKey(p), newer(m.get(pairKey(p)), p)); for (const [k, v] of Object.entries(cmp || {})) { const p = dec(k, v); m.set(k, newer(m.get(k), p)); } return [...m.values()]; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const store = {
  get: () => state,
  on: f => listeners.push(f),
  user: () => user, status: () => status, diag: () => diag, syncNow: () => syncNow(),
  set(fn) {
    const before = JSON.parse(JSON.stringify(state));
    fn(state); state.updated = Date.now(); persist(); emit();
    if (!cloud) return;
    const d = delta(before, state);
    if (Object.keys(d).length) cloud.set(d, { merge: true }).catch(fail);
  },
};

// Only what changed, as nested maps; removed keys become delete markers.
function delta(a, b) {
  const DEL = firebase.firestore.FieldValue.delete(), out = {};
  const diffMap = (x = {}, y = {}) => {
    const o = {};
    for (const k in y) if (!same(x[k], y[k])) o[k] = y[k];
    for (const k in x) if (!(k in y)) o[k] = DEL;
    return o;
  };
  const ent = {};
  for (const lg of new Set([...Object.keys(a.entries || {}), ...Object.keys(b.entries || {})])) {
    const d = diffMap(a.entries?.[lg], b.entries?.[lg]); if (Object.keys(d).length) ent[lg] = d;
  }
  if (Object.keys(ent).length) out.entries = ent;
  for (const [f, x, y] of [[CF.affPicks, compact(a.affPicks), compact(b.affPicks)], [CF.playerPicks, compact(a.playerPicks), compact(b.playerPicks)], ['picks', a.picks, b.picks], ['motw', a.motw, b.motw]]) {
    const d = diffMap(x, y); if (Object.keys(d).length) out[f] = d;
  }
  if (!same(a.favs, b.favs)) out.favs = { ids: b.favs };
  if (!same(a.settings, b.settings)) out.settings = b.settings || {};
  if (Object.keys(out).length) out.v = 3;
  return out;
}

// drop: remove the old map fields in the same write (only with merge)
const toCloud = (s, drop) => ({ v: 3, entries: s.entries || {}, affP: compact(s.affPicks), plP: compact(s.playerPicks),
  ...(drop ? { affPicks: firebase.firestore.FieldValue.delete(), playerPicks: firebase.firestore.FieldValue.delete() } : {}),
  picks: s.picks || {}, motw: s.motw || {}, favs: { ids: s.favs }, settings: s.settings || {} });
function fromCloud(d) {
  if (typeof d.entries === 'string') { // first version stored JSON strings
    const j = (x, dflt) => { try { return x ? JSON.parse(x) : dflt; } catch { return dflt; } };
    return { entries: j(d.entries, {}), favs: j(d.favs, null), picks: j(d.picks, {}), settings: j(d.settings, {}), motw: j(d.motw, {}), affPicks: j(d.affPicks, []) };
  }
  return { entries: d.entries || {}, favs: d.favs?.ids ?? null, picks: d.picks || {}, settings: d.settings || {}, motw: d.motw || {},
    affPicks: readPicks(d.affPicks, d.affP), playerPicks: readPicks(d.playerPicks, d.plP) };
}

// Combine this device's copy with the cloud's at sign-in: newest per entry / pick, union of locks.
function merge(local, remote) {
  const newest = (x, y) => (!x ? y : !y ? x : (y.at || y.t || 0) >= (x.at || x.t || 0) ? y : x);
  const entries = {};
  for (const lg of new Set([...Object.keys(local.entries || {}), ...Object.keys(remote.entries || {})])) {
    const L = local.entries?.[lg] || {}, R = remote.entries?.[lg] || {}; entries[lg] = {};
    for (const id of new Set([...Object.keys(L), ...Object.keys(R)])) entries[lg][id] = newest(L[id], R[id]);
  }
  const union = (a = [], b = []) => { const m = new Map(); for (const p of [...a, ...b]) m.set(pairKey(p), newest(m.get(pairKey(p)), p)); return [...m.values()]; };
  return { ...blank(), entries, affPicks: union(local.affPicks, remote.affPicks), playerPicks: union(local.playerPicks, remote.playerPicks), picks: { ...local.picks, ...remote.picks }, motw: { ...local.motw, ...remote.motw },
    favs: remote.favs ?? local.favs, settings: { ...local.settings, ...remote.settings }, updated: Date.now() };
}

const hasFirebase = () => typeof firebase !== 'undefined' && window.FIREBASE_CONFIG;
let unsub = null, ref = null, resent = 0;
const fail = e => { status = 'error'; diag.error = `${e.code || ''} ${e.message || e}`.trim(); console.warn(e); emit(); };

// Read the server copy, combine it with this device's, write the result back. Additive (merge: true never removes
// anything), so a stale read can't wipe the cloud.
async function syncNow() {
  if (!ref) return;
  status = 'syncing'; diag.error = null; emit();
  try {
    const snap = await ref.get({ source: 'server' });
    state = snap.exists ? merge(state, fromCloud(snap.data())) : { ...state };
    persist();
    if (snap.exists && typeof snap.data().entries === 'string') await ref.set(toCloud(state)); // convert the first-version layout
    else await ref.set(toCloud(state, snap.exists && (snap.data().affPicks || snap.data().playerPicks)), { merge: true });
    cloud = ref; status = 'synced'; emit();
  } catch (e) { fail(e); }
}

export async function initSync() {
  if (!hasFirebase()) return;
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  try { await db.enablePersistence({ synchronizeTabs: true }); } catch { /* another tab or unsupported */ }
  try { await auth.getRedirectResult(); } catch { /* ignore */ }
  auth.onAuthStateChanged(async u => {
    if (unsub) { unsub(); unsub = null; }
    cloud = null; ref = null;
    user = u; if (!u) { cloud = null; status = 'local'; emit(); return; }
    ref = db.collection('users').doc(u.uid).collection('app').doc('state');
    await syncNow();
    if (!cloud) return; // the error is in diag for Settings
    unsub = ref.onSnapshot({ includeMetadataChanges: true }, s => {
      if (!s.exists) return;
      const r = fromCloud(s.data());
      // picks only ever get added: keep any this device has that the cloud copy lacks (a write that failed or hasn't
      // landed yet), instead of letting the snapshot drop them, and send them again (at most every 20 s)
      const lost = {};
      for (const f of ['affPicks', 'playerPicks']) {
        const have = new Map(r[f].map(p => [pairKey(p), p]));
        for (const p of state[f] || []) { const q = have.get(pairKey(p)); if (!q || (p.t || 0) > (q.t || 0)) { have.set(pairKey(p), p); (lost[CF[f]] ||= {})[pairKey(p)] = enc(p); } }
        r[f] = [...have.values()];
      }
      state = { ...blank(), ...r, updated: Date.now() };
      if (Object.keys(lost).length && !s.metadata.hasPendingWrites && Date.now() - resent > 20e3) { resent = Date.now(); cloud?.set({ v: 3, ...lost }, { merge: true }).catch(fail); }
      if (!s.metadata.fromCache) { diag.seen = Date.now(); diag.cloudPicks = r.affPicks.length; diag.cloudPlayerPicks = r.playerPicks.length; diag.cloudEntries = countEntries(r.entries); }
      status = s.metadata.hasPendingWrites ? 'syncing' : 'synced';
      persist(); emit();
    }, fail);
  });
}

export async function signIn() {
  if (!hasFirebase()) return alert('Cloud sync is not configured.');
  const auth = firebase.auth(), p = new firebase.auth.GoogleAuthProvider();
  try { await auth.signInWithPopup(p); }
  catch (e) { if (/popup|operation-not-supported/.test(e.code || '')) return auth.signInWithRedirect(p); alert('Sign-in failed: ' + (e.message || e)); }
}
export async function signOut() { try { await firebase.auth().signOut(); } catch { /* ignore */ } }
