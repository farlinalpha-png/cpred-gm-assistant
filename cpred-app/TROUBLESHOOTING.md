# Troubleshooting — CP:RED GM Assistant

## Fixed in v2.0.1
The original `RUN-APP.bat` and `BUILD-INSTALLER.bat` had a batch-script bug
(an unescaped parenthesis inside an `if` block) that made both scripts stop
at "Press any key to continue" **even when nothing was wrong**. If you saw
that behavior, this version fixes it. Delete the old folder and use this one.

---

## Quick checklist

1. **Extract the ZIP first.** Don't run the .bat files from inside the ZIP
   window — right-click the ZIP → Extract All → open the extracted folder.

2. **Install Node.js (one time).**
   - Go to https://nodejs.org and download the **LTS** Windows Installer (.msi)
   - Run it with all default options
   - **Close any open Command Prompt windows afterward** — PATH changes only
     apply to new windows

3. **Double-click `RUN-APP.bat`.**
   - First run downloads Electron (~100 MB) — takes 2–5 minutes
   - The window now reports each step and writes `install-log.txt` if
     anything fails

## If it still fails

| Symptom | Fix |
|---|---|
| "Node.js is not installed or not on your PATH" but you installed it | Open a **new** Command Prompt and type `node --version`. If that fails, re-install Node.js and keep "Add to PATH" checked. Reboot if needed. |
| npm install fails / install-log.txt shows network errors | A firewall, VPN, proxy, or antivirus is blocking npm or the Electron download from GitHub. Try a different network, or temporarily pause the antivirus. |
| npm install fails with EPERM / access denied | Right-click the .bat file → **Run as administrator**, or move the folder out of Program Files / OneDrive-synced folders into something like `C:\cpred-app`. |
| Build succeeds but `dist` has no .exe | Open `build-log.txt`. If it mentions **code signing**, open Command Prompt in the folder and run:<br>`set CSC_IDENTITY_AUTO_DISCOVERY=false`<br>`npm run build` |
| Build fails mentioning **symbolic links** | Run `BUILD-INSTALLER.bat` as administrator, or enable Windows Developer Mode (Settings → Privacy & security → For developers). |
| App window opens then closes instantly | Delete the `node_modules` folder and run `RUN-APP.bat` again for a clean install. |

## Manual fallback (no scripts)

Open Command Prompt in the extracted folder and run:

```
npm install
npm start
```

Whatever error appears on screen is the real cause — the scripts just wrap
these two commands.

## Verifying your environment

```
node --version    → should print v18.x or higher
npm --version     → should print 9.x or higher
```
