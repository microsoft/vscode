@echo off
setlocal

title VSCode Server

pushd %~dp0\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Sync built-in extensions
call yarn download-builtin-extensions

:: Node executable
FOR /F "tokens=*" %%g IN ('node build/lib/node.js') do (SET NODE=%%g)

if not exist "%NODE%" (
	:: Download nodejs executable for remote
	call yarn gulp node
)

:: Launch Server
call "%NODE%" scripts\code-server.js %*

popd

endlocal
