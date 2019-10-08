@echo off
setlocal

pushd %~dp0\..\..\..

IF "%1" == "" (
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

:: Figure out which Electron to use for running tests
if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (

	:: Tests in the extension host running from sources
	call .\scripts\code.bat --folder-uri=%REMOTE_VSCODE%/vscode-api-tests/testWorkspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/singlefolder-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=%VSCODEUSERDATADIR%
	if %errorlevel% neq 0 exit /b %errorlevel%

	call .\scripts\code.bat --file-uri=%REMOTE_VSCODE%/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/workspace-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=%VSCODEUSERDATADIR%
	if %errorlevel% neq 0 exit /b %errorlevel%
) else (
 	echo "Using %INTEGRATION_TEST_ELECTRON_PATH% as Electron path"
	echo "Using %VSCODE_REMOTE_SERVER_PATH% as server path"

	:: Compile Extensions that are needed during tests
	:: Note: since we do set --extensions-dir, we have
	:: to ensure that all extensions that are needed
	:: are compiled properly.
	call yarn gulp compile-extensions

	:: Tests in the extension host running from built version (both client and server)
	call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%REMOTE_VSCODE%/vscode-api-tests/testWorkspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/singlefolder-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=%VSCODEUSERDATADIR% --extensions-dir=%EXT_PATH% --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests --enable-proposed-api=vscode.image-preview
	if %errorlevel% neq 0 exit /b %errorlevel%

	call "%INTEGRATION_TEST_ELECTRON_PATH%" --file-uri=%REMOTE_VSCODE%/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/workspace-tests --disable-telemetry --disable-crash-reporter --disable-updates --skip-getting-started --disable-inspect --user-data-dir=%VSCODEUSERDATADIR% --extensions-dir=%EXT_PATH% --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests --enable-proposed-api=vscode.image-preview
	if %errorlevel% neq 0 exit /b %errorlevel%
)

IF "%3" == "" (
	rmdir /s /q %VSCODEUSERDATADIR%
)

popd

endlocal
