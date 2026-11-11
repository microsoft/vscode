@ECHO off
GOTO start
:start
node  "%~dp0\node_modules\@github\copilot\index.js" %*
