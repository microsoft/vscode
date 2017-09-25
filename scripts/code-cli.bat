@echo off
setlocal

title VSCode Dev

pushd %~dp0\..

:: Node modules
if not exist node_modules call .\scripts\npm.bat install

for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"electronVersion\":.*" package.json') do set DESIREDVERSION=%%~a
set DESIREDVERSION=%DESIREDVERSION: "=%
set DESIREDVERSION=v%DESIREDVERSION:"=%
if exist .\.build\electron\version (set /p INSTALLEDVERSION=<.\.build\electron\version) else (set INSTALLEDVERSION="")

:: Get electron
if not exist %CODE% node .\node_modules\gulp\bin\gulp.js electron
if not "%INSTALLEDVERSION%" == "%DESIREDVERSION%" node .\node_modules\gulp\bin\gulp.js electron

:: Build
if not exist out node .\node_modules\gulp\bin\gulp.js compile

:: Configuration
set ELECTRON_RUN_AS_NODE=1
set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_DEFAULT_ERROR_MODE=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
%CODE% --debug=5874 out\cli.js . %*
popd

endlocal
