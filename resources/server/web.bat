@echo off
setlocal

title VSCode Web Server

pushd %~dp0\..\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Sync built-in extensions
call yarn download-builtin-extensions

:: Download nodejs executable for remote
call yarn gulp node

:: Launch Server
FOR /F "tokens=*" %%g IN ('node build/lib/node.js') do (SET NODE=%%g)
call "%NODE%" resources\server\bin-dev\code-web.js %*

popd

endlocal