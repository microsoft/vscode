@echo off
setlocal

set ELECTRON_RUN_AS_NODE=

pushd %~dp0\..

for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

rem Run tests in electron
%CODE% .\test\electron\index.js %*

popd

endlocal
exit /b %errorlevel%
