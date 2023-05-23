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

:: Tests in the extension host

set API_TESTS_EXTRA_ARGS=--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=%VSCODECRASHDIR% --logsPath=%VSCODELOGSDIR% --no-cached-data --disable-updates --disable-keytar --disable-extensions --disable-workspace-trust --user-data-dir=%VSCODEUSERDATADIR%

echo.
echo ### Notebook Output tests
set NBOUTWORKSPACE=%TEMPDIR%\nbout-%RANDOM%
mkdir %NBOUTWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" %NBOUTWORKSPACE% --extensionDevelopmentPath=%~dp0\..\extensions\notebook-renderers --extensionTestsPath=%~dp0\..\extensions\notebook-renderers\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%



:: Cleanup

rmdir /s /q %VSCODEUSERDATADIR%

popd

endlocal
