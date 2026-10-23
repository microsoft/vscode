@echo off
setlocal

pushd %~dp0\..

if /i "%~1"=="--help" goto show_help
if /i "%~1"=="-h" goto show_help

if "%VSCODE_SKIP_AGENT_HOST_E2E%"=="1" (
	echo Skipping Agent Host E2E tests because VSCODE_SKIP_AGENT_HOST_E2E is set.
	set EXIT_CODE=0
	goto end
)

call node .\test\integration\agentHost\runner.ts %*
set EXIT_CODE=%errorlevel%
goto end

:show_help
echo Usage: %~nx0 [options]
echo.
echo Runs the deterministic Agent Host E2E suites, one isolated test process per
echo entrypoint, in parallel. scripts\test-integration.bat does not run them.
echo.
echo Options:
echo   --jobs ^<n^>                    maximum number of suites to run in parallel
echo   --shard ^<index^>/^<total^>       run only every ^<total^>th suite, starting with suite ^<index^>
echo   --grep, -g, -f ^<pattern^>      filter test cases by name
echo   --build                       use the out-build directory
echo   --help, -h                    show this help
echo.
echo All other options are forwarded to scripts\test.bat.
echo Set VSCODE_SKIP_AGENT_HOST_E2E=1 to skip the suites, for example when no relevant files changed.
echo See src\vs\platform\agentHost\test\node\e2e\README.md.
set EXIT_CODE=0

:end
popd
endlocal & exit /b %EXIT_CODE%
