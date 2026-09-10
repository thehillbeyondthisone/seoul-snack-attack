@echo off
setlocal
cd /d "%~dp0"
echo.
echo  SEOUL SNACK ATTACK - QUICK START
echo  =================================
echo  [1] Play Seoul Expanse       Recommended current build
echo  [2] Review complete map      Daylight overview with stats
echo  [3] Test mobile performance  Expanse mobile budget with stats
echo  [4] Play the new city        Procedural night circuit (current default)
echo  [5] Review the city plan     Rebuild in progress: streets, blocks, lots
echo  [6] Drive the rebuild        Rebuild M4: dressed city, not yet the game
echo.
choice /C 123456 /N /T 15 /D 1 /M "Choose 1-6 [default: 1 in 15 seconds]: "
set "PROFILE=expanse"
if "%ERRORLEVEL%"=="2" set "PROFILE=expanse-review"
if "%ERRORLEVEL%"=="3" set "PROFILE=expanse-mobile"
if "%ERRORLEVEL%"=="4" set "PROFILE=classic"
if "%ERRORLEVEL%"=="5" set "PROFILE=plan"
if "%ERRORLEVEL%"=="6" set "PROFILE=expanse2"
echo.
node tools\quickstart.mjs --launch=%PROFILE% --restart
echo.
echo  ---------------------------------------------------------------
echo  Quick Start has finished. This window stays open so you can
echo  read any messages above. Close it when you are done.
echo  ---------------------------------------------------------------
pause
