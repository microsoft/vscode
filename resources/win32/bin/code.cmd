@echo off
setlocal
set VSCODE_DEV=
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\\Code.exe" "%~dp0code.js" %*
endlocal