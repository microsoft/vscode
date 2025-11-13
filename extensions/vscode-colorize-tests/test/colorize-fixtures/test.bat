@echo off
setlocal

title VSCode Dev

pushd %~dp0\..

:: Node modules
if not exist node_modules call npm i

:: Get electron
npm run _gulp electron

:: Build
if not exist out npm run _gulp compile

:: Configuration
set NODE_ENV=development

call echo %%LINE:rem +=%%

popd

endlocal
