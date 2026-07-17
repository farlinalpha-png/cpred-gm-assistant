# CP:RED GM Assistant v2.0

A complete Cyberpunk RED tabletop RPG desktop application for Windows featuring:

- **Character Creation & Management** — Pre-generated, template, or full custom character creation with an 8-step wizard
- **Character Portraits** — Upload images for your characters
- **Equipment Browsers** — Searchable databases for Weapons, Armor, Cyberware, Gear, and Netrunning programs, all sourced from official Cyberpunk RED DLCs
- **Save / Load / Export** — Save characters as `.cpred` files, export to PDF or JSON, print character sheets
- **Session Tracker** — Live HP, Humanity, wounds, eddies, luck points, critical injuries, and addictions tracking
- **AI-Powered GM Tools** — NPC Generator, Encounter Generator, and Rules Quick Reference (requires internet)
- **Bundled Source Files** — All 21 source markdown files included in `assets/source-files/`

---

## ⚡ Quick Start (No Install)

1. Install [Node.js LTS](https://nodejs.org) if you don't have it
2. Double-click **`RUN-APP.bat`**
3. The app opens directly — no installer needed

## 📦 Build the Windows Installer

1. Install [Node.js LTS](https://nodejs.org) if you don't have it
2. Double-click **`BUILD-INSTALLER.bat`**
3. Wait for the build (2-5 minutes first time)
4. Find your installer in the `dist\` folder: **`CP-RED GM Assistant Setup 2.0.0.exe`**
5. Run the installer — it creates Desktop and Start Menu shortcuts

The installer is a standard NSIS package: choose your install directory, and uninstall cleanly from Windows Settings.

---

## 🎮 Using the App

### Character Creation
1. Click **Characters** in the top navigation
2. The **Creation** wizard walks you through 8 steps:
   - **Method** — Pre-Generated (6 ready-to-play characters), Template (role-based recommended builds), or Full Custom
   - **Role** — All 10 Cyberpunk RED roles with descriptions
   - **Identity** — Name, handle, age, aliases, reputation, starting eddies
   - **Stats** — 62-point distribution with live derived stats (HP, Death Save, Humanity)
   - **Skills** — All 60+ skills from the official character sheet, organized by category, with 86-point budget and (x2) cost tracking
   - **Lifepath** — Full lifepath tables with dice-roll randomization
   - **Gear** — Role-appropriate starting equipment
   - **Done** — Summary and jump to full sheet

### Equipment Sections (left sidebar)
- **Weapons** — Browse by category (Pistols, SMGs, Shotguns, Rifles, Melee, Exotic), search, one-click equip. Includes gear from 12 Days of Gunmas, Black Chrome+, 12 Days of Cutiemas, and Micro Chrome
- **Armor** — Full armor table with SP values and penalties. Click to equip to head/body/shield slots
- **Cyberware** — Organized by body location (Neural, Eyes, Audio, Arms, Legs, Internal, External, Fashionware, Borgware) with automatic Humanity Loss tracking
- **Gear** — Agents, Apps, Medical, Stealth & Infiltration (from Going Quiet), Combat Gear, Vehicles, Lifestyle
- **Netrunning** — Cyberdeck config, program loadout, Attack/Defense/Utility programs and Black ICE database

### Character Management (top bar)
- **+ New** — Start a fresh character
- **Load** — Open a saved `.cpred` or `.json` file
- **Save** — Save to a `.cpred` file anywhere on disk
- **PDF** — Export a printable character sheet as PDF
- **JSON** — Export raw character data
- **Print** — Print the current view

### GM Tools (top navigation)
- **NPC Generator** — AI-generated NPCs by role, affiliation, district, and disposition. Save to a persistent roster
- **Encounters** — AI-generated tactical encounters with terrain, enemies, complications, DVs, and loot
- **Quick Ref** — Ask any Cyberpunk RED rules question

> **Note:** AI features require an internet connection.

---

## 📁 Project Structure

```
cpred-app/
├── BUILD-INSTALLER.bat    ← Build the Windows installer
├── RUN-APP.bat            ← Run app directly (testing)
├── package.json           ← Build configuration
├── src/
│   └── main.js            ← Electron main process (file I/O, PDF export)
├── public/
│   ├── index.html         ← Application shell
│   ├── app.js             ← Application logic
│   └── data.js            ← Complete gear/lifepath/character database
└── assets/
    ├── icon.ico           ← App icon
    ├── icon.png
    └── source-files/      ← All 21 bundled source markdown files
        ├── Black_Chrome_Plus.md
        ├── Going_Quiet.md
        ├── Night_City_Atlas.md
        └── ... (18 more)
```

## 🛠 Requirements

- **To build/run from source:** Node.js 18+ (LTS recommended)
- **Built installer:** Windows 10/11 x64, no other requirements

## Data Sources

All equipment data extracted from official R. Talsorian Games Cyberpunk RED content:
Core Rulebook tables, Black Chrome+, 12 Days of Gunmas, 12 Days of Cutiemas,
Micro Chrome, All About Agents, Going Quiet, Must Have Cyberware Deals,
Night City Atlas, and more.

*Cyberpunk RED is a trademark of R. Talsorian Games. This is a fan-made utility.*

## v2.2 Changelog
- **Offline rules lookup**: Quick Ref now searches 36 official rulings extracted from the Corebook RED FAQ, Old Guns, and Black Chrome source files FIRST — instant, no internet needed. AI oracle remains as fallback.
- **Fully editable character sheet**: every field on the Full Sheet (name, handle, role, age, rep, eddies, all 10 stats, current HP, all 60+ skill levels, armor slots and SP, weapon ammo/notes, cyberware, vehicle SDP, gear quantities, full lifepath, notes) is now inline-editable and auto-saves.
- **Weapon Attachments**: new sub-section in the Weapons browser (Extended/Drum Magazine, Smartgun Link, scopes, silencer, etc.) with the 3-slot rule from Old Guns.
- **2020 weapon conversion**: the full Old Guns Never Die 6-step conversion procedure is searchable in Quick Ref.
- **CBK / Night Market rules** from Black Chrome added to the rules database.

## v2.3 Changelog — Master Gear Reference Integration
- Integrated CPRED_Master_Gear_Reference_v2.xlsx: 82 weapons, 61 cyberware, 33 vehicles, 25 agents, 25 gear items, 22 armor pieces
- New "◆" categories in every equipment browser hold the master catalog entries with company, quality, magazine, and skill data
- Vehicles now include Nomad Access ranks from the spreadsheet (which Moto rank can requisition each vehicle)
- M.R.A.M.A.Z.E. Loot Box roller added to the Encounters panel (d10 box + d6 contents)
- Salvaging DVs, Flash of Luck costs, economy/selling rules, and all 28 achievements added to the offline rules database

## v3.0 Changelog — Player Companion & Live Sessions
- **Player Companion App** (player-app/player.html): standalone offline character app for players with equipment (incl. custom items + upgrades), offline rules lookup, JSON import/export
- **GM hosting**: "Host Session" button starts a LAN server; players connect by address (or open it in a browser). Character edits sync both ways every 4s, last-write-wins, offline-safe
- **Player upload**: players can push characters straight into the GM's roster
- **Custom equipment everywhere**: every equipment section in both apps has "Add Custom" with matching stat fields per type
- **Upgrades/options on all equipment**: weapons (attachment DB), armor, cyberware (option picker), vehicles (upgrade DB) — plus "Add Other" custom upgrade rows that save to the sheet
- **NPC generator repaired**: works offline via procedural generator (AI optional with your own API key); manual NPC form (Name, Role, Stats, weapons, armor; +netrunning section for Netrunners)
- **Folder-based characters**: PCs auto-save to characters/pcs, NPCs to characters/npcs under the app data folder; session tracker loads both, tags PC/NPC, and can point at any folder of character JSONs

## v3.1 Changelog — Android Tablet Support
- android-app/ folder: installable PWA for Android tablets (manifest, service worker, icons, touch-optimized UI, 16px inputs to prevent zoom-on-focus)
- GM host now serves the tablet app: players browse to the host address on Android and "Add to Home screen"
- CPRED-Player-OneFile.html: fully self-contained single file (entire database + rules + logic inlined) for offline use with no GM and no hosting — copy to tablet, open in Chrome
- ANDROID-INSTALL.md: three install paths (GM host / single file / HTTPS PWA)

## v3.2 Changelog — Fixes
- NPC generator output now has both "Save to Roster" and "→ Send To Session Tracker" (saves the NPC and drops you into the tracker with it loaded)
- Cyberware options are foundation-filtered: Interface Plugs/Sandevistan/etc. only appear as options on a Neural Link; Cybereye options on Cybereyes; likewise Cyberaudio/Cyberarm/Cyberleg. Non-foundation pieces say so and offer custom-only
- "Add Other" upgrade fixed in both apps: Electron doesn't support window.prompt(), so it silently failed — replaced with inline Name + Effect fields and a Save To Sheet button
