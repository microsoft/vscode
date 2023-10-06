@echo off
setlocal
if not defined npm_config_node_gyp (
	for /f "delims=" %%i in ('where node') do (set nodeDir=%%~dpi)
	echo nodeDir is
	echo %nodeDir%
	echo "%nodeDir%\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js"
	dir "%nodeDir%\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js"
	node "%nodeDir%\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js" %*
) else (
	node "%npm_config_node_gyp%" %*
)
endlocal
