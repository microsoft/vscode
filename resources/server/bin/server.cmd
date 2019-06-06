@echo off
setlocal

set _FIRST_ARG=%1
if "%_FIRST_ARG:~0,9%"=="--inspect" (
	set INSPECT=%1
	shift
) else (
	set INSPECT=
)

:loop1
if "%1"=="" goto after_loop
set RESTVAR=%RESTVAR% %1
shift
goto loop1

:after_loop

"%~dp0node" %INSPECT% "%~dp0out\vs\server\main.js" %RESTVAR%

endlocal