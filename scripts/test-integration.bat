@echo off
setlocal

rem APPVEYOR Builds
if not "%APPVEYOR%" == "" (
	set ELECTRON_NO_ATTACH_CONSOLE=1
	set ATOM_SHELL_INTERNAL_RUN_AS_NODE=
)

:: Integration Tests
.\scripts\code.bat %~dp0\..\extensions\vscode-api-tests\testWorkspace --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out
.\scripts\code.bat %~dp0\..\extensions\vscode-colorize-tests\test --extensionDevelopmentPath=%~dp0\..\extensions\vscode-colorize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-colorize-tests\out

endlocal