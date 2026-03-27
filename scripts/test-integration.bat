@echo off
setlocal enabledelayedexpansion

pushd %~dp0\..

:: Parse arguments for help and filters
set "HAS_FILTER="
set "RUN_FILE="
set "RUN_GLOB="
set "GREP_PATTERN="
set "SUITE_FILTER="
set "SHOW_HELP="
set "EXTRA_ARGS="

set "ARGS=%*"
:parse_args
if "%~1"=="" goto done_parsing
if /i "%~1"=="--help" (set SHOW_HELP=1& shift & goto parse_args)
if /i "%~1"=="-h" (set SHOW_HELP=1& shift & goto parse_args)
if /i "%~1"=="--run" (set "RUN_FILE=%~2"& set HAS_FILTER=1& shift & shift & goto parse_args)
if /i "%~1"=="--grep" (set "GREP_PATTERN=%~2"& shift & shift & goto parse_args)
if /i "%~1"=="-g" (set "GREP_PATTERN=%~2"& shift & shift & goto parse_args)
if /i "%~1"=="-f" (set "GREP_PATTERN=%~2"& shift & shift & goto parse_args)
if /i "%~1"=="--runGlob" (set "RUN_GLOB=%~2"& set HAS_FILTER=1& shift & shift & goto parse_args)
if /i "%~1"=="--glob" (set "RUN_GLOB=%~2"& set HAS_FILTER=1& shift & shift & goto parse_args)
if /i "%~1"=="--runGrep" (set "RUN_GLOB=%~2"& set HAS_FILTER=1& shift & shift & goto parse_args)
if /i "%~1"=="--suite" (set "SUITE_FILTER=%~2"& shift & shift & goto parse_args)
shift
goto parse_args
:done_parsing

if defined SHOW_HELP (
	echo Usage: %~nx0 [options]
	echo.
	echo Runs integration tests. When no filters are given, all integration tests
	echo ^(node.js integration tests + extension host tests^) are run.
	echo.
	echo --run and --runGlob select which node.js integration test files to load.
	echo Extension host tests are skipped when these options are used.
	echo.
	echo --grep filters test cases by name across all test runners. When used alone,
	echo the pattern is applied to both node.js integration tests and all extension
	echo host suites. When combined with --suite, only the selected suites are run.
	echo.
	echo --suite selects which extension host test suites to run.
	echo Node.js integration tests are skipped when this option is used.
	echo.
	echo Options:
	echo   --run ^<file^>                  run tests from a specific file ^(src/ path^)
	echo   --runGlob, --glob ^<pattern^>   select test files by path glob ^(e.g. '**\*.integrationTest.js'^)
	echo   --grep, -g, -f ^<pattern^>      filter test cases by name ^(matched against test titles^)
	echo   --suite ^<pattern^>             run only matching extension host test suites
	echo                                 supports comma-separated list
	echo   --help, -h                    show this help
	echo.
	echo Available suites:
	echo   api-folder, api-workspace, colorize, terminal-suggest, typescript,
	echo   markdown, emmet, git, git-base, ipynb, notebook-renderers,
	echo   configuration-editing, github-authentication, css, html
	echo.
	echo All other options are forwarded to the node.js test runner ^(see scripts\test.bat --help^).
	echo Note: extra options are not forwarded to extension host suites ^(--suite mode^).
	echo.
	echo Examples:
	echo   %~nx0
	echo   %~nx0 --run src\vs\editor\test\browser\controller.integrationTest.ts
	echo   %~nx0 --grep "some test name"
	echo   %~nx0 --runGlob "**\*.integrationTest.js"
	echo   %~nx0 --suite git                             # run only Git tests
	echo   %~nx0 --suite "api-folder,api-workspace"       # run multiple suites
	echo   %~nx0 --suite api-folder --grep "some test"   # grep within a suite
	exit /b 0
)

set VSCODEUSERDATADIR=%TEMP%\vscodeuserfolder-%RANDOM%-%TIME:~6,2%
set VSCODECRASHDIR=%~dp0\..\.build\crashes
set VSCODELOGSDIR=%~dp0\..\.build\logs\integration-tests

:: Seed user settings to disable OS notifications (dock bounce, toast, etc.)
if not exist "%VSCODEUSERDATADIR%\User" mkdir "%VSCODEUSERDATADIR%\User"
(
echo {
echo 	"chat.notifyWindowOnConfirmation": "off",
echo 	"chat.notifyWindowOnResponseReceived": "off"
echo }
) > "%VSCODEUSERDATADIR%\User\settings.json"

:: Figure out which Electron to use for running tests
if "%INTEGRATION_TEST_ELECTRON_PATH%"=="" (
	chcp 65001
	set INTEGRATION_TEST_ELECTRON_PATH=.\scripts\code.bat
	set VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE=1

	echo Running integration tests out of sources.
) else (
	set VSCODE_CLI=1
	set ELECTRON_ENABLE_LOGGING=1

	echo Running integration tests with '%INTEGRATION_TEST_ELECTRON_PATH%' as build.
)

echo Storing crash reports into '%VSCODECRASHDIR%'.
echo Storing log files into '%VSCODELOGSDIR%'.


:: Validate --suite filter matches at least one known suite
if defined SUITE_FILTER (
	set "_any_match="
	for %%s in (api-folder api-workspace colorize terminal-suggest typescript markdown emmet git git-base ipynb notebook-renderers configuration-editing github-authentication css html) do (
		call :should_run_suite %%s && set "_any_match=1"
	)
	if not defined _any_match (
		echo Error: no suites match filter '%SUITE_FILTER%'
		echo Available suites: api-folder api-workspace colorize terminal-suggest typescript markdown emmet git git-base ipynb notebook-renderers configuration-editing github-authentication css html
		exit /b 1
	)
)


:: Node.js integration tests

if defined SUITE_FILTER goto skip_nodejs_tests
echo.
echo ### node.js integration tests
if defined RUN_GLOB (
	call .\scripts\test.bat %*
) else if defined RUN_FILE (
	call .\scripts\test.bat %*
) else (
	call .\scripts\test.bat --runGlob **\*.integrationTest.js %*
)
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_nodejs_tests

:: Skip extension host tests when a non-suite filter is active
if not defined SUITE_FILTER if defined HAS_FILTER (
	echo.
	echo Filter active, skipping extension host tests.
	rmdir /s /q %VSCODEUSERDATADIR% 2>nul
	exit /b 0
)


:: Tests in the extension host

:: Forward grep pattern to extension test runners
if defined GREP_PATTERN set "MOCHA_GREP=%GREP_PATTERN%"

set API_TESTS_EXTRA_ARGS=--disable-telemetry --disable-experiments --skip-welcome --skip-release-notes --crash-reporter-directory=%VSCODECRASHDIR% --logsPath=%VSCODELOGSDIR% --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-extensions --disable-workspace-trust --user-data-dir=%VSCODEUSERDATADIR%

call :should_run_suite api-folder || goto skip_api_folder
echo.
echo ### API tests (folder)
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testWorkspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\singlefolder-tests %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_api_folder

call :should_run_suite api-workspace || goto skip_api_workspace
echo.
echo ### API tests (workspace)
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\vscode-api-tests\testworkspace.code-workspace --enable-proposed-api=vscode.vscode-api-tests --extensionDevelopmentPath=%~dp0\..\extensions\vscode-api-tests --extensionTestsPath=%~dp0\..\extensions\vscode-api-tests\out\workspace-tests %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_api_workspace

call :should_run_suite colorize || goto skip_colorize
echo.
echo ### Colorize tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l vscode-colorize-tests %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_colorize

call :should_run_suite terminal-suggest || goto skip_terminal_suggest
echo.
echo ### Terminal Suggest tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l terminal-suggest --enable-proposed-api=vscode.vscode-api-tests %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_terminal_suggest

call :should_run_suite typescript || goto skip_typescript
echo.
echo ### TypeScript tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\typescript-language-features\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\typescript-language-features --extensionTestsPath=%~dp0\..\extensions\typescript-language-features\out\test\unit %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_typescript

call :should_run_suite markdown || goto skip_markdown
echo.
echo ### Markdown tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l markdown-language-features %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_markdown

call :should_run_suite emmet || goto skip_emmet
echo.
echo ### Emmet tests
call "%INTEGRATION_TEST_ELECTRON_PATH%" %~dp0\..\extensions\emmet\test-workspace --extensionDevelopmentPath=%~dp0\..\extensions\emmet --extensionTestsPath=%~dp0\..\extensions\emmet\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_emmet

call :should_run_suite git || goto skip_git
echo.
echo ### Git tests
for /f "delims=" %%i in ('node -p "require('fs').realpathSync.native(require('os').tmpdir())"') do set TEMPDIR=%%i
set GITWORKSPACE=%TEMPDIR%\git-%RANDOM%
mkdir %GITWORKSPACE%
call "%INTEGRATION_TEST_ELECTRON_PATH%" %GITWORKSPACE% --extensionDevelopmentPath=%~dp0\..\extensions\git --extensionTestsPath=%~dp0\..\extensions\git\out\test %API_TESTS_EXTRA_ARGS%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_git

call :should_run_suite git-base || goto skip_git_base
echo.
echo ### Git Base tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l git-base %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_git_base

call :should_run_suite ipynb || goto skip_ipynb
echo.
echo ### Ipynb tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l ipynb %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_ipynb

call :should_run_suite notebook-renderers || goto skip_notebook_renderers
echo.
echo ### Notebook Output tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l notebook-renderers %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_notebook_renderers

call :should_run_suite configuration-editing || goto skip_configuration_editing
echo.
echo ### Configuration editing tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l configuration-editing %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_configuration_editing

call :should_run_suite github-authentication || goto skip_github_authentication
echo.
echo ### GitHub Authentication tests
set "_grep_arg="
if defined GREP_PATTERN set "_grep_arg=--grep "%GREP_PATTERN%""
call npm run test-extension -- -l github-authentication %_grep_arg%
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_github_authentication

:: Tests standalone (CommonJS)

call :should_run_suite css || goto skip_css
echo.
echo ### CSS tests
call %~dp0\node-electron.bat %~dp0\..\extensions\css-language-features/server/test/index.js
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_css

call :should_run_suite html || goto skip_html
echo.
echo ### HTML tests
call %~dp0\node-electron.bat %~dp0\..\extensions\html-language-features/server/test/index.js
if %errorlevel% neq 0 exit /b %errorlevel%
:skip_html


:: Cleanup

rmdir /s /q %VSCODEUSERDATADIR%

popd

goto :end

:: Subroutine: check whether a suite should run based on SUITE_FILTER.
:: Returns errorlevel 0 if the suite should run, 1 if it should be skipped.
:should_run_suite
if not defined SUITE_FILTER exit /b 0
set "_suite_name=%~1"
:: Replace commas with spaces so for-loop tokenizes correctly
set "_filter=%SUITE_FILTER:,= %"
for %%p in (%_filter%) do (
	if /i "%%p"=="%_suite_name%" exit /b 0
)
exit /b 1

:end
endlocal
