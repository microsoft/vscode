@echo off
setlocal

title VSCode Dev

pushd %~dp0\..

:: Node modules
if not exist node_modules call .\scripts\npm.bat install

:: Get electron
node .\node_modules\gulp\bin\gulp.js electron

:: Build
if not exist out node .\node_modules\gulp\bin\gulp.js compile

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_DEFAULT_ERROR_MODE=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
.\.build\electron\electron.exe . %*
popd

endlocal