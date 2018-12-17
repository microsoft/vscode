@echo off
setlocal

pushd %~dp0\..

:: Endgame tests in AMD
call .\scripts\test.bat --runGlob **\*.releaseTest.js %*
if %errorlevel% neq 0 exit /b %errorlevel%


rmdir /s /q %VSCODEUSERDATADIR%

popd

endlocal
