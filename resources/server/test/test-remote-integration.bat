@echo off
setlocal

pushd %~dp0\..\..\..

IF "%1" == "" (
	set AUTHORITY=vscode-remote://test+test/
	:: backward to forward slashed
	set EXT_PATH=%CD:\=/%/extensions

	:: Download nodejs executable for remote
	node .\node_modules\gulp\bin\gulp.js node-remote
) else (
	set AUTHORITY=%1
	set EXT_PATH=%2
	set VSCODEUSERDATADIR=%3
)
IF "%VSCODEUSERDATADIR%" == "" (
	set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%
)

set REMOTE_VSCODE=%AUTHORITY%%EXT_PATH%

:: Tests in the extension host
call .\scripts\code.bat --folder-uri=%REMOTE_VSCODE%/vscode-api-tests/testWorkspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/singlefolder-tests --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call .\scripts\code.bat --file-uri=%REMOTE_VSCODE%/vscode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-api-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-api-tests/out/workspace-tests --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call .\scripts\code.bat --folder-uri=%REMOTE_VSCODE%/vscode-colorize-tests --extensionDevelopmentPath=%REMOTE_VSCODE%/vscode-colorize-tests --extensionTestsPath=%REMOTE_VSCODE%/vscode-colorize-tests/out --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call .\scripts\code.bat --folder-uri=%REMOTE_VSCODE%/emmet/test-fixtures --extensionDevelopmentPath=%REMOTE_VSCODE%/emmet --extensionTestsPath=%REMOTE_VSCODE%/emmet/out/test --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

IF "%3" == "" (
	rmdir /s /q %VSCODEUSERDATADIR%
)

popd

endlocal
