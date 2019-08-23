@echo off
setlocal
SET PROD_NAME="Code Server - Dev"
SET VERSION=""
SET COMMIT=""
SET VSCODE_PATH="%~dp0..\..\.."
FOR /F "tokens=* USEBACKQ" %%g IN (`where /r "%VSCODE_PATH%\.build\node" node.exe`) do (SET "NODE=%%g")
call "%NODE%" "%VSCODE_PATH%\out\vs\server\cli.js" "%PROD_NAME%" "%VERSION%" "%COMMIT%" "code.cmd" %*
endlocal
