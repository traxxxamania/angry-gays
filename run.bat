@echo off
title Angry Swine (Vite)
cd /d "%~dp0"

rem -- dev server already running? just open the browser
netstat -ano | findstr ":8123.*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Game is already running - opening browser...
  start "" "http://localhost:8123"
  exit /b
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run - installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo  Angry Swine - starting at http://localhost:8123
echo  Close this window to stop the game.
echo.
rem -- "npm run dev" opens the browser itself (vite --open)
npm run dev
pause
