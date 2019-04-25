@echo off
setlocal
call "%~dp0..\node" "%~dp0..\out\remoteCli.js" "@@APPNAME@@" "@@VERSION@@" "@@COMMIT@@" "@@APPNAME@@.cmd" %*
endlocal