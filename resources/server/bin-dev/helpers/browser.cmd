@echo off
setlocal
SET VSCODE_PATH=%~dp0..\..\..\..
FOR /F "tokens=* USEBACKQ" %%g IN (`where /r "%VSCODE_PATH%\.build\node" node.exe`) do (SET "NODE=%%g")
call "%NODE%" "%VSCODE_PATH%\out\server-cli.js" "Code Server - Dev" "" "" "code.cmd" "--openExternal" %*
endlocal
