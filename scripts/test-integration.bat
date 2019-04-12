@echo off
setlocal

pushd %~dp0\..

set VSCODEUSERDATADIR=%TMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,5%

:: Integration & performance tests in AMD
call .\scripts\test.bat --runGlob **\*.integrationTest.js %*
if %errorlevel% neq 0 exit /b %errorlevel%

:: Tests in the extension host
call .\scripts\code.bat %~dp0\..\extensions\vscode-api-tests\testWorkspace --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\singlefolder-tests --disable-extensions --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call .\scripts\code.bat %~dp0\..\extensions\vscode-api-tests\testworkspace.code-workspace --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\workspace-tests --disable-extensions --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call .\scripts\code.bat %~dp0\..\extensions\vscode-colorize-tests\test --extensionDevelopmentPath=%~dp0\..\extensions\vscode-colorize-tests --extensionTestsPath=%~dp0\..\extensions\vscode-colorize-tests\out --disable-extensions --user-data-dir=%VSCODEUSERDATADIR%
if %errorlevel% neq 0 exit /b %errorlevel%

call .\scripts\code.bat $%~dp0\..\extensions\emmet\test-fixtures --extensionDevelopmentPath=%~dp0\..\extensions\emmet --extensionTestsPath=%~dp0\..\extensions\emmet\out\test --disable-extensions --user-data-dir=%VSCODEUSERDATADIR% .
if %errorlevel% neq 0 exit /b %errorlevel%

:: Tests in commonJS (HTML, CSS, JSON language server tests...)
call .\scripts\node-electron.bat .\node_modules\mocha\bin\_mocha .\extensions\*\server\out\test\**\*.test.js
if %errorlevel% neq 0 exit /b %errorlevel%

rmdir /s /q %VSCODEUSERDATADIR%

popd

endlocal
