@echo off
setlocal

if not "%APPVEYOR%" == "" (
	set ELECTRON_RUN_AS_NODE=
)

:: Integration Tests
.\scripts\code.bat %~dp0\..\extensions\vscode-api-tests\testWorkspace --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out
.\scripts\code.bat %~dp0\..\extensions\vscode-colorize-tests\test --extensionDevelopmentPath=%~dp0\..\extensions\vscode-colorize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-colorize-tests\out
.\scripts\test.sh --run %~dp0..\out\vs\workbench\services\search\test\node\textSearch.integrationTest.js -g integration

endlocal