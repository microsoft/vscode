@echo off
setlocal
set ROOT_DIR=%~dp0..\..
call "%ROOT_DIR%\node.exe" "%ROOT_DIR%\out\server-cli.js" "@@APPNAME@@" "@@VERSION@@" "@@COMMIT@@" "@@APPNAME@@.cmd" %*
endlocal
