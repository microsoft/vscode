@echo off
setlocal
set ROOT_DIR=%~dp0..\..
start "Open Browser" /B "%ROOT_DIR%\node.exe" "%ROOT_DIR%\out\server-cli.js" "@@APPNAME@@" "@@VERSION@@" "@@COMMIT@@" "@@APPNAME@@.cmd" "--openExternal" "%*"
endlocal
