@echo off
setlocal

pushd %~dp0\..

IF "%~1" == "" (
	set AUTHORITY=vscode-remote://test+test/
	:: backward to forward slashed
	set EXT_PATH=%CD:\=/%/extensions

	:: Download nodejs executable for remote
	call npm run gulp node
) else (
	set AUTHORITY=%1
	set EXT_PATH=%2
	set VSCODEUSERDATADIR=%3
)
IF "%VSCODEUSERDATADIR%" == "" (
	set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%
)

set REMOTE_EXT_PATH=%AUTHORITY%%EXT_PATH%
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

:: Figure out which Electron to use for running tests
if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (
	chcp 65001
	set INTEGRATION_TEST_ELECTRON_PATH=.\scripts\code.bat
	set API_TESTS_EXTRA_ARGS_BUILT=

	echo Running integration tests out of sources.
) else (
	set VSCODE_CLI=1
	set ELECTRON_ENABLE_LOGGING=1

	:: Extra arguments only when running against a built version
	set API_TESTS_EXTRA_ARGS_BUILT=--extensions-dir=%EXT_PATH% --enable-proposed-api=vscode.vscode-test-resolver --enable-proposed-api=vscode.vscode-api-tests

 	echo Using %INTEGRATION_TEST_ELECTRON_PATH% as Electron path
)

echo Storing crash reports into '%VSCODECRASHDIR%'
echo Storing log files into '%VSCODELOGSDIR%'


:: Tests in the extension host

set API_TESTS_EXTRA_ARGS=--disable-telemetry --skip-welcome --skip-release-notes --crash-reporter-directory=%VSCODECRASHDIR% --logsPath=%VSCODELOGSDIR% --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-inspect --disable-workspace-trust --user-data-dir=%VSCODEUSERDATADIR%

echo.
echo ### API tests (folder)
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%REMOTE_EXT_PATH%/vscode-api-tests/testWorkspace --extensionDevelopmentPath=%REMOTE_EXT_PATH%/vscode-api-tests --extensionTestsPath=%REMOTE_EXT_PATH%/vscode-api-tests/out/singlefolder-tests %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### API tests (workspace)
call "%INTEGRATION_TEST_ELECTRON_PATH%" --file-uri=%REMOTE_EXT_PATH%/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=%REMOTE_EXT_PATH%/vscode-api-tests --extensionTestsPath=%REMOTE_EXT_PATH%/vscode-api-tests/out/workspace-tests %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### TypeScript tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%REMOTE_EXT_PATH%/typescript-language-features/test-workspace --extensionDevelopmentPath=%REMOTE_EXT_PATH%/typescript-language-features --extensionTestsPath=%REMOTE_EXT_PATH%/typescript-language-features\out\test\unit %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Markdown tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%REMOTE_EXT_PATH%/markdown-language-features/test-workspace --extensionDevelopmentPath=%REMOTE_EXT_PATH%/markdown-language-features --extensionTestsPath=%REMOTE_EXT_PATH%/markdown-language-features/out/test %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Emmet tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%REMOTE_EXT_PATH%/emmet/test-workspace --extensionDevelopmentPath=%REMOTE_EXT_PATH%/emmet --extensionTestsPath=%REMOTE_EXT_PATH%/emmet/out/test %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Git tests
for /f "delims=" %%i in ('node -p "require('fs').realpathSync.native(require('os').tmpdir())"') do set TEMPDIR=%%i
set GITWORKSPACE=%TEMPDIR%\git-%RANDOM%
mkdir %GITWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%AUTHORITY%%GITWORKSPACE% --extensionDevelopmentPath=%REMOTE_EXT_PATH%/git --extensionTestsPath=%REMOTE_EXT_PATH%/git/out/test %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Ipynb tests
set IPYNBWORKSPACE=%TEMPDIR%\ipynb-%RANDOM%
mkdir %IPYNBWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%AUTHORITY%%IPYNBWORKSPACE% --extensionDevelopmentPath=%REMOTE_EXT_PATH%/ipynb --extensionTestsPath=%REMOTE_EXT_PATH%/ipynb/out/test %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Configuration editing tests
set CFWORKSPACE=%TEMPDIR%\cf-%RANDOM%
mkdir %CFWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" --folder-uri=%AUTHORITY%/%CFWORKSPACE% --extensionDevelopmentPath=%REMOTE_EXT_PATH%/configuration-editing --extensionTestsPath=%REMOTE_EXT_PATH%/configuration-editing/out/test %API_TESTS_EXTRA_ARGS% %API_TESTS_EXTRA_ARGS_BUILT%
if %errorlevel% neq 0 exit /b %errorlevel%

:: Cleanup

IF "%3" == "" (
	rmdir /s /q %VSCODEUSERDATADIR%
)

rmdir /s /q %TESTRESOLVER_DATA_FOLDER%

popd

endlocal
