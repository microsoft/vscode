@echo off
setlocal

pushd %~dp0\..

set VSCODEUSERDATADIR=%TEMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,2%
set VSCODECRASHDIR=%~dp0\..\.build\crashes
set VSCODELOGSDIR=%~dp0\..\.build\logs\integration-tests

:: Figure out which Electron to use for running tests
if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (
	chcp 65001
	set INTEGRATION_TEST_ELECTRON_PATH=.\scripts\code.bat
	set VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE=1

	echo Running integration tests out of sources.
) else (
	set VSCODE_CLI=1
	set ELECTRON_ENABLE_LOGGING=1

	echo Running integration tests with '%INTEGRATION_TEST_ELECTRON_PATH%' as build.
)

echo Storing crash reports into '%VSCODECRASHDIR%'.
echo Storing log files into '%VSCODELOGSDIR%'.


:: Tests standalone (AMD)

echo.
echo ### node.js integration tests
call .\scripts\test-esm.bat --runGlob **\*.integrationTest.js %*
if %errorlevel% neq 0 exit /b %errorlevel%


:: Tests in the extension host

set API_TESTS_EXTRA_ARGS=--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=%VSCODECRASHDIR% --logsPath=%VSCODELOGSDIR% --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-extensions --disable-workspace-trust --user-data-dir=%VSCODEUSERDATADIR%

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
call yarn test-extension -l vscode-colorize-tests
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### TypeScript tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\typescript-language-features\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\typescript-language-features --extensionTestsPath=%~dp0\..\extensions\typescript-language-features\out\test\unit %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Markdown tests
call yarn test-extension -l markdown-language-features
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
call yarn test-extension -l ipynb
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Notebook Output tests
call yarn test-extension -l notebook-renderers
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Configuration editing tests
set CFWORKSPACE=%TEMPDIR%\cf-%RANDOM%
mkdir %CFWORKSPACE%
call yarn test-extension -l configuration-editing
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### GitHub Authentication tests
call yarn test-extension -l github-authentication
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
