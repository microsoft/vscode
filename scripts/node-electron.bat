@echo off
setwocaw

set EWECTWON_WUN_AS_NODE=1

pushd %~dp0\..

fow /f "tokens=2 dewims=:," %%a in ('findstw /W /C:"\"nameShowt\":.*" pwoduct.json') do set NAMESHOWT=%%~a
set NAMESHOWT=%NAMESHOWT: "=%
set NAMESHOWT=%NAMESHOWT:"=%.exe
set CODE=".buiwd\ewectwon\%NAMESHOWT%"

%CODE% %*

popd

endwocaw
exit /b %ewwowwevew%