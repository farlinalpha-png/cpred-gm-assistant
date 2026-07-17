@echo off
setlocal
title CP:RED GM Assistant - Build Installer
echo ============================================
echo  CP:RED GM ASSISTANT - INSTALLER BUILD
echo ============================================
echo.

echo [Step 1] Checking for Node.js...
where node >nul 2>nul
if errorlevel 1 goto NONODE
for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo   Found Node.js %NODEVER%
echo.

echo [Step 2] Installing dependencies - output in install-log.txt
call npm install > install-log.txt 2>&1
if errorlevel 1 goto INSTALLFAIL
echo   Done.
echo.

echo [Step 3] Building the Windows installer - output in build-log.txt
echo   First build downloads packaging tools - 3-10 minutes.
call npm run build > build-log.txt 2>&1
if errorlevel 1 goto BUILDFAIL
echo.
echo ============================================
echo  SUCCESS - your installer is in the dist folder:
echo  dist\CP-RED GM Assistant Setup 2.0.0.exe
echo ============================================
echo.
pause
exit /b 0

:NONODE
echo.
echo   ERROR: Node.js is not installed or not on your PATH.
echo   1. Download the Windows Installer - LTS - from https://nodejs.org
echo   2. Run the installer with default settings
echo   3. Close this window, open a NEW one, run this script again.
echo.
pause
exit /b 1

:INSTALLFAIL
echo.
echo   ERROR: npm install failed. See install-log.txt for details.
echo   Usual causes: no internet, firewall, or antivirus blocking npm.
echo.
pause
exit /b 1

:BUILDFAIL
echo.
echo   ERROR: The installer build failed. See build-log.txt.
echo   Common fixes:
echo   - Run this script as Administrator - right-click, Run as administrator
echo   - If the log mentions "symbolic link" or "code signing", run:
echo       set CSC_IDENTITY_AUTO_DISCOVERY=false
echo     then run this script again in the same window
echo   - Make sure your antivirus is not quarantining electron-builder
echo.
pause
exit /b 1
