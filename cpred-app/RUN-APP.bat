@echo off
setlocal
title CP:RED GM Assistant - Run
echo ============================================
echo  CP:RED GM ASSISTANT - QUICK RUN
echo ============================================
echo.

echo [Step 1] Checking for Node.js...
where node >nul 2>nul
if errorlevel 1 goto NONODE

for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo   Found Node.js %NODEVER%

echo [Step 2] Checking for npm...
where npm >nul 2>nul
if errorlevel 1 goto NONPM
echo   Found npm.
echo.

if exist node_modules\electron goto RUNAPP

echo [Step 3] First run - installing dependencies.
echo   This downloads Electron - it may take 2-5 minutes.
echo   Output is saved to install-log.txt
echo.
call npm install > install-log.txt 2>&1
if errorlevel 1 goto INSTALLFAIL
echo   Dependencies installed.
echo.

:RUNAPP
echo [Step 4] Starting CP:RED GM Assistant...
call npm start
if errorlevel 1 goto RUNFAIL
goto END

:NONODE
echo.
echo   ERROR: Node.js is not installed or not on your PATH.
echo   1. Download the Windows Installer - LTS - from https://nodejs.org
echo   2. Run the installer and accept the defaults
echo   3. IMPORTANT: Close this window and open a NEW one afterward,
echo      then run RUN-APP.bat again.
echo.
pause
exit /b 1

:NONPM
echo.
echo   ERROR: npm was not found even though Node.js is present.
echo   Re-install Node.js from https://nodejs.org and make sure
echo   "Add to PATH" stays checked during install.
echo.
pause
exit /b 1

:INSTALLFAIL
echo.
echo   ERROR: npm install failed. Common causes:
echo   - No internet connection or a firewall/proxy blocking npm
echo   - Corporate antivirus blocking the Electron download
echo.
echo   The full error is in install-log.txt - open it in Notepad
echo   and check the last 20 lines.
echo.
pause
exit /b 1

:RUNFAIL
echo.
echo   ERROR: The app failed to start. Try:
echo   1. Delete the node_modules folder
echo   2. Run RUN-APP.bat again for a clean install
echo.
pause
exit /b 1

:END
endlocal
