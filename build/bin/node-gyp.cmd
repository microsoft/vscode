@echo off
setlocal
if not defined npm_config_node_gyp (
	for /f "delims=" %%i in ('where node') do (set nodeDir=%%~dpi)
	echo nodeDir is
	echo %nodeDir%
	node "%nodeDir%\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js" %*
) else (
	node "%npm_config_node_gyp%" %*
)
endlocal
