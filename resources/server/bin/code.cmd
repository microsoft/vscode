@echo off
setlocal
call "%~dp0..\node" "%~dp0..\out\vs\server\cli.js" "@@APPNAME@@" "@@VERSION@@" "@@COMMIT@@" "@@APPNAME@@.cmd" %*
endlocal