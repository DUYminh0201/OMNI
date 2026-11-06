@echo off
chcp 65001 >nul
set ELECTRON_RUN_AS_NODE=
taskkill /F /IM "Omnira Studio.exe" >nul 2>&1
ping 127.0.0.1 -n 2 >nul
if exist "%~dp0runtime\Omnira Studio.exe" (
    start "" "%~dp0runtime\Omnira Studio.exe" --hidden --open-http
) else if exist "%~dp0my app\node_modules\electron\dist\electron.exe" (
    cd /d "%~dp0my app"
    start "" "%~dp0my app\node_modules\electron\dist\electron.exe" . --hidden --open-http
) else (
    cd /d "%~dp0my app"
    start "Omnira Studio Web Server" node out/main/index.js --hidden --open-http
)
