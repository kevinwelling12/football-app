# Cloud sync setup

Project: **football-app-2627** (created 2026-10-13; config in `web/firebase-config.js`). Data lives at
`users/{uid}/app/state`, readable and writable only by that signed-in user (`firestore.rules`).

The console was redesigned in 2026: the product list sits behind the icons on the left; the search icon is the
quickest way to any product. To set up (or redo) a project:

1. Create the project. Spark (free) plan; Analytics off.
2. **Authentication** (search for it) > Get started > Sign-in method > **Google** > Enable.
3. Authentication > **Settings** > Authorized domains > add `kevinwelling12.github.io`.
4. **Firestore** > Create database, location `us-west2`, production mode.
5. Firestore > **Rules**: paste `firestore.rules`, Publish.
6. Gear > Project settings > Your apps > the web app: copy `firebaseConfig` into `web/firebase-config.js`.

Then on each device: Settings (gear) in the app > **Sign in with Google**. A device's saved entries merge into the
cloud copy at first sign-in.
