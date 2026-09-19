@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\blender\mcp\launch.ps1" -Show
if errorlevel 1 pause
