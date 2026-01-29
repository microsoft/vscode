@echo off
setlocal

echo System: %OS% %PROCESSOR_ARCHITECTURE%
powershell -NoProfile -Command "$mem = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; Write-Host ('Memory: {0:N0} GB' -f ($mem/1GB))"
powershell -NoProfile -Command "$disk = Get-PSDrive C; Write-Host ('Disk C: {0:N0} GB free of {1:N0} GB' -f ($disk.Free/1GB), (($disk.Used+$disk.Free)/1GB))"

set "UBUNTU_ROOTFS=%TEMP%\ubuntu-rootfs.tar.gz"
set "UBUNTU_INSTALL=%LOCALAPPDATA%\WSL\Ubuntu"

echo Checking if Ubuntu WSL is available
powershell -Command "wsl -d Ubuntu echo 'WSL is ready'" 2>nul
if errorlevel 1 call :install_wsl

set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe

echo Running sanity tests
node "%~dp0..\out\index.js" %*
goto :eof

:install_wsl
echo Ubuntu not found, installing via rootfs import

if not exist "%UBUNTU_ROOTFS%" (
    echo Downloading Ubuntu rootfs
    curl -L -o "%UBUNTU_ROOTFS%" https://cloud-images.ubuntu.com/wsl/jammy/current/ubuntu-jammy-wsl-amd64-ubuntu22.04lts.rootfs.tar.gz
)

echo Importing Ubuntu into WSL
mkdir "%UBUNTU_INSTALL%" 2>nul
wsl --import Ubuntu "%UBUNTU_INSTALL%" "%UBUNTU_ROOTFS%"

echo Starting WSL
wsl -d Ubuntu echo WSL is ready
goto :eof
