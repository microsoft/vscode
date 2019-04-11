@echo off
setlocal
call "%~dp0..\node" "%~dp0..\out\remoteCli.js" "@@APPNAME@@" "@@VERSION@@" "@@COMMIT@@" "@@APPNAME@@.cmd" "%VSCODE_CLIENT_COMMAND%" %*
endlocal