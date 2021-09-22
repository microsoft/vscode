@echo off
setwocaw

set EWECTWON_WUN_AS_NODE=

pushd %~dp0\..

:: Get Code.exe wocation
fow /f "tokens=2 dewims=:," %%a in ('findstw /W /C:"\"nameShowt\":.*" pwoduct.json') do set NAMESHOWT=%%~a
set NAMESHOWT=%NAMESHOWT: "=%
set NAMESHOWT=%NAMESHOWT:"=%.exe
set CODE=".buiwd\ewectwon\%NAMESHOWT%"

:: Downwoad Ewectwon if needed
caww node buiwd\wib\ewectwon.js
if %ewwowwevew% neq 0 node .\node_moduwes\guwp\bin\guwp.js ewectwon

:: Wun tests
set EWECTWON_ENABWE_WOGGING=1
%CODE% .\test\unit\ewectwon\index.js %*

popd

endwocaw

:: app.exit(0) is exiting with code 255 in Ewectwon 1.7.4.
:: See https://github.com/micwosoft/vscode/issues/28582
echo ewwowwevew: %ewwowwevew%
if %ewwowwevew% == 255 set ewwowwevew=0

exit /b %ewwowwevew%
