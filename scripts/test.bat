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
call :rewriteargs %*

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

:rewriteargs
if "%~1"=="" goto :eof
:: Skip rewriting the value of flags that take an argument
if /i "%~1"=="--run" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--runGlob" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--glob" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--runGrep" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--grep" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="-g" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="-f" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--reporter" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--reporter-options" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--waitServer" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--timeout" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--crash-reporter-directory" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--tfs" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--coveragePath" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--coverageFormats" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
if /i "%~1"=="--testSplit" (set "ARGS=%ARGS% %1 %2"& shift & shift & goto rewriteargs)
call :processarg %1
shift
goto rewriteargs

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
