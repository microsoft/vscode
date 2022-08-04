@echo off
setlocal

pushd %~dp0\..

set VSCODEUSERDATADIR=%TEMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,2%
set VSCODECRASHDIR=%~dp0\..\.build\crashes
set VSCODELOGSDIR=%~dp0\..\.build\logs\integration-tests

:: Figure out which Electron to use for running tests
if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (
	:: Run out of sources: no need to compile as code.bat takes care of it
	chcp 65001
	set INTEGRATION_TEST_ELECTRON_PATH=.\scripts\code.bat
	set VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE=1

	echo Storing crash reports into '%VSCODECRASHDIR%'.
	echo Storing log files into '%VSCODELOGSDIR%'.
	echo Running integration tests out of sources.
) else (
	:: Run from a built: need to compile all test extensions
	:: because we run extension tests from their source folders
	:: and the build bundles extensions into .build webpacked
	:: call yarn gulp 	compile-extension:vscode-api-tests^
	::				compile-extension:vscode-colorize-tests^
	::				compile-extension:markdown-language-features^
	::				compile-extension:typescript-language-features^
	::				compile-extension:vscode-notebook-tests^
	::				compile-extension:emmet^
	::				compile-extension:css-language-features-server^
	::				compile-extension:html-language-features-server^
	::				compile-extension:json-language-features-server^
	::				compile-extension:git^
	::				compile-extension:ipynb^
	::				compile-extension:configuration-editing^
	::				compile-extension-media

	:: Configuration for more verbose output
	set VSCODE_CLI=1
	set ELECTRON_ENABLE_LOGGING=1

	echo Storing crash reports into '%VSCODECRASHDIR%'.
	echo Storing log files into '%VSCODELOGSDIR%'.
	echo Running integration tests with '%INTEGRATION_TEST_ELECTRON_PATH%' as build.
)


:: Tests standalone (AMD)

echo.
echo ### node.js integration tests
call .\scripts\test.bat --runGlob **\*.integrationTest.js %*
if %errorlevel% neq 0 exit /b %errorlevel%


:: Tests in the extension host

set API_TESTS_EXTRA_ARGS=--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=%VSCODECRASHDIR% --logsPath=%VSCODELOGSDIR% --no-cached-data --disable-updates --disable-keytar --disable-extensions --disable-workspace-trust --user-data-dir=%VSCODEUSERDATADIR%

echo.
echo ### API tests (folder)
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\singlefolder-tests %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### API tests (workspace)
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\workspace-tests %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Colorize tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-colorize-tests\test --extensionDevelopmentPath=%~dp0\..\extensions\vscode-colorize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-colorize-tests\out %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### TypeScript tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\typescript-language-features\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\typescript-language-features --extensionTestsPath=%~dp0\..\extensions\typescript-language-features\out\test\unit %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Markdown tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\markdown-language-features\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\markdown-language-features --extensionTestsPath=%~dp0\..\extensions\markdown-language-features\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Emmet tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\emmet\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\emmet --extensionTestsPath=%~dp0\..\extensions\emmet\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Git tests
for /f "delims=" %%i in ('node -p "require('fs').realpathSync.native(require('os').tmpdir())"') do set TEMPDIR=%%i
set GITWORKSPACE=%TEMPDIR%\git-%RANDOM%
mkdir %GITWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" %GITWORKSPACE% --extensionDevelopmentPath=%~dp0\..\extensions\git --extensionTestsPath=%~dp0\..\extensions\git\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Ipynb tests
set IPYNBWORKSPACE=%TEMPDIR%\ipynb-%RANDOM%
mkdir %IPYNBWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" %IPYNBWORKSPACE% --extensionDevelopmentPath=%~dp0\..\extensions\ipynb --extensionTestsPath=%~dp0\..\extensions\ipynb\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Configuration editing tests
set CFWORKSPACE=%TEMPDIR%\cf-%RANDOM%
mkdir %CFWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" %CFWORKSPACE% --extensionDevelopmentPath=%~dp0\..\extensions\configuration-editing --extensionTestsPath=%~dp0\..\extensions\configuration-editing\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

:: Tests standalone (CommonJS)

echo.
echo ### CSS tests
call %~dp0\node-electron.bat %~dp0\..\extensions\css-language-features/server/test/index.js
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### HTML tests
call %~dp0\node-electron.bat %~dp0\..\extensions\html-language-features/server/test/index.js
if %errorlevel% neq 0 exit /b %errorlevel%


:: Cleanup

rmdir /s /q %VSCODEUSERDATADIR%

popd

endlocal
