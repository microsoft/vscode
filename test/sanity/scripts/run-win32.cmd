@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[int](Get-CimInstance Win32_Processor).Architecture"') do set ARCH=%%a
if "%ARCH%"=="12" (set "ARCH_NAME=ARM64") else if "%ARCH%"=="9" (set "ARCH_NAME=AMD64") else if "%ARCH%"=="5" (set "ARCH_NAME=ARM") else (set "ARCH_NAME=x86")

echo System: %OS% %ARCH_NAME%
powershell -NoProfile -Command "$os = Get-CimInstance Win32_OperatingSystem; $total = $os.TotalVisibleMemorySize/1MB; $free = $os.FreePhysicalMemory/1MB; Write-Host ('Memory: {0:N0} GB free of {1:N0} GB' -f $free, $total)"
powershell -NoProfile -Command "$disk = Get-PSDrive C; Write-Host ('Disk C: {0:N0} GB free of {1:N0} GB' -f ($disk.Free/1GB), (($disk.Used+$disk.Free)/1GB))"

echo Checking if WSL is installed
where wsl >nul 2>nul
if errorlevel 1 (
    echo WSL is not installed, skipping WSL setup
) else (
    REM Without this, current wsl.exe writes UTF-16 to redirected output, which the Ubuntu checks can't match.
    set "WSL_UTF8=1"

    if "%ARCH%"=="9" call :install_wsl

    echo Checking if Ubuntu is available on WSL
    powershell -NoProfile -Command "if ((wsl -l -q) -contains 'Ubuntu') { exit 0 } else { exit 1 }"
    if errorlevel 1 call :install_ubuntu

    echo Ensuring Ubuntu runs with WSL2
    REM Converting a distribution that already runs on WSL2 fails, so only convert it when needed.
    powershell -NoProfile -Command "if ((wsl -l -v) -replace [char]0, '' -match '^[*]?\s*Ubuntu\s+\S+\s+2\s*$') { exit 0 } else { exit 1 }"
    if errorlevel 1 (
        call :run_wsl --set-version Ubuntu 2
        if errorlevel 1 (
            echo WARNING: Failed to switch Ubuntu to WSL2. WSL1 fallback workaround will be used for Node 24 server binaries.
        )
    )

    echo WSL distributions:
    call :run_wsl --list --verbose

    REM Make it visible in the pipeline summary that the WSL tests are skipped, instead of skipping them silently.
    call :run_wsl -d Ubuntu echo Ubuntu WSL is available
    if errorlevel 1 (
        echo ##vso[task.logissue type=warning]Ubuntu is not available on WSL, all WSL sanity tests will be skipped.
    )
)

set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe

echo Running sanity tests
node "%~dp0..\out\index.js" %*

goto :eof

REM ====================================================================================================================

:install_wsl

REM The agents' Windows Server 2022 image only has the inbox WSL, without a WSL2 kernel. Install the release pinned in
REM build/checksums/wsl.txt instead, see build/azure-pipelines/common/wsl.psm1.
if not defined WSL_INSTALLER_CACHE_DIR set "WSL_INSTALLER_CACHE_DIR=%TEMP%\wsl-installer"
echo Installing the current WSL
pwsh -NoProfile -ExecutionPolicy Bypass -Command "Import-Module '%SCRIPT_DIR%..\..\..\build\azure-pipelines\common\wsl.psm1'; Install-Wsl -CacheDirectory $env:WSL_INSTALLER_CACHE_DIR"
if errorlevel 1 (
    echo ##vso[task.logissue type=warning]Installing the current WSL failed, so the WSL sanity tests may not run.
)

goto :eof

REM ====================================================================================================================

:install_ubuntu

echo Ubuntu image is not present in WSL

echo Setting default WSL version to 2
wsl --set-default-version 2 >nul 2>nul
if errorlevel 1 (
    echo WARNING: Failed to set default WSL version to 2. Import may default to WSL1.
)

if "%ARCH%"=="12" (
    set "ROOTFS_URL=https://cloud-images.ubuntu.com/wsl/jammy/current/ubuntu-jammy-wsl-arm64-ubuntu22.04lts.rootfs.tar.gz"
) else (
    set "ROOTFS_URL=https://cloud-images.ubuntu.com/wsl/jammy/current/ubuntu-jammy-wsl-amd64-ubuntu22.04lts.rootfs.tar.gz"
)

set "ROOTFS_ZIP=%TEMP%\ubuntu-rootfs.tar.gz"
set "ROOTFS_DIR=%LOCALAPPDATA%\WSL\Ubuntu"

echo Downloading Ubuntu rootfs from %ROOTFS_URL% to %ROOTFS_ZIP%
curl --fail --location --retry 5 --retry-all-errors --retry-max-time 120 --connect-timeout 30 --max-time 300 -o "%ROOTFS_ZIP%" "%ROOTFS_URL%"

echo Importing Ubuntu into WSL at %ROOTFS_DIR% from %ROOTFS_ZIP%
mkdir "%ROOTFS_DIR%" 2>nul
call :run_wsl --import Ubuntu "%ROOTFS_DIR%" "%ROOTFS_ZIP%"

echo Starting Ubuntu on WSL
call :run_wsl -d Ubuntu echo Ubuntu WSL is ready

goto :eof

REM ====================================================================================================================

:run_wsl

REM Runs wsl.exe with a timeout and returns errorlevel 1 on any failure, see src/runWsl.ts.
node "%SCRIPT_DIR%..\out\runWsl.js" %*
exit /b %errorlevel%
