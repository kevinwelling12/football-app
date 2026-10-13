// Saved state: your own entries (results, live scores), followed clubs, FotMob picks, match-of-the-week locks,
// Affinity picks and settings. Always kept in localStorage; with Google sign-in it also syncs through Firestore
// (users/{uid}/app/state; project per docs/firebase-setup.md).
//
// Sync is field by field: every entry, pick and lock is its own key in the cloud document, and a device writes only
// the keys it changed (Firestore merges nested maps). Two devices' changes therefore combine instead of one device's
// whole copy overwriting the other's. The document as Firestore holds it (with this device's pending writes) is the truth.
const LS = 'football-app-v1';
const blank = () => ({ entries: {}, favs: null, picks: {}, settings: {}, motw: {}, affPicks: [], updated: 0 });

let state = load(), listeners = [], cloud = null, user = null, status = 'local';

function load() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return blank(); }
}
function persist() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch { /* private mode */ } }
const emit = () => listeners.forEach(f => f(state));
const pairKey = p => [p.a, p.b].sort().join('|');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const store = {
  get: () => state,
  on: f => listeners.push(f),
  user: () => user, status: () => status,
  set(fn) {
    const before = JSON.parse(JSON.stringify(state));
    fn(state); state.updated = Date.now(); persist(); emit();
    if (!cloud) return;
    const d = delta(before, state);
    if (Object.keys(d).length) cloud.set(d, { merge: true }).catch(e => { status = 'error'; console.warn(e); emit(); });
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
  const toMap = arr => Object.fromEntries((arr || []).map(p => [pairKey(p), p]));
  for (const [f, x, y] of [['affPicks', toMap(a.affPicks), toMap(b.affPicks)], ['picks', a.picks, b.picks], ['motw', a.motw, b.motw]]) {
    const d = diffMap(x, y); if (Object.keys(d).length) out[f] = d;
  }
  if (!same(a.favs, b.favs)) out.favs = { ids: b.favs };
  if (!same(a.settings, b.settings)) out.settings = b.settings || {};
  if (Object.keys(out).length) out.v = 2;
  return out;
}

const toCloud = s => ({ v: 2, entries: s.entries || {}, affPicks: Object.fromEntries((s.affPicks || []).map(p => [pairKey(p), p])),
  picks: s.picks || {}, motw: s.motw || {}, favs: { ids: s.favs }, settings: s.settings || {} });
function fromCloud(d) {
  if (typeof d.entries === 'string') { // first version stored JSON strings
    const j = (x, dflt) => { try { return x ? JSON.parse(x) : dflt; } catch { return dflt; } };
    return { entries: j(d.entries, {}), favs: j(d.favs, null), picks: j(d.picks, {}), settings: j(d.settings, {}), motw: j(d.motw, {}), affPicks: j(d.affPicks, []) };
  }
  return { entries: d.entries || {}, favs: d.favs?.ids ?? null, picks: d.picks || {}, settings: d.settings || {}, motw: d.motw || {},
    affPicks: Object.values(d.affPicks || {}) };
}

// Combine this device's copy with the cloud's at sign-in: newest per entry / pick, union of locks.
function merge(local, remote) {
  const newest = (x, y) => (!x ? y : !y ? x : (y.at || y.t || 0) >= (x.at || x.t || 0) ? y : x);
  const entries = {};
  for (const lg of new Set([...Object.keys(local.entries || {}), ...Object.keys(remote.entries || {})])) {
    const L = local.entries?.[lg] || {}, R = remote.entries?.[lg] || {}; entries[lg] = {};
    for (const id of new Set([...Object.keys(L), ...Object.keys(R)])) entries[lg][id] = newest(L[id], R[id]);
  }
  const pm = new Map(); for (const p of [...(local.affPicks || []), ...(remote.affPicks || [])]) pm.set(pairKey(p), newest(pm.get(pairKey(p)), p));
  return { ...blank(), entries, affPicks: [...pm.values()], picks: { ...local.picks, ...remote.picks }, motw: { ...local.motw, ...remote.motw },
    favs: remote.favs ?? local.favs, settings: { ...local.settings, ...remote.settings }, updated: Date.now() };
}

const hasFirebase = () => typeof firebase !== 'undefined' && window.FIREBASE_CONFIG;
let unsub = null;

export async function initSync() {
  if (!hasFirebase()) return;
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  try { await db.enablePersistence({ synchronizeTabs: true }); } catch { /* another tab or unsupported */ }
  try { await auth.getRedirectResult(); } catch { /* ignore */ }
  auth.onAuthStateChanged(async u => {
    if (unsub) { unsub(); unsub = null; }
    user = u; if (!u) { cloud = null; status = 'local'; emit(); return; }
    const ref = db.collection('users').doc(u.uid).collection('app').doc('state');
    status = 'syncing'; emit();
    try {
      const snap = await ref.get({ source: 'server' }).catch(() => ref.get());
      state = snap.exists ? merge(state, fromCloud(snap.data())) : { ...state };
      persist();
      await ref.set(toCloud(state)); // whole document once, in the field-by-field layout
      cloud = ref; status = 'synced'; emit();
      unsub = ref.onSnapshot({ includeMetadataChanges: true }, s => {
        if (!s.exists) return;
        state = { ...blank(), ...fromCloud(s.data()), updated: Date.now() };
        status = s.metadata.hasPendingWrites ? 'syncing' : 'synced';
        persist(); emit();
      }, e => { status = 'error'; console.warn(e); emit(); });
    } catch (e) { status = 'error'; console.warn(e); emit(); }
  });
}

export async function signIn() {
  if (!hasFirebase()) return alert('Cloud sync is not configured.');
  const auth = firebase.auth(), p = new firebase.auth.GoogleAuthProvider();
  try { await auth.signInWithPopup(p); }
  catch (e) { if (/popup|operation-not-supported/.test(e.code || '')) return auth.signInWithRedirect(p); alert('Sign-in failed: ' + (e.message || e)); }
}
export async function signOut() { try { await firebase.auth().signOut(); } catch { /* ignore */ } }
