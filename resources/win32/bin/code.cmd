@echo off

rem when run in remote terminal, use the remote cli instead
if defined VSCODE_IPC_HOOK_CLI if defined VSCODE_REMOTE_CLI_PATH (
	%VSCODE_REMOTE_CLI_PATH% %*
	exit
)

setlocal
set VSCODE_DEV=
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\@@NAME@@.exe" "%~dp0..\resources\app\out\cli.js" --ms-enable-electron-run-as-node %*
endlocal
