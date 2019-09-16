@echo off
setlocal

title VSCode Remote Agent

pushd %~dp0\..\..\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Sync built-in extensions
call yarn download-builtin-extensions

FOR /F "tokens=*" %%g IN ('node build/lib/node.js') do (SET NODE=%%g)

:: Download nodejs executable for remote
IF NOT EXIST "%NODE%" (
	call yarn gulp node
)

:: Launch Agent
call "%NODE%" out\vs\server\main.js %*

popd

endlocal
