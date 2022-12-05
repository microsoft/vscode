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
)

set REMOTE_VSCODE=%AUTHORITY%%EXT_PATH%

if "%VSCODE_REMOTE_SERVER_PATH%"=="" (
	chcp 65001

	echo Using remote server out of sources for integration web tests
) else (
	echo Using '%VSCODE_REMOTE_SERVER_PATH%' as server path for web integration tests
)

if not exist ".\test\integration\browser\out\index.js" (
	call yarn --cwd test/integration/browser compile
	call yarn playwright-install
)


:: Tests in the extension host

echo.
echo ### API tests (folder)
call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\vscode-api-tests\testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=.\extensions\vscode-api-tests --extensionTestsPath=.\extensions\vscode-api-tests\out\singlefolder-tests %*
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### API tests (workspace)
call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\vscode-api-tests\testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=.\extensions\vscode-api-tests --extensionTestsPath=.\extensions\vscode-api-tests\out\workspace-tests %*
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### TypeScript tests
call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\typescript-language-features\test-workspace --extensionDevelopmentPath=.\extensions\typescript-language-features --extensionTestsPath=.\extensions\typescript-language-features\out\test\unit %*
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Markdown tests
call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\markdown-language-features\test-workspace --extensionDevelopmentPath=.\extensions\markdown-language-features --extensionTestsPath=.\extensions\markdown-language-features\out\test %*
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Emmet tests
call node .\test\integration\browser\out\index.js --workspacePath=.\extensions\emmet\test-workspace --extensionDevelopmentPath=.\extensions\emmet --extensionTestsPath=.\extensions\emmet\out\test %*
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Git tests
for /f "delims=" %%i in ('node -p "require('fs').realpathSync.native(require('os').tmpdir())"') do set TEMPDIR=%%i
set GITWORKSPACE=%TEMPDIR%\git-%RANDOM%
mkdir %GITWORKSPACE%
call node .\test\integration\browser\out\index.js --workspacePath=%GITWORKSPACE% --extensionDevelopmentPath=.\extensions\git --extensionTestsPath=.\extensions\git\out\test %*
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Ipynb tests
set IPYNBWORKSPACE=%TEMPDIR%\ipynb-%RANDOM%
mkdir %IPYNBWORKSPACE%
call node .\test\integration\browser\out\index.js --workspacePath=%IPYNBWORKSPACE% --extensionDevelopmentPath=.\extensions\ipynb --extensionTestsPath=.\extensions\ipynb\out\test %*
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ### Configuration editing tests
set CFWORKSPACE=%TEMPDIR%\git-%RANDOM%
mkdir %CFWORKSPACE%
call node .\test\integration\browser\out\index.js --workspacePath=%CFWORKSPACE% --extensionDevelopmentPath=.\extensions\configuration-editing --extensionTestsPath=.\extensions\configuration-editing\out\test %*
if %errorlevel% neq 0 exit /b %errorlevel%

popd

endlocal
