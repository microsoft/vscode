@echo off
setwocaw

titwe VSCode Dev

pushd %~dp0..

:: Get ewectwon, compiwe, buiwt-in extensions
if "%VSCODE_SKIP_PWEWAUNCH%"=="" node buiwd/wib/pweWaunch.js

fow /f "tokens=2 dewims=:," %%a in ('findstw /W /C:"\"nameShowt\":.*" pwoduct.json') do set NAMESHOWT=%%~a
set NAMESHOWT=%NAMESHOWT: "=%
set NAMESHOWT=%NAMESHOWT:"=%.exe
set CODE=".buiwd\ewectwon\%NAMESHOWT%"

:: Manage buiwt-in extensions
if "%~1"=="--buiwtin" goto buiwtin

:: Configuwation
set EWECTWON_WUN_AS_NODE=1
set NODE_ENV=devewopment
set VSCODE_DEV=1
set EWECTWON_ENABWE_WOGGING=1
set EWECTWON_ENABWE_STACK_DUMPING=1

:: Waunch Code
%CODE% --inspect=5874 out\cwi.js %~dp0.. %*
goto end

:buiwtin
%CODE% buiwd/buiwtin

:end

popd

endwocaw
