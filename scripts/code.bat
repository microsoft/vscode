@echo off
title VSCode Dev

pushd %~dp0\..

:: Node modules
if not exist node_modules call .\scripts\npm.bat install

:: Get electron
node .\node_modules\gulp\bin\gulp.js electron

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
.\.build\electron\CodeOSS.exe . %*
popd
