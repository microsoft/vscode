@echo off
setlocal

pushd %~dp0\..

if not "%APPVEYOR%" == "" (
	set ELECTRON_RUN_AS_NODE=
)
set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%

:: Tests in the extension host
call .\scripts\code.bat %~dp0\..\extensions\vscode-api-tests\testWorkspace --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out --disableExtensions --user-data-dir=%VSCODEUSERDATADIR%
call .\scripts\code.bat %~dp0\..\extensions\vscode-colorize-tests\test --extensionDevelopmentPath=%~dp0\..\extensions\vscode-colorize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-colorize-tests\out --disableExtensions --user-data-dir=%VSCODEUSERDATADIR%
call .\scripts\code.bat $%~dp0\..\extensions\emmet\test-fixtures --extensionDevelopmentPath=%~dp0\..\extensions\emmet --extensionTestsPath=%~dp0\..\extensions\emmet\out\test --disableExtensions --user-data-dir=%VSCODEUSERDATADIR%

:: Integration & performance tests in AMD
call .\scripts\test.bat --runGlob **\*.integrationTest.js %*

:: Tests in commonJS (language servers tests...)
call .\scripts\node-electron.bat .\node_modules\mocha\bin\_mocha .\extensions\html\server\out\test\

rmdir /s /q %VSCODEUSERDATADIR%

popd

endlocal
