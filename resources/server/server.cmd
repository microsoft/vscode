@echo off
setlocal
set VSCODE_DEV=
set PATH="%~dp0\bin";%PATH%
"%~dp0\node.exe" "%~dp0\out\server.js" %*
endlocal
