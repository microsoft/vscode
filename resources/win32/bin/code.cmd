@echo off
setlocal
set VSCODE_DEV=
set ATOM_SHELL_INTERNAL_RUN_AS_NODE=1
call "%~dp0..\@@NAME@@.exe" "%~dp0..\resources\\app\\out\\cli.js" %*
endlocal