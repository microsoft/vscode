@echo off
setlocal
if not defined npm_config_node_gyp (
  for /f "delims=" %%i in ('where node') do (set nodeDir=%%~dpi)
	echo %nodeDir%
	dir %nodeDir%
	dir %nodeDir%\node_modules
) else (
  node "%npm_config_node_gyp%" %*
)
endlocal
