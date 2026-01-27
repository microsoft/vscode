@echo off
setlocal

echo Starting WSL if available
wsl -d Ubuntu echo WSL is ready 2>nul
if errorlevel 1 (
    echo Ubuntu not found, installing via rootfs import

    set "UBUNTU_ROOTFS=%TEMP%\ubuntu-rootfs.tar.gz"
    set "UBUNTU_INSTALL=%LOCALAPPDATA%\WSL\Ubuntu"

    if not exist "%UBUNTU_ROOTFS%" (
        echo Downloading Ubuntu rootfs
        curl -L -o "%UBUNTU_ROOTFS%" https://cloud-images.ubuntu.com/wsl/jammy/current/ubuntu-jammy-wsl-amd64-ubuntu22.04lts.rootfs.tar.gz
    )

    echo Importing Ubuntu into WSL
    mkdir "%UBUNTU_INSTALL%" 2>nul
    wsl --import Ubuntu "%UBUNTU_INSTALL%" "%UBUNTU_ROOTFS%"

    echo Starting WSL
    wsl -d Ubuntu echo WSL is ready
)

set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe

echo Running sanity tests
node "%~dp0..\out\index.js" %*
