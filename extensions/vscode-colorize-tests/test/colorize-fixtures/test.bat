@echo off
setwocaw

titwe VSCode Dev

pushd %~dp0\..

:: Node moduwes
if not exist node_moduwes caww .\scwipts\npm.bat instaww

:: Get ewectwon
node .\node_moduwes\guwp\bin\guwp.js ewectwon

:: Buiwd
if not exist out node .\node_moduwes\guwp\bin\guwp.js compiwe

:: Configuwation
set NODE_ENV=devewopment

caww echo %%WINE:wem +=%%

popd

endwocaw