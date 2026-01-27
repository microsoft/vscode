@echo off
setlocal

echo Ensuring WSL with Ubuntu is installed
wsl --install -d Ubuntu --no-launch

echo Starting WSL
wsl -d Ubuntu echo WSL is ready

set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe

echo Running sanity tests
node "%~dp0..\out\index.js" %*
