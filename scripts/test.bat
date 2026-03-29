@echo off
setlocal

set ELECTRON_RUN_AS_NODE=

pushd %~dp0\..

:: Get Code.exe location
set "NAMESHORT="
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do if not defined NAMESHORT set "NAMESHORT=%%~a"
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

:: Download Electron if needed
if "%VSCODE_SKIP_PRELAUNCH%"=="" (
	call node build\lib\electron.ts
	if %errorlevel% neq 0 node .\node_modules\gulp\bin\gulp.js electron
)

:: Rewrite bare file paths (e.g. src\vs\foo.test.ts) into --run <file> arguments
set "ARGS="
for %%a in (%*) do call :processarg %%a

:: Run tests
set ELECTRON_ENABLE_LOGGING=1
%CODE% .\test\unit\electron\index.js --crash-reporter-directory=%~dp0\..\.build\crashes %ARGS%

popd

endlocal

:: app.exit(0) is exiting with code 255 in Electron 1.7.4.
:: See https://github.com/microsoft/vscode/issues/28582
echo errorlevel: %errorlevel%
if %errorlevel% == 255 set errorlevel=0

exit /b %errorlevel%

:processarg
set "ARG=%~1"
if "%ARG:~-3%"==".ts" if not "%ARG:~0,1%"=="-" (
	set "ARGS=%ARGS% --run %1"
	goto :eof
)
if "%ARG:~-3%"==".js" if not "%ARG:~0,1%"=="-" (
	set "ARGS=%ARGS% --run %1"
	goto :eof
)
set "ARGS=%ARGS% %1"
goto :eof
