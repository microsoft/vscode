@echo off

set ELECTRON_RUN_AS_NODE=1

pushd %~dp0\..
.\.build\electron\Code.exe .\node_modules\mocha\bin\_mocha %*
popd
