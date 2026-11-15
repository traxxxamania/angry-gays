@echo off
cd /d "%~dp0"
start "Sling Lab local server" node server.mjs
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:4173
