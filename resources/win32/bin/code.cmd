@echo off
setlocal
set VSCODE_DEV=
set ATOM_SHELL_INTERNAL_RUN_AS_NODE=1
"%~dp0..\\Code.exe" "%~dp0code.js" %*
endlocal