@echo off
setlocal

set ATOM_SHELL_INTERNAL_RUN_AS_NODE=1

rem TFS Builds
if not "%BUILD_BUILDID%" == "" (
	set ELECTRON_NO_ATTACH_CONSOLE=1
)

rem APPVEYOR Builds
if not "%APPVEYOR%" == "" (
	set ELECTRON_NO_ATTACH_CONSOLE=1
)

pushd %~dp0\..

for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

%CODE% .\node_modules\mocha\bin\_mocha %*
popd

endlocal
exit /b %errorlevel%