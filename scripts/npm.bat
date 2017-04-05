@echo off
setlocal

set npm_config_disturl="https://atom.io/download/atom-shell"
for /f "tokens=2 delims=:, " %%a in ('findstr /R /C:"\"electronVersion\":.*" "%~dp0..\package.json"') do set npm_config_target=%%~a
set npm_config_arch="ia32"
set npm_config_runtime="electron"
set HOME=~\.electron-gyp

npm %*

endlocal
