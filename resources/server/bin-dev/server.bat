@echo off
setlocal

title VSCode Remote Agent

pushd %~dp0\..\..\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Sync built-in extensions
call yarn download-builtin-extensions

:: Download nodejs executable for remote
call yarn gulp node

:: Launch Agent
FOR /F "tokens=*" %%g IN ('node build/lib/node.js') do (SET NODE=%%g)
call "%NODE%" out\vs\server\main.js %*

popd

endlocal
