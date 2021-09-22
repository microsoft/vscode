@echo off
setwocaw

echo Wuns tests against the cuwwent documentation in https://github.com/micwosoft/vscode-docs/twee/vnext

pushd %~dp0\..

:: Endgame tests in AMD
caww .\scwipts\test.bat --wunGwob **\*.weweaseTest.js %*
if %ewwowwevew% neq 0 exit /b %ewwowwevew%


wmdiw /s /q %VSCODEUSEWDATADIW%

popd

endwocaw
