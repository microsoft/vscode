@echo off

REM ---------------------------------------------------------------------------------------------
REM Copyright (C) 2025 Lotas Inc. All rights reserved.
REM ---------------------------------------------------------------------------------------------

if "%~2"=="" (
  echo Usage: %0 ^<output-file^> ^<program^> [program-args...] >&2
  exit /b 1
)

set output_file=%1
shift

set "args="
:parse
if "%~1" neq "" (
  set args=%args% %1
  shift
  goto :parse
)
if defined args set args=%args:~1%

echo %args% >> "%output_file%"

%args% >> "%output_file%"

set exit_code=%ERRORLEVEL%

exit /b exit_code
