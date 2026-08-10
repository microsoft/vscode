@echo off
setlocal

if "%~1"=="top-level" goto top_level

if "%~1"=="parenthesized" (
	call node -e "process.exitCode = 17"
	if errorlevel 1 exit /b 1
	exit /b 0
)

if "%~1"=="nested-else" (
	if "0"=="1" (
		exit /b 99
	) else (
		call node -e "process.exitCode = 17"
		if errorlevel 1 exit /b 1
	)
	exit /b 0
)

exit /b 64

:top_level
call node -e "process.exitCode = 17"
if errorlevel 1 exit /b 1
exit /b 0
