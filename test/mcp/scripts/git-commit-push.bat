@echo off
REM Git Commit and Push - Test Suite Changes

echo.
echo ========================================================
echo    📦 Git Commit: MCP Test Suite
echo ========================================================
echo.

cd /d "C:\Users\start export MA\vscode"

echo 📊 Current Git Status:
echo ────────────────────────────────────────────────────────
git status
echo.

echo 📁 Files to commit:
echo ────────────────────────────────────────────────────────
git status --short
echo.

set /p confirm="Commit and push these changes? (Y/N): "

if /i not "%confirm%"=="Y" (
    echo.
    echo ❌ Cancelled by user
    pause
    exit /b
)

echo.
echo 📝 Creating commit...
echo ────────────────────────────────────────────────────────

REM Stage all test files
git add test/mcp/scripts/
git add test/mcp/package.json
git add test/mcp/test-results/

echo.
echo 📋 Staged files:
git diff --cached --name-only

echo.
echo 💬 Commit message:
echo ────────────────────────────────────────────────────────
echo feat(mcp): Add comprehensive test suite for PR #268579
echo.
echo - Add mega test suite runner with HTML reports
echo - Add desktop vs web MCP comparison test
echo - Add performance benchmark suite (9 benchmarks)
echo - Add interactive remote control CLI
echo - Add Windows batch launchers
echo - Add complete documentation
echo - Update package.json with test scripts
echo.
echo Tests validate web MCP configuration added in PR #268579
echo ────────────────────────────────────────────────────────
echo.

set /p proceed="Proceed with commit? (Y/N): "

if /i not "%proceed%"=="Y" (
    echo.
    echo ❌ Commit cancelled
    git reset
    pause
    exit /b
)

git commit -m "feat(mcp): Add comprehensive test suite for PR #268579" -m "- Add mega test suite runner with HTML reports" -m "- Add desktop vs web MCP comparison test" -m "- Add performance benchmark suite (9 benchmarks)" -m "- Add interactive remote control CLI" -m "- Add Windows batch launchers" -m "- Add complete documentation" -m "- Update package.json with test scripts" -m "" -m "Tests validate web MCP configuration added in PR #268579"

if errorlevel 1 (
    echo.
    echo ❌ Commit failed
    pause
    exit /b 1
)

echo.
echo ✅ Commit successful!
echo.

echo 🚀 Current branch:
git branch --show-current

echo.
set /p push="Push to remote? (Y/N): "

if /i not "%push%"=="Y" (
    echo.
    echo ℹ️  Changes committed locally but not pushed
    echo 💡 Run 'git push' when ready
    pause
    exit /b
)

echo.
echo 📤 Pushing to remote...
echo ────────────────────────────────────────────────────────

git push

if errorlevel 1 (
    echo.
    echo ❌ Push failed
    echo 💡 You may need to set upstream: git push --set-upstream origin [branch]
    pause
    exit /b 1
)

echo.
echo ═══════════════════════════════════════════════════════
echo ✅ ALL DONE!
echo ═══════════════════════════════════════════════════════
echo.
echo Changes committed and pushed successfully!
echo.
echo 📋 Summary:
git log -1 --stat
echo.
echo ═══════════════════════════════════════════════════════
echo.

pause
