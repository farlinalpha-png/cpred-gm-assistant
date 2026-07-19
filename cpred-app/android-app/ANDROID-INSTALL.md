# CP:RED Player Companion — Android Install Guide

The Player Companion is a full player-mode app: the complete Characters flow
(creation wizard with pregens/templates, Identity / Stats & Skills / Lifepath /
Full Sheet), the equipment database, and the offline rules lookup — everything
works with no internet and no GM. When connected to a GM host it also shows the
characters loaded on the host so each player can pick which one is theirs and
edit it live, with changes syncing both ways.

There are three ways to get it onto an Android phone or tablet. **Option A is
the easiest at the game table. Option B is the easiest if you just want the app
on your device with zero setup.**

---

## Option A — Install from the GM's session (recommended at the table)

What you need: the GM's PC/Mac running the GM Assistant, and your Android
device **on the same Wi-Fi network**.

1. **GM:** open the CP:RED GM Assistant and click **HOST SESSION** in the top
   bar. A panel shows the host address — something like `192.168.1.42:8045`.
   Write it down / read it out.
   - *Windows may ask to allow the app through the firewall the first time —
     click Allow, or players won't be able to connect.*
2. **Player:** on the Android device, open **Chrome** and type the address into
   the URL bar exactly as shown, with `http://` in front:
   `http://192.168.1.42:8045`
3. The Player Companion loads. Tap the Chrome menu (**⋮** top-right) →
   **Add to Home screen** → **Add**.
4. An app icon appears on your home screen. Launching it opens the app
   fullscreen like a native app.

Notes:
- Your characters are stored **on your device**, not the GM's PC — closing the
  app or losing Wi-Fi doesn't lose anything.
- The icon needs the GM host reachable the *first* time it loads after being
  added. At the table this is exactly when you'd use it anyway.

### Picking your character from the GM's roster
1. In the app, open the **GM SYNC** tab.
2. Enter the same host address (`192.168.1.42:8045`) and tap **Connect**.
3. A **Characters On Host** list appears. Tap **▶ Play This Character** next to
   yours — it copies to your device and opens the Full Sheet.
4. From then on your edits sync to the GM (and the GM's edits sync back) every
   few seconds while connected. If the connection drops, keep playing — it
   re-syncs automatically when the host is reachable again.

---

## Option B — Single file, fully offline, no GM needed

What you need: the file `CPRED-Player-OneFile.html` (in the app's
`android-app` folder, also attached to GitHub releases). The **entire app** —
gear database, rules, character storage — is inside this one file.

1. Get the file onto the device any way you like:
   - **Google Drive:** upload it from the PC, open the Drive app on Android,
     tap the file → ⋮ → **Download**.
   - **Email:** email it to yourself, open the attachment, **Download**.
   - **USB cable:** copy it to the device's `Download` folder.
2. On the device, open the **Files** app (or "My Files"), go to **Downloads**,
   and tap `CPRED-Player-OneFile.html`.
3. If asked which app to open it with, choose **Chrome**.
4. In Chrome: menu (**⋮**) → **Add to Home screen** → **Add**.

That's it — no internet needed ever again. You can still connect to a GM later
from the GM Sync tab whenever you're on the GM's network.

---

## Option C — True installed app (PWA, for the tech-inclined)

Chrome only offers its full "Install app" experience (own window, app drawer
entry, offline service worker) over **HTTPS**. If you want that:

1. Host the contents of the `android-app/` folder on any HTTPS static host —
   **GitHub Pages is free**: push the folder to a repo, enable Pages in repo
   Settings, and note the URL.
2. Visit that URL in Chrome on the Android device.
3. Chrome shows an **Install app** prompt (or use ⋮ → **Install app**).
4. The app installs like a Play Store app: appears in the app drawer, opens in
   its own window, and works fully offline afterwards.

---

## Frequently hit snags

| Problem | Fix |
|---|---|
| "Site can't be reached" on the tablet | Confirm both devices are on the **same Wi-Fi**, the GM clicked **Host Session**, and you typed `http://` (not `https://`) |
| Firewall prompt was dismissed on the GM PC | Windows Security → Firewall → Allow an app → allow the CP:RED GM Assistant (or re-run Host Session and accept) |
| Add to Home screen missing | Make sure you're in **Chrome**, not a "lite" or in-app browser; update Chrome |
| Characters gone after clearing Chrome data | Browser storage was wiped — use **Export JSON** from the character view for backups, and **⇧ Upload to GM** so the GM's PC has a copy |
| Keyboard zooms the page on input | Fixed in current versions (16px inputs on touch devices) — re-add from the host if your copy is older |

## Where's my data? Backups?

Characters live in Chrome's local storage on the device. Two backup paths:
- **Export JSON** (character view) — saves a `.json` file to Downloads; import
  it later on any device with the **Import** button.
- **⇧ Upload to GM** — pushes the character into the GM's roster folder on
  their PC, where it's saved as a real file.
