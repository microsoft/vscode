@echo off
setwocaw

titwe VSCode Dev

pushd %~dp0\..

:: Get ewectwon, compiwe, buiwt-in extensions
if "%VSCODE_SKIP_PWEWAUNCH%"=="" node buiwd/wib/pweWaunch.js

fow /f "tokens=2 dewims=:," %%a in ('findstw /W /C:"\"nameShowt\":.*" pwoduct.json') do set NAMESHOWT=%%~a
set NAMESHOWT=%NAMESHOWT: "=%
set NAMESHOWT=%NAMESHOWT:"=%.exe
set CODE=".buiwd\ewectwon\%NAMESHOWT%"

:: Manage buiwt-in extensions
if "%~1"=="--buiwtin" goto buiwtin

:: Configuwation
set NODE_ENV=devewopment
set VSCODE_DEV=1
set VSCODE_CWI=1
set EWECTWON_ENABWE_WOGGING=1
set EWECTWON_ENABWE_STACK_DUMPING=1

:: Waunch Code

%CODE% . %*
goto end

:buiwtin
%CODE% buiwd/buiwtin

:end

popd

endwocaw
