# Cloud sync setup (about 10 minutes, free)

Without this the app works fully but saves your entered scores, followed clubs and picks on each device separately.
With it, iPhone and iPad stay in sync through your Google account.

1. https://console.firebase.google.com > **Create a project** (e.g. "football-app"). Google Analytics: off.
2. **Build > Authentication > Get started > Sign-in method > Google > Enable**, choose your support email, Save.
3. **Authentication > Settings > Authorized domains > Add domain**: `kevinwelling12.github.io`
4. **Build > Firestore Database > Create database**, location `us-west2 (Los Angeles)`, **production mode**.
5. Firestore > **Rules**: replace everything with the contents of `firestore.rules` in this repo, **Publish**.
6. **Project settings (gear) > General > Your apps > Web (</>)**, nickname "web", no Hosting, Register.
   Copy the `firebaseConfig` object it shows and send it to Claude (or paste it into `web/firebase-config.js` as
   `window.FIREBASE_CONFIG = { ... };`). These values are not secret; the rules protect the data.

Then open the site, Settings (gear) > **Sign in with Google**. Do the same on the other device.
Anything already saved on a device is merged into the cloud copy at first sign-in.
