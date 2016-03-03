setlocal

set ATOM_SHELL_INTERNAL_RUN_AS_NODE=1

pushd %~dp0\..
start "" .\.build\electron\electron.exe .\node_modules\mocha\bin\_mocha %*
popd

endlocal