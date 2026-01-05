@echo off
REM 🎪 RUN EVERYTHING - Complete Test Execution
REM This is the ultimate "DO IT ALL" script!

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║    🎪 THE ULTIMATE MCP TESTING EXTRAVAGANZA 🎪            ║
echo ║                                                            ║
echo ║    Running ALL Creative Testing Ideas                     ║
echo ║    Testing PR #268579 - Web MCP Configuration             ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo.
echo 📋 What will happen:
echo ═══════════════════════════════════════════════════════════
echo.
echo   Phase 1: Setup environment
echo   Phase 2: Desktop vs Web Comparison
echo   Phase 3: Performance Benchmarking (9 tests)
echo   Phase 4: Remote Control Validation
echo   Phase 5: Generate Reports (JSON + HTML)
echo   Phase 6: Open Results in Browser
echo.
echo ⏱️  Estimated time: 5-10 minutes
echo 💾 Results: test-results\mega-test-report-*.html
echo.
echo ═══════════════════════════════════════════════════════════
echo.
set /p confirm="Ready to start? (Y/N): "

if /i not "%confirm%"=="Y" (
    echo.
    echo ❌ Cancelled by user
    pause
    exit /b
)

cd /d "%~dp0"

echo.
echo.
echo 🚀 STARTING MEGA TEST SUITE...
echo ═══════════════════════════════════════════════════════════
echo.

REM Run the mega test suite
node test-all.js

if errorlevel 1 (
    echo.
    echo ❌ Tests failed with errors
    echo 📝 Check the output above for details
    pause
    exit /b 1
)

echo.
echo ═══════════════════════════════════════════════════════════
echo ✅ ALL TESTS COMPLETED SUCCESSFULLY!
echo ═══════════════════════════════════════════════════════════
echo.
echo 📊 Results Summary:
echo.

REM Find the most recent JSON report
for /f "delims=" %%i in ('dir /b /od "..\test-results\mega-test-report-*.json" 2^>nul') do set "latest_json=%%i"

if defined latest_json (
    echo   📄 Report: test-results\%latest_json%
    
    REM Try to extract summary from JSON (simplified)
    findstr /C:"\"totalTests\"" /C:"\"passed\"" /C:"\"failed\"" /C:"\"successRate\"" "..\test-results\%latest_json%"
)

echo.
echo 📁 Generated Files:
dir /b /od "..\test-results\mega-test-report-*.*" 2>nul
dir /b /od "..\test-results\comparison-*.*" 2>nul
dir /b /od "..\test-results\benchmark-*.*" 2>nul

echo.
echo.
echo 🌐 Opening HTML Report...
echo ═══════════════════════════════════════════════════════════

REM Open the most recent HTML report
for /f "delims=" %%i in ('dir /b /od "..\test-results\mega-test-report-*.html" 2^>nul') do set "latest_html=%%i"

if defined latest_html (
    echo   Opening: %latest_html%
    start "" "..\test-results\%latest_html%"
    timeout /t 2 >nul
) else (
    echo   ⚠️  No HTML report found
)

echo.
echo.
echo 🎉 TESTING COMPLETE!
echo ═══════════════════════════════════════════════════════════
echo.
echo What you validated:
echo   ✅ PR #268579 web configuration works
echo   ✅ Desktop vs Web performance compared
echo   ✅ All 100+ MCP tools tested
echo   ✅ Feature parity verified
echo   ✅ Reports generated successfully
echo.
echo Next Steps:
echo   1. Review the HTML report (should be open)
echo   2. Check test-results\ folder for detailed data
echo   3. Share results with the team
echo   4. Approve or comment on PR #268579
echo.
echo ═══════════════════════════════════════════════════════════
echo.

pause

REM Offer to run interactive mode
echo.
echo.
echo 🎮 Want to try the INTERACTIVE REMOTE CONTROL?
set /p interactive="Run it now? (Y/N): "

if /i "%interactive%"=="Y" (
    echo.
    echo 🎮 Starting Remote Control Dashboard...
    echo ═══════════════════════════════════════════════════════════
    echo.
    echo Commands you can try:
    echo   start web        - Start web MCP server
    echo   tools            - List all 100+ automation tools
    echo   open README.md   - Open a file in VS Code
    echo   chat "test"      - Send message to Copilot
    echo   screenshot x.png - Take screenshot
    echo   exit             - Quit
    echo.
    node remote-control.js
)

echo.
echo 👋 Thanks for testing! Have a great day!
echo.
