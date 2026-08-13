// Template for drive-secrets.local.js — copy this file to that name, in this
// same folder, and paste your own values in.
//
//   cp drive-secrets.local.example.js drive-secrets.local.js
//
// The copy is gitignored, so what you put in it stays on your machine. This
// example is tracked, and must never hold real values.
//
// DRIVE-SETUP.md has the Google Cloud walkthrough that produces them. Use an
// OAuth client of type "Desktop app".

module.exports = {
  // Twelve digits, a hyphen, ~32 characters, then .apps.googleusercontent.com
  CLIENT_ID: '',

  // Starts with GOCSPX-. Required by Google on the token exchange for Desktop
  // clients even though PKCE is what actually secures the flow.
  CLIENT_SECRET: ''
};
