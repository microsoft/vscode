@echo off
setlocal

set ELECTRON_RUN_AS_NODE=

pushd %~dp0\..

:: Get Code.exe location
set "NAMESHORT="
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do if not defined NAMESHORT set "NAMESHORT=%%~a"
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

:: Download Electron if needed
if "%VSCODE_SKIP_PRELAUNCH%"=="" (
	call :ensure_electron
	if errorlevel 1 exit /b 1
)

:: Run tests
set ELECTRON_ENABLE_LOGGING=1
%CODE% .\test\unit\electron\index.js --crash-reporter-directory=%~dp0\..\.build\crashes %*

popd

endlocal

:: app.exit(0) is exiting with code 255 in Electron 1.7.4.
:: See https://github.com/microsoft/vscode/issues/28582
echo errorlevel: %errorlevel%
if %errorlevel% == 255 set errorlevel=0

exit /b %errorlevel%

:ensure_electron
if defined VSCODE_FORCE_PRELAUNCH goto download_electron
if not exist %CODE% goto download_electron
if not exist ".build\electron\version" goto download_electron

set "EXPECTED_ELECTRON_VERSION="
for /f "tokens=2 delims==" %%a in ('findstr /B /C:"target=" .npmrc') do set "EXPECTED_ELECTRON_VERSION=%%~a"
set "INSTALLED_ELECTRON_VERSION="
set /p INSTALLED_ELECTRON_VERSION=<".build\electron\version"
if "%INSTALLED_ELECTRON_VERSION:~0,1%"=="v" set "INSTALLED_ELECTRON_VERSION=%INSTALLED_ELECTRON_VERSION:~1%"
if not "%INSTALLED_ELECTRON_VERSION%"=="%EXPECTED_ELECTRON_VERSION%" goto download_electron
exit /b 0

:download_electron
call npm run electron
exit /b %errorlevel%
