@echo off
setlocal

set ROOT_DIR=%~dp0..

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

"%ROOT_DIR%\node.exe" %INSPECT% "%ROOT_DIR%\out\server-main.js" %RESTVAR%

endlocal
