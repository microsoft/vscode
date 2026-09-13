@echo off
setlocal
set VSCODE_DEV=
set ELECTRON_RUN_AS_NODE=1

REM Preserve NODE_OPTIONS and NODE_REPL_EXTERNAL_MODULE as VSCODE_* variants
REM before Electron sanitizes them. This allows the integrated terminal to
REM restore these variables later for proper environment inheritance.
REM See: https://github.com/microsoft/vscode/issues/231076
if defined NODE_OPTIONS (
	set VSCODE_NODE_OPTIONS=%NODE_OPTIONS%
)
if defined NODE_REPL_EXTERNAL_MODULE (
	set VSCODE_NODE_REPL_EXTERNAL_MODULE=%NODE_REPL_EXTERNAL_MODULE%
)

"%~dp0..\@@NAME@@.exe" "%~dp0..\resources\app\out\cli.js" %*
IF %ERRORLEVEL% NEQ 0 EXIT /b %ERRORLEVEL%
endlocal
