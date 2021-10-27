@echo off
setlocal

pushd %~dp0\..\..\..

IF "%~1" == "" (
	set AUTHORITY=vscode-remote://test+test/
	:: backward to forward slashed
	set EXT_PATH=%CD:\=/%/extensions

	:: Download nodejs executable for remote
	call yarn gulp node
) else (
	set AUTHORITY=%1
	set EXT_PATH=%2
)

set REMOTE_VSCODE=%AUTHORITY%%EXT_PATH%

if "%VSCODE_REMOTE_SERVER_PATH%"=="" (
	echo "Using remote server out of sources for integration web tests"
) else (
	echo "Using %VSCODE_REMOTE_SERVER_PATH% as server path for web integration tests"

	:: Run from a built: need to compile all test extensions
	:: because we run extension tests from their source folders
	:: and the build bundles extensions into .build webpacked
	call yarn gulp	compile-extension:vscode-api-tests^
					compile-extension:markdown-language-features^
					compile-extension:typescript-language-features^
					compile-extension:emmet^
					compile-extension:git^
					compile-extension-media
)

call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\vscode-api-tests\testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=.\extensions\vscode-api-tests --extensionTestsPath=.\extensions\vscode-api-tests\out\singlefolder-tests %*
if %errorlevel% neq 0 exit /b %errorlevel%

call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\vscode-api-tests\testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=.\extensions\vscode-api-tests --extensionTestsPath=.\extensions\vscode-api-tests\out\workspace-tests %*
if %errorlevel% neq 0 exit /b %errorlevel%

call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\typescript-language-features\test-workspace --extensionDevelopmentPath=.\extensions\typescript-language-features --extensionTestsPath=.\extensions\typescript-language-features\out\test\unit %*
if %errorlevel% neq 0 exit /b %errorlevel%

call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\markdown-language-features\test-workspace --extensionDevelopmentPath=.\extensions\markdown-language-features --extensionTestsPath=.\extensions\markdown-language-features\out\test %*
if %errorlevel% neq 0 exit /b %errorlevel%

call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\emmet\test-workspace --extensionDevelopmentPath=.\extensions\emmet --extensionTestsPath=.\extensions\emmet\out\test %*
if %errorlevel% neq 0 exit /b %errorlevel%

for /f "delims=" %%i in ('node -p "require('fs').realpathSync.native(require('os').tmpdir())"') do set TEMPDIR=%%i
set GITWORKSPACE=%TEMPDIR%\git-%RANDOM%
mkdir %GITWORKSPACE%
call node .\test\integration\browser\out\index.js --workspacePath=%GITWORKSPACE% --extensionDevelopmentPath=.\extensions\git --extensionTestsPath=.\extensions\git\out\test --enable-proposed-api=vscode.git %*
if %errorlevel% neq 0 exit /b %errorlevel%
