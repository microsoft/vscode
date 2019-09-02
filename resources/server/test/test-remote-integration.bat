@echo off
setlocal

pushd %~dp0\..\..\..

IF "%1" == "" (
	set AUTHORITY=vscode-remote://test+test/
	:: backward to forward slashed
	set EXT_PATH=%CD:\=/%/extensions

	:: Download nodejs executable for remote
	yarn gulp node
) else (
	set AUTHORITY=%1
	set EXT_PATH=%2
	set VSCODEUSERDATADIR=%3
)
IF "%VSCODEUSERDATADIR%" == "" (
	set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%
)

set REMOTE_VSCODE=%AUTHORITY%%EXT_PATH%

if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (
	:: code.bat makes sure Test Extensions are compiled
	set INTEGRATION_TEST_ELECTRON_PATH=.\scripts\code.bat

	:: No extra arguments when running out of sources
	set EXTRA_INTEGRATION_TEST_ARGUMENTS=""
) else (
 	echo "Using %INTEGRATION_TEST_ELECTRON_PATH% as Electron path"

	:: Running from a build, we need to enable the vscode-test-resolver extension
	set EXTRA_INTEGRATION_TEST_ARGUMENTS="--extensions-dir=%EXT_PATH% --enable-proposed-api=vscode.vscode-test-resolver"
)

:: Tests in the extension host
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%REMOTE_VSCODE%/vscode-api-tests/testWorkspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/singlefolder-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=%VSCODEUSERDATADIR% %EXTRA_INTEGRATION_TEST_ARGUMENTS%
if %errorlevel% neq 0 exit /b %errorlevel%

call "%INTEGRATION_TEST_ELECTRON_PATH%" --file-uri=%REMOTE_VSCODE%/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/workspace-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=%VSCODEUSERDATADIR% %EXTRA_INTEGRATION_TEST_ARGUMENTS%
if %errorlevel% neq 0 exit /b %errorlevel%

IF "%3" == "" (
	rmdir /s /q %VSCODEUSERDATADIR%
)

popd

endlocal
