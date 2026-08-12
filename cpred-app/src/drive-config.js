// ── Google Drive integration: app credentials ────────────────────────
//
// Fill CLIENT_ID (and CLIENT_SECRET) in before cutting a build with Drive
// enabled. DRIVE-SETUP.md walks through the Google Cloud console steps that
// produce them — about ten minutes, once, for the whole app.
//
// Until CLIENT_ID is set the Drive option still appears in Storage settings,
// but reports "not configured" and nothing in the app ever contacts Google.
//
// On committing these to a public repo: an installed-app client is not a
// confidential client. Google's own docs note the desktop-app secret "is
// obviously not treated as a secret", which is exactly why the flow in
// drive.js uses PKCE — the code challenge, not the secret, is what stops
// another app from redeeming an intercepted authorization code. Anyone who
// copies these values still lands on a consent screen naming this app, and
// can only ever reach their own Drive.

module.exports = {
  // From Google Cloud → Credentials → OAuth client ID → type "Desktop app".
  // Format: twelve digits, a hyphen, ~32 characters, then the Google suffix.
  CLIENT_ID: '',

  // Google still requires this on the token exchange for Desktop clients even
  // when PKCE is used. Leave it empty and drive.js simply omits it, so if that
  // requirement is ever relaxed nothing here needs to change.
  CLIENT_SECRET: '',

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
