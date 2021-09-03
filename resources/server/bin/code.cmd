@echo off
setlocal
set VSCODE_DEV=
"%~dp0\..\node.exe" "%~dp0\..\out\server-cli.js" %*
endlocal
