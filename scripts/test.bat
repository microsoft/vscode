@echo off
setlocal

set ELECTRON_RUN_AS_NODE=1

-rem TFS Builds
if not "%BUILD_BUILDID%" == "" (
	set ELECTRON_NO_ATTACH_CONSOLE=1
)

pushd %~dp0\..

for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

%CODE% .\node_modules\mocha\bin\_mocha %* | .\resources\win32\bin\cat
popd

endlocal
exit /b %errorlevel%