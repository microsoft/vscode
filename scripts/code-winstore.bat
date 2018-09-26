@echo off
setlocal

title VSCode Dev

pushd %~dp0\..

:: Node modules
if not exist node_modules call yarn

:: Download Electron if needed
node build\lib\electron.js

:: Build, Install and Run Code
if %errorlevel% neq 0 node .\node_modules\gulp\bin\gulp.js vscode-winstore-run

pause
popd
endlocal