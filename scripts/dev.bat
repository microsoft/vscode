@echo off
setlocal EnableDelayedExpansion

title Autothropic Dev
pushd %~dp0\..

echo.
echo  ============================================
echo   Autothropic IDE - Dev Launcher
echo  ============================================
echo.

:: Kill any existing Autothropic process
tasklist /FI "IMAGENAME eq Autothropic.exe" 2>NUL | find /I "Autothropic.exe" >NUL
if not errorlevel 1 (
    echo  [1/4] Stopping existing Autothropic...
    taskkill /F /IM "Autothropic.exe" >NUL 2>&1
    timeout /t 1 /nobreak >NUL
) else (
    echo  [1/4] No existing process found
)

:: Compile custom extensions
echo  [2/4] Compiling custom extensions...

call node_modules\.bin\tsc.cmd -p extensions\autothropic-preview\tsconfig.json
if !errorlevel! neq 0 (
    echo  ERROR: autothropic-preview failed to compile
    goto end
)
echo         autothropic-preview OK

call node_modules\.bin\tsc.cmd -p extensions\autothropic-agents\tsconfig.json
if !errorlevel! neq 0 (
    echo  ERROR: autothropic-agents failed to compile
    goto end
)
echo         autothropic-agents OK

call node_modules\.bin\tsc.cmd -p extensions\autothropic-graph\tsconfig.json
if !errorlevel! neq 0 (
    echo  ERROR: autothropic-graph failed to compile
    goto end
)
echo         autothropic-graph OK

:: Ensure core is compiled (preLaunch handles electron + node_modules + compile)
echo  [3/4] Ensuring core build...
if "%VSCODE_SKIP_PRELAUNCH%"=="" call node build/lib/preLaunch.js

:: Launch
echo  [4/4] Launching Autothropic...
echo.

for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
set NAMESHORT=!NAMESHORT: "=!
set NAMESHORT=!NAMESHORT:"=!.exe
set CODE=".build\electron\!NAMESHORT!"

set NODE_ENV=development
set VSCODE_DEV=1
set VSCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

set DISABLE_TEST_EXTENSION="--disable-extension=vscode.vscode-api-tests"
start "" !CODE! . !DISABLE_TEST_EXTENSION! %*

:end
popd
endlocal
