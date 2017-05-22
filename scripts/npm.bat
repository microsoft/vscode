@echo off
setlocal
set npm_config_disturl="https://atom.io/download/electron"
for /f "tokens=2 delims=:, " %%a in ('findstr /R /C:"\"electronVersion\":.*" "%~dp0..\package.json"') do set npm_config_target=%%~a
set npm_config_runtime="electron"
set npm_config_cache=~\.npm-electron
npm %*
endlocal
