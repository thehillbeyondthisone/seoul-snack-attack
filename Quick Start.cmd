@echo off
setlocal
cd /d "%~dp0"
echo.
echo  SEOUL SNACK ATTACK - QUICK START
echo  =================================
echo  [1] Play                 The current game
echo  [2] Play the rebuild     Work in progress: the new full-size city
echo  [3] Classic circuit      The small procedural night city
echo.
echo  Everything else - map review, mobile test, city plan, cockpit -
echo  lives in the in-game ` menu, or run:  npm run quickstart -- --launch=NAME
echo.
choice /C 123 /N /T 15 /D 1 /M "Choose 1-3 [default: 1 in 15 seconds]: "
set "PROFILE=expanse"
if "%ERRORLEVEL%"=="2" set "PROFILE=expanse2"
if "%ERRORLEVEL%"=="3" set "PROFILE=classic"
echo.
node tools\quickstart.mjs --launch=%PROFILE% --restart
echo.
echo  ---------------------------------------------------------------
echo  Quick Start has finished. This window stays open so you can
echo  read any messages above. Close it when you are done.
echo  ---------------------------------------------------------------
pause
