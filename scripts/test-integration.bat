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

@REM echo.
@REM echo ### node.js integration tests
@REM call .\scripts\test.bat --runGlob **\*.integrationTest.js %*
@REM if %errorlevel% neq 0 exit /b %errorlevel%


:: Tests in the extension host

set API_TESTS_EXTRA_ARGS=--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=%VSCODECRASHDIR% --logsPath=%VSCODELOGSDIR% --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-extensions --disable-workspace-trust --user-data-dir=%VSCODEUSERDATADIR%

echo.
echo ### API tests (folder)
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\singlefolder-tests %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### API tests (workspace)
@REM call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\workspace-tests %API_TESTS_EXTRA_ARGS%
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### Colorize tests
@REM call yarn test-extension -l vscode-colorize-tests
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### TypeScript tests
@REM call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\typescript-language-features\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\typescript-language-features --extensionTestsPath=%~dp0\..\extensions\typescript-language-features\out\test\unit %API_TESTS_EXTRA_ARGS%
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### Markdown tests
@REM call yarn test-extension -l markdown-language-features
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### Emmet tests
@REM call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\emmet\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\emmet --extensionTestsPath=%~dp0\..\extensions\emmet\out\test %API_TESTS_EXTRA_ARGS%
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### Git tests
@REM for /f "delims=" %%i in ('node -p "require('fs').realpathSync.native(require('os').tmpdir())"') do set TEMPDIR=%%i
@REM set GITWORKSPACE=%TEMPDIR%\git-%RANDOM%
@REM mkdir %GITWORKSPACE%
@REM call "%INTEGRATION_TEST_ELECTRON_PATH%" %GITWORKSPACE% --extensionDevelopmentPath=%~dp0\..\extensions\git --extensionTestsPath=%~dp0\..\extensions\git\out\test %API_TESTS_EXTRA_ARGS%
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### Ipynb tests
@REM call yarn test-extension -l ipynb
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### Notebook Output tests
@REM call yarn test-extension -l notebook-renderers
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### Configuration editing tests
@REM set CFWORKSPACE=%TEMPDIR%\cf-%RANDOM%
@REM mkdir %CFWORKSPACE%
@REM call yarn test-extension -l configuration-editing
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### GitHub Authentication tests
@REM call yarn test-extension -l github-authentication
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM :: Tests standalone (CommonJS)

@REM echo.
@REM echo ### CSS tests
@REM call %~dp0\node-electron.bat %~dp0\..\extensions\css-language-features/server/test/index.js
@REM if %errorlevel% neq 0 exit /b %errorlevel%

@REM echo.
@REM echo ### HTML tests
@REM call %~dp0\node-electron.bat %~dp0\..\extensions\html-language-features/server/test/index.js
@REM if %errorlevel% neq 0 exit /b %errorlevel%


:: Cleanup

rmdir /s /q %VSCODEUSERDATADIR%

popd

endlocal
