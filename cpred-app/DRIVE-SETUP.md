# Google Drive Setup

The app can keep characters and NPCs in Google Drive. Two ways, and only one of
them needs anything set up.

| | Needs Google Cloud setup? | Needs Drive for Desktop installed? |
|---|---|---|
| **A folder I choose** — point the store at `G:\My Drive\…` | No | Yes |
| **Google Drive** — the app talks to Drive itself | Yes, once, by whoever builds the app | No |

If you just want your characters in Drive on one machine that already has
Google Drive for Desktop, **use "A folder I choose" and stop reading here** —
open **Storage** in the top bar, pick the folder, done.

The rest of this file is for building a release with the built-in Drive option
enabled. You only do it once, for the whole app.

---

## What players have to do

Nothing. Players never touch Google.

The GM app is the only thing that talks to Drive. When you click **Host
Session**, players connect to your app over the local network exactly as they
always have, and the characters they see are the ones in your store. No Google
account, no sign-in, no internet needed at the table.

---

## Setting up the Google Cloud project

About ten minutes. You need a Google account; a personal one is fine.

### 1. Make a project

1. Go to <https://console.cloud.google.com/projectcreate>
2. Name it something like `CPRED GM Assistant`, click **Create**
3. Make sure it's selected in the project dropdown at the top

### 2. Turn on the Drive API

1. Go to <https://console.cloud.google.com/apis/library/drive.googleapis.com>
2. Click **Enable**

### 3. Configure the consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. User type: **External**, then **Create**
3. Fill in the required fields — app name (`CP:RED GM Assistant`), your email
   for both support and developer contact. Everything else can stay blank.
4. On the **Scopes** step, click **Add or remove scopes**, and add:

   ```
   https://www.googleapis.com/auth/drive.file
   ```

   Only that one. It lets the app touch **files it created itself** and nothing
   else in the GM's Drive — the app cannot even list their other files. It is
   also a *non-sensitive* scope, which is the reason this whole thing is a
   ten-minute job: sensitive scopes like `drive` or `drive.readonly` drag you
   into Google's verification review, with a privacy policy, a homepage and a
   recorded demo video. Don't widen it.

5. Save and continue through the remaining steps.

### 4. Publish it

Still on **OAuth consent screen**, click **Publish app** and confirm.

This matters. While the app is in **Testing**:

- only Google accounts you manually add as test users can sign in (100 max), and
- **refresh tokens expire after 7 days**, so every GM gets kicked out weekly.

Publishing to **Production** fixes both. Because `drive.file` is non-sensitive,
publishing does *not* put you in a review queue — the button just works.

Users will still see an "unverified app" interstitial on the consent screen
(**Advanced → Go to CP:RED GM Assistant**). That's expected for an unverified
app and doesn't limit anything.

### 5. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Application type: **Desktop app**
3. Name it, click **Create**
4. Copy the **Client ID** and **Client secret**

You don't need to register a redirect URI. The app listens on a random loopback
port and Google allows any port for a loopback redirect.

### 6. Put them on your machine

Credentials go in an untracked file, **not** in `drive-config.js`. Copy the
template and fill it in:

```bash
cd cpred-app/src && cp drive-secrets.local.example.js drive-secrets.local.js
```

Then edit `drive-secrets.local.js` and paste your two values into `CLIENT_ID`
and `CLIENT_SECRET`.

`.gitignore` keeps that file out of git, so the values stay on your machine and
cannot ride along in a commit. `drive-config.js` reads it when present; without
it, `CLIENT_ID` is empty, the Drive option shows "not configured", and the app
never contacts Google.

Then rebuild. electron-builder's `src/**/*` glob **does** include the local
file, so a build made on this machine ships with Drive enabled — the values
reach the installer without ever reaching the repo.

#### Why not just commit them?

A "Desktop app" client is not a confidential client — Google's own
documentation says the desktop client secret "is obviously not treated as a
secret", because anyone can extract it from an installed binary anyway. That is
precisely why the sign-in flow in `src/drive.js` uses **PKCE**: the per-attempt
code challenge, not the secret, is what stops an intercepted authorization code
from being redeemed by someone else. So committing them would not be a
catastrophe.

But GitHub's secret scanning blocks the push regardless, and it is right to —
"not confidential" is not the same as "publish it". Someone who copies your
client ID can stand up an app whose consent screen wears **your** app's name.
Keeping the values in an untracked file costs one `cp` and avoids the whole
argument. If a real credential ever does reach a commit, rotate it: delete the
client in the console and issue a new one.

---

## How it behaves

**The local folders stay the working copy.** Every read in the app — your
roster, the session tracker, and everything the host server hands to players —
comes off the local disk. Drive is a mirror that gets pushed to after a save and
pulled from every 90 seconds.

That's deliberate: a save is never waiting on the network, hosting a session
runs at LAN speed, and if the Wi-Fi dies mid-firefight the whole app keeps
working. Edits queue up and go out when the connection comes back.

**Conflicts resolve newest-wins**, by each character's own `updatedAt` — the
same rule the app already applies to sheets uploaded from a player's tablet. So
a character edited on your laptop, on a player's phone, and on a second machine
all settle the same way.

**In Drive, characters land in:**

```
CP:RED GM Assistant/
├── pcs/    Rache Bartmoss_1699887.json
└── npcs/   Mook_1699912.json
```

One file per character, matching the on-disk layout. They're plain JSON — you
can open, back up, or copy them out by hand.

**Signing out** leaves both copies alone: characters on the PC stay, and the
files in Drive stay. Deleting a character *in the app* while Drive mode is on
does delete its Drive copy, so it doesn't come back on the next sync.

---

## If something goes wrong

**"Google Drive is not configured in this build"** — `CLIENT_ID` in
`src/drive-config.js` is empty. See step 6.

**"Google sign-in expired — connect Drive again"** — the grant was revoked, or
the consent screen is still in *Testing* and the 7-day refresh token ran out.
See step 4. Click **Connect Google Drive** again.

**"Google did not return a refresh token"** — Google only issues one on first
consent. Remove the app at
<https://myaccount.google.com/permissions> and connect again.

**Error 400: redirect_uri_mismatch** — the OAuth client is the wrong type.
It must be **Desktop app**, not Web application.

**Sign-in page never opens** — the app opens your default browser on purpose;
Google blocks OAuth inside embedded windows. Check that a default browser is
set.

**Characters aren't syncing** — open **Storage**. It shows the signed-in
account, when the last sync ran, how many edits are queued, and the actual
error if there is one. **Sync now** forces a round trip.
