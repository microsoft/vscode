@echo off
setlocal

pushd %~dp0\..

set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%

:: Figure out which Electron to use for running tests
if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (
	:: Run out of sources: no need to compile as code.sh takes care of it
	chcp 65001
	set INTEGRATION_TEST_ELECTRON_PATH=.\scripts\code.bat
	set VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE=1

	echo "Running integration tests out of sources."
) else (
	:: Run from a built: need to compile all test extensions
	call yarn gulp compile-extension:vscode-api-tests
	call yarn gulp compile-extension:vscode-colorize-tests
	call yarn gulp compile-extension:markdown-language-features
	call yarn gulp compile-extension:emmet
	call yarn gulp compile-extension:css-language-features-server
	call yarn gulp compile-extension:html-language-features-server
	call yarn gulp compile-extension:json-language-features-server

	echo "Running integration tests with '%INTEGRATION_TEST_ELECTRON_PATH%' as build."
)

:: Integration & performance tests in AMD
call .\scripts\test.bat --runGlob **\*.integrationTest.js %*
if %errorlevel% neq 0 exit /b %errorlevel%

:: Tests in the extension host

call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\singlefolder-tests --disable-telemetry --disable-crash-reporter --disable-updates --disable-extensions --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\workspace-tests --disable-telemetry --disable-crash-reporter --disable-updates --disable-extensions --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-colorize-tests\test --extensionDevelopmentPath=%~dp0\..\extensions\vscode-colorize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-colorize-tests\out --disable-telemetry --disable-crash-reporter --disable-updates --disable-extensions --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call "%INTEGRATION_TEST_ELECTRON_PATH%" $%~dp0\..\extensions\emmet\test-fixtures --extensionDevelopmentPath=%~dp0\..\extensions\emmet --extensionTestsPath=%~dp0\..\extensions\emmet\out\test --disable-telemetry --disable-crash-reporter --disable-updates --disable-extensions --user-data-dir=%VSCODEUSERDATADIR% .
if %errorlevel% neq 0 exit /b %errorlevel%

:: Tests in commonJS (HTML, CSS, JSON language server tests...)
call .\scripts\node-electron.bat .\node_modules\mocha\bin\_mocha .\extensions\*\server\out\test\**\*.test.js
if %errorlevel% neq 0 exit /b %errorlevel%

if exist ".\resources\server\test\test-remote-integration.bat" (
	call .\resources\server\test\test-remote-integration.bat
)

rmdir /s /q %VSCODEUSERDATADIR%

popd

endlocal
