@echo off
setlocal
cd /d "%~dp0"
echo.
echo  SEOUL SNACK ATTACK - QUICK START
echo  =================================
echo  [1] Play                 The current game
echo  [2] Previous Expanse     The earlier city for comparison
echo  [3] Classic circuit      The small procedural night city
echo  [4] Stunt Delivery Prototype - two Blender test blocks
echo.
echo  Everything else - map review, mobile test, city plan, cockpit -
echo  lives in the in-game ` menu, or run:  npm run quickstart -- --launch=NAME
echo.
choice /C 1234 /N /T 15 /D 1 /M "Choose 1-4 [default: 1 in 15 seconds]: "
rem Capture the choice immediately: a later `set` resets %ERRORLEVEL% to 0, so
rem reading it after "set PROFILE=..." made every option fall through to [1].
set "CHOICE=%ERRORLEVEL%"
set "PROFILE=expanse"
if "%CHOICE%"=="2" set "PROFILE=expanse-legacy"
if "%CHOICE%"=="3" set "PROFILE=classic"
if "%CHOICE%"=="4" set "PROFILE=stunt"
echo.
node tools\quickstart.mjs --launch=%PROFILE% --restart
echo.
echo  ---------------------------------------------------------------
echo  Quick Start has finished. This window stays open so you can
echo  read any messages above. Close it when you are done.
echo  ---------------------------------------------------------------
pause
