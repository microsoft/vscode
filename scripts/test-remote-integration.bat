@echo off
setlocal

pushd %~dp0\..

IF "%~1" == "" (
	set AUTHORITY=vscode-remote://test+test/
	:: backward to forward slashed
	set EXT_PATH=%CD:\=/%/extensions

	:: Download nodejs executable for remote
	call yarn gulp node
) else (
	set AUTHORITY=%1
	set EXT_PATH=%2
	set VSCODEUSERDATADIR=%3
)
IF "%VSCODEUSERDATADIR%" == "" (
	set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%
)

set REMOTE_VSCODE=%AUTHORITY%%EXT_PATH%
set VSCODECRASHDIR=%~dp0\..\.build\crashes
set VSCODELOGSDIR=%~dp0\..\.build\logs\integration-tests-remote
set TESTRESOLVER_DATA_FOLDER=%TMP%\testresolverdatafolder-%RANDOM%-%TIME:~6,5%
set TESTRESOLVER_LOGS_FOLDER=%VSCODELOGSDIR%\server

if "%VSCODE_REMOTE_SERVER_PATH%"=="" (
	echo Using remote server out of sources for integration tests
) else (
	set TESTRESOLVER_INSTALL_BUILTIN_EXTENSION=ms-vscode.vscode-smoketest-check
	echo Using '%VSCODE_REMOTE_SERVER_PATH%' as server path
)

set API_TESTS_EXTRA_ARGS=--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=%VSCODECRASHDIR% --logsPath=%VSCODELOGSDIR% --no-cached-data --disable-updates --disable-keytar --disable-inspect --disable-workspace-trust --user-data-dir=%VSCODEUSERDATADIR%

:: Figure out which Electron to use for running tests
if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (
	echo Storing crash reports into '%VSCODECRASHDIR%'
	echo Storing log files into '%VSCODELOGSDIR%'

	:: Tests in the extension host running from sources
	call .\scripts\code.bat --folder-uri=%REMOTE_VSCODE%/vscode-api-tests/testWorkspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/singlefolder-tests %API_TESTS_EXTRA_ARGS%
	if %errorlevel% neq 0 exit /b %errorlevel%

	call .\scripts\code.bat --file-uri=%REMOTE_VSCODE%/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/workspace-tests %API_TESTS_EXTRA_ARGS%
	if %errorlevel% neq 0 exit /b %errorlevel%
) else (
	echo Storing crash reports into '%VSCODECRASHDIR%'
	echo Storing log files into '%VSCODELOGSDIR%'
 	echo Using %INTEGRATION_TEST_ELECTRON_PATH% as Electron path

	:: Run from a built: need to compile all test extensions
	:: because we run extension tests from their source folders
	:: and the build bundles extensions into .build webpacked
	call yarn gulp 	compile-extension:vscode-api-tests^
					compile-extension:microsoft-authentication^
					compile-extension:github-authentication^
					compile-extension:vscode-test-resolver

	:: Configuration for more verbose output
	set VSCODE_CLI=1
	set ELECTRON_ENABLE_LOGGING=1
	set ELECTRON_ENABLE_STACK_DUMPING=1

	:: Tests in the extension host running from built version (both client and server)
	call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%REMOTE_VSCODE%/vscode-api-tests/testWorkspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/singlefolder-tests %API_TESTS_EXTRA_ARGS% --extensions-dir=%EXT_PATH% --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests
	if %errorlevel% neq 0 exit /b %errorlevel%

	call "%INTEGRATION_TEST_ELECTRON_PATH%" --file-uri=%REMOTE_VSCODE%/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/workspace-tests %API_TESTS_EXTRA_ARGS% --extensions-dir=%EXT_PATH% --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests
	if %errorlevel% neq 0 exit /b %errorlevel%
)

IF "%3" == "" (
	rmdir /s /q %VSCODEUSERDATADIR%
)

rmdir /s /q %TESTRESOLVER_DATA_FOLDER%

popd

endlocal
