@echo off
setlocal

set ELECTRON_RUN_AS_NODE=

pushd %~dp0\..

:: Get Code.exe location
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

:: Download Electron if needed
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"electronVersion\":.*" package.json') do set DESIREDVERSION=%%~a
set DESIREDVERSION=%DESIREDVERSION: "=%
set DESIREDVERSION=v%DESIREDVERSION:"=%
if exist .\.build\electron\version (set /p INSTALLEDVERSION=<.\.build\electron\version) else (set INSTALLEDVERSION="")

if not exist %CODE% node .\node_modules\gulp\bin\gulp.js electron
if not "%INSTALLEDVERSION%" == "%DESIREDVERSION%" node .\node_modules\gulp\bin\gulp.js electron

:: Run tests
%CODE% .\test\electron\index.js %*

popd

endlocal

:: app.exit(0) is exiting with code 255 in Electron 1.7.4.
:: See https://github.com/Microsoft/vscode/issues/28582
echo errorlevel: %errorlevel%
if %errorlevel% == 255 set errorlevel=0

exit /b %errorlevel%
