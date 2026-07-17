# CP:RED Player Companion — Android Tablet Install

Three ways to get it on the tablet, easiest first.

## Option A — Install from the GM host (recommended at the table)
1. GM opens the GM Assistant and clicks **Host Session** (top bar). It shows
   an address like `192.168.1.42:8045`.
2. On the tablet (same Wi-Fi), open **Chrome** and go to `http://192.168.1.42:8045`
3. Chrome menu (⋮) → **Add to Home screen** → Add.
4. An app icon appears on the home screen. It opens fullscreen like an app,
   and characters are stored on the tablet itself.

Note: over plain HTTP the icon is a shortcut (needs the address reachable to
load the first time); once loaded, character data lives on the tablet either way.

## Option B — Fully offline, no GM needed (single file)
1. Copy **CPRED-Player-OneFile.html** onto the tablet (USB, email, Drive,
   or any file transfer).
2. Open it with Chrome (from the Files app: tap the file → open with Chrome).
3. Chrome menu (⋮) → **Add to Home screen**.
Everything — the full gear database, rules lookup, character storage — is
inside the one file. No internet, no GM, no install tools.

## Option C — True installed PWA (offline app with icon, auto-updating)
Host the `android-app/` folder on any HTTPS site (GitHub Pages is free):
1. Put the folder contents on the HTTPS host.
2. Visit the URL in Chrome on the tablet.
3. Chrome will offer **Install app** (or ⋮ → Install app).
This gives the full installed-app experience: offline via service worker,
its own window, appears in the Android app drawer.

## Syncing with the GM from the tablet
Open the app → **GM Sync** tab → enter the GM address (e.g. `192.168.1.42:8045`)
→ Connect. Edits sync both ways every few seconds while connected and keep
working offline otherwise.

## Where's my data?
Characters save in the browser storage on the tablet. Use **Export JSON**
regularly for backups (files land in Downloads), and **Upload to GM** to
push a character to the GM's roster.
