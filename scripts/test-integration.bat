@echo off
setlocal

if not "%APPVEYOR%" == "" (
	set ELECTRON_RUN_AS_NODE=
)
set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%

:: Integration Tests
.\scripts\code.bat %~dp0\..\extensions\vscode-api-tests\testWorkspace --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out --disableExtensions --user-data-dir=%VSCODEUSERDATADIR%
.\scripts\code.bat %~dp0\..\extensions\vscode-colorize-tests\test --extensionDevelopmentPath=%~dp0\..\extensions\vscode-colorize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-colorize-tests\out --user-data-dir=%VSCODEUSERDATADIR%
.\scripts\test-int-mocha.bat

rmdir /s /q %VSCODEUSERDATADIR%

endlocal
