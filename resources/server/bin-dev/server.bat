@echo off
setlocal

title VSCode Remote Agent

pushd %~dp0\..\..\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Sync built-in extensions
node build\lib\builtInExtensions.js

:: Download nodejs executable for remote
node .\node_modules\gulp\bin\gulp.js node-remote

:: Launch Agent
.build\node-remote\node.exe out\vs\server\main.js %*

popd

endlocal
