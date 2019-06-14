@echo off
setlocal

title VSCode Remote Agent

pushd %~dp0\..\..\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Sync built-in extensions
call node build\lib\builtInExtensions.js

:: Download nodejs executable for remote
call node .\node_modules\gulp\bin\gulp.js node-remote

echo Using node from .build\node-remote\node

:: Launch Agent
call .build\node-remote\node.exe out\vs\server\main.js %*

popd

endlocal
