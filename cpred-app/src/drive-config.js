// ── Google Drive integration: app credentials ────────────────────────
//
// The real client ID and secret do NOT live in this file. They go in
// drive-secrets.local.js beside it, which .gitignore keeps out of git so a
// credential can never ride along in a commit. Copy
// drive-secrets.local.example.js to drive-secrets.local.js and fill it in;
// DRIVE-SETUP.md walks through the Google Cloud console steps that produce
// the values — about ten minutes, once, for the whole app.
//
// With no such file present CLIENT_ID stays empty: the Drive option still
// appears in Storage settings, reports "not configured", and nothing in the
// app ever contacts Google.
//
// electron-builder's "src/**/*" glob does pick the local file up, so a build
// produced on a machine that has one ships with Drive enabled. That is the
// intended way to cut a release with credentials baked in — the values reach
// the installer without ever reaching the repo.

// Absent on a fresh clone, and that is a supported state, not an error. Any
// other failure (a syntax error in the local file, say) still throws, because
// silently falling back to "not configured" would be a confusing way to learn
// you had fat-fingered a quote.
let local = {};
try { local = require('./drive-secrets.local.js') || {}; }
catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

module.exports = {
  // From Google Cloud → Credentials → OAuth client ID → type "Desktop app".
  // Format: twelve digits, a hyphen, ~32 characters, then the Google suffix.
  CLIENT_ID: local.CLIENT_ID || '',

  // Google still requires this on the token exchange for Desktop clients even
  // when PKCE is used. Leave it empty and drive.js simply omits it, so if that
  // requirement is ever relaxed nothing here needs to change.
  CLIENT_SECRET: local.CLIENT_SECRET || '',

  // Least privilege: drive.file grants access only to files this app itself
  // creates. The rest of the GM's Drive stays invisible to it — the app
  // literally cannot list or read anything it did not make.
  //
  // It is also a non-sensitive scope, so the consent screen can be published
  // to Production without Google's verification review. Widening this to
  // 'drive' or 'drive.readonly' would trigger that review; don't, unless you
  // are ready for it.
  SCOPE: 'https://www.googleapis.com/auth/drive.file',

  // Top-level folder created in the GM's Drive. pcs/ and npcs/ live inside it,
  // mirroring the on-disk store one-for-one.
  ROOT_FOLDER: 'CP:RED GM Assistant',

  // How often to pull remote changes while Drive mode is active, in ms.
  POLL_MS: 90000
};
