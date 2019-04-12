@echo off
setlocal

title VSCode Remote Agent

pushd %~dp0\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Launch Agent
node out\remoteExtensionHostAgent.js %*

popd

endlocal
