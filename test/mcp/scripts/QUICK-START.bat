@echo off
REM Quick launcher - Run this to get started!

echo.
echo ========================================================
echo    🎪 QUICK START - MCP Test Suite
echo ========================================================
echo.
echo This will run the MEGA TEST SUITE
echo.
echo What it does:
echo   ✓ Tests Desktop MCP configuration
echo   ✓ Tests Web MCP configuration (PR #268579)
echo   ✓ Compares performance
echo   ✓ Generates HTML report
echo.
echo This may take 5-10 minutes...
echo.
pause

cd /d "%~dp0"

echo.
echo 🚀 Starting tests...
echo.

node test-all.js

echo.
echo ========================================
echo.
echo ✅ Tests complete!
echo.
echo 📁 Check test results in:
echo    test-results\mega-test-report-*.html
echo.
echo 🌐 Open the HTML file in your browser to see:
echo    - Test summary
echo    - Performance comparison
echo    - Pass/fail status
echo.

REM Try to open the most recent HTML report
for /f "delims=" %%i in ('dir /b /od "..\test-results\*.html" 2^>nul') do set "latest=%%i"
if defined latest (
    echo 🎉 Opening test report...
    start "" "..\test-results\%latest%"
)

pause
