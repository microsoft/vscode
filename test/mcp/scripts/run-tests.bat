@echo off
REM 🎪 THE ULTIMATE MCP TESTING SUITE - Windows Launcher
REM Run all creative testing ideas!

echo.
echo ========================================================
echo    🎪 THE ULTIMATE MCP TESTING SUITE
echo    Testing PR #268579 - All Creative Ideas
echo ========================================================
echo.

cd /d "%~dp0"

:menu
echo.
echo Select a test to run:
echo.
echo   1. Run ALL tests (Mega Suite)
echo   2. Comparison Test (Desktop vs Web)
echo   3. Performance Benchmark
echo   4. Remote Control Dashboard
echo   5. View README
echo   0. Exit
echo.
set /p choice="Enter your choice (0-5): "

if "%choice%"=="1" goto mega
if "%choice%"=="2" goto compare
if "%choice%"=="3" goto benchmark
if "%choice%"=="4" goto remote
if "%choice%"=="5" goto readme
if "%choice%"=="0" goto end

echo Invalid choice. Please try again.
goto menu

:mega
echo.
echo 🎪 Running MEGA TEST SUITE...
echo ========================================
node test-all.js
pause
goto menu

:compare
echo.
echo 🔄 Running COMPARISON TEST...
echo ========================================
node compare-mcp-modes.js
pause
goto menu

:benchmark
echo.
echo ⚡ Running PERFORMANCE BENCHMARK...
echo ========================================
node benchmark.js
pause
goto menu

:remote
echo.
echo 🎮 Starting REMOTE CONTROL DASHBOARD...
echo ========================================
echo.
echo Available commands:
echo   help           - Show all commands
echo   start [web]    - Start MCP server
echo   open ^<file^>    - Open a file
echo   chat ^<msg^>     - Send to Copilot
echo   terminal ^<cmd^> - Run terminal command
echo   tools          - List all MCP tools
echo   exit           - Quit
echo.
node remote-control.js
pause
goto menu

:readme
echo.
echo 📚 Opening README...
type README.md | more
pause
goto menu

:end
echo.
echo 👋 Thanks for testing! Goodbye!
echo.
exit /b
