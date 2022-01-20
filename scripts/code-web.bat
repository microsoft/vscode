@echo off
setlocal

title VSCode Web Serverless

pushd %~dp0\..

:: Sync built-in extensions
call yarn download-builtin-extensions

:: Download nodejs executable for remote
call yarn gulp node

:: Launch Server
FOR /F "tokens=*" %%g IN ('node build/lib/node.js') do (SET NODE=%%g)
call "%NODE%" resources\web\bin-dev\code-web-playground.js %*

popd

endlocal
