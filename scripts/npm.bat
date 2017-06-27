@echo off
setlocal

rem check npm version is ^5.0.0
for /f %%i in ('npm -v') do set npm_version=%%i
if "%npm_version:~0,1%"!="5" (
	echo VS Code requires npm v5
	echo Please run npm i -g npm to update
	exit 1
)

set npm_config_disturl="https://atom.io/download/electron"
for /f "tokens=2 delims=:, " %%a in ('findstr /R /C:"\"electronVersion\":.*" "%~dp0..\package.json"') do set npm_config_target=%%~a
set npm_config_runtime="electron"
set npm_config_cache=~\.npm-electron
npm %*
endlocal
