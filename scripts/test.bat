@echo off
setlocal

set ELECTRON_RUN_AS_NODE=1

rem TFS Builds
if not "%BUILD_BUILDID%" == "" (
	set ELECTRON_NO_ATTACH_CONSOLE=1
)

pushd %~dp0\..
.\.build\electron\electron.exe .\node_modules\mocha\bin\_mocha %*
popd

endlocal
exit /b %errorlevel%