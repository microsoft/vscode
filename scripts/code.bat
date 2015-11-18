@echo off
title VSCode Dev

set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

pushd %~dp0\..
node .\node_modules\gulp\bin\gulp.js electron
..\Electron-Build\CodeOSS.exe . %*
popd
