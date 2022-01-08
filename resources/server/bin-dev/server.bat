@echo off
setlocal

title VSCode Remote Agent

pushd %~dp0\..\..\..

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1

:: Sync built-in extensions
call yarn download-builtin-extensions

FOR /F "tokens=*" %%g IN ('node build/lib/node.js') do (SET NODE=%%g)

:: Download nodejs executable for remote
IF NOT EXIST "%NODE%" (
	call yarn gulp node
)

:: Launch Agent
set _FIRST_ARG=%1
if "%_FIRST_ARG:~0,9%"=="--inspect" (
	set INSPECT=%1
	shift
) else (
	set INSPECT=
)

:loop1
if "%~1"=="" goto after_loop
set RESTVAR=%RESTVAR% %1
shift
goto loop1

:after_loop

call "%NODE%" %INSPECT% "out\vs\server\main.js" %RESTVAR%

popd

endlocal
