// Saved state: your own entries (results, live scores), followed clubs, your FotMob picks and settings.
// Always kept in localStorage; with Google sign-in it also syncs through Firestore (users/{uid}/app/state),
// (Firebase project set up per docs/firebase-setup.md).
const LS = 'football-app-v1';
const blank = () => ({ entries: {}, favs: null, picks: {}, settings: {}, motw: {}, updated: 0 });

let state = load(), listeners = [], cloud = null, user = null, status = 'local';

function load() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return blank(); }
}
function persist() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch { /* private mode */ } }
const emit = () => listeners.forEach(f => f(state));

export const store = {
  get: () => state,
  on: f => listeners.push(f),
  user: () => user, status: () => status,
  set(fn) {
    fn(state); state.updated = Date.now(); persist(); emit();
    if (cloud) cloud.set(toDoc(state), { merge: true }).catch(e => { status = 'error'; console.warn(e); emit(); });
  },
};

const toDoc = s => ({ entries: JSON.stringify(s.entries), favs: JSON.stringify(s.favs), picks: JSON.stringify(s.picks), settings: JSON.stringify(s.settings), motw: JSON.stringify(s.motw || {}), updated: s.updated });
const fromDoc = d => ({ entries: JSON.parse(d.entries || '{}'), favs: JSON.parse(d.favs || 'null'), picks: JSON.parse(d.picks || '{}'), settings: JSON.parse(d.settings || '{}'), motw: JSON.parse(d.motw || '{}'), updated: d.updated || 0 });

const hasFirebase = () => typeof firebase !== 'undefined' && window.FIREBASE_CONFIG;

export async function initSync() {
  if (!hasFirebase()) return;
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  try { await db.enablePersistence({ synchronizeTabs: true }); } catch { /* another tab or unsupported */ }
  try { await auth.getRedirectResult(); } catch { /* ignore */ }
  auth.onAuthStateChanged(async u => {
    user = u; if (!u) { cloud = null; status = 'local'; emit(); return; }
    cloud = db.collection('users').doc(u.uid).collection('app').doc('state');
    status = 'syncing'; emit();
    const snap = await cloud.get().catch(() => null);
    if (snap && snap.exists) {
      const remote = fromDoc(snap.data());
      // merge: entries and picks per match (newest wins), the rest from whichever copy is newer
      const mergeMap = (a, b) => { const out = { ...a }; for (const k in b) out[k] = { ...(a[k] || {}), ...b[k] }; return out; };
      const newer = remote.updated > state.updated ? remote : state;
      state = { ...newer, entries: mergeMap(state.entries, remote.entries), picks: { ...state.picks, ...remote.picks }, motw: { ...state.motw, ...remote.motw } };
      persist();
    }
    await cloud.set(toDoc(state), { merge: true }).catch(() => {});
    status = 'synced'; emit();
    cloud.onSnapshot(s => {
      if (!s.exists || s.metadata.hasPendingWrites) return;
      const r = fromDoc(s.data()); if (r.updated <= state.updated) return;
      state = r; persist(); emit();
    });
  });
}

export async function signIn() {
  if (!hasFirebase()) return alert('Cloud sync is not configured.');
  const auth = firebase.auth(), p = new firebase.auth.GoogleAuthProvider();
  try { await auth.signInWithPopup(p); }
  catch (e) { if (/popup|operation-not-supported/.test(e.code || '')) return auth.signInWithRedirect(p); alert('Sign-in failed: ' + (e.message || e)); }
}
export async function signOut() { try { await firebase.auth().signOut(); } catch { /* ignore */ } }
