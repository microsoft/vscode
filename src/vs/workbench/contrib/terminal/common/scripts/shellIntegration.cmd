@echo off
REM ---------------------------------------------------------------------------------------------
REM   Copyright (c) Microsoft Corporation. All rights reserved.
REM   Licensed under the MIT License. See License.txt in the project root for license information.
REM ---------------------------------------------------------------------------------------------

REM Prevent installing more than once per session
if defined __VSCODE_ORIGINAL_PROMPT (
	goto :EOF
)

REM Store the original prompt
set __VSCODE_ORIGINAL_PROMPT=%PROMPT%

REM Clear the nonce
set VSCODE_NONCE=

REM Set up the shell integration prompt
REM OSC 633 sequences:
REM   A - Prompt started
REM   B - Command started  
REM   D - Command finished (without exit code for now)
REM   P;Cwd=<path> - Current working directory

PROMPT $e]633;D$e\$e]633;A$e\$e]633;P;Cwd=$P$e\%__VSCODE_ORIGINAL_PROMPT%$e]633;B$e\

REM Report shell integration capabilities  
echo $e]633;P;HasRichCommandDetection=False$e\

REM Report this is Windows
echo $e]633;P;IsWindows=true$e\

REM Report environment variables if enabled (basic support)
if defined VSCODE_SHELL_ENV_REPORTING (
	for %%v in (%VSCODE_SHELL_ENV_REPORTING:,= %) do (
		if defined %%v (
			call echo $e]633;EnvSingleEntry;%%v;%%%%v%%;%VSCODE_NONCE%$e\
		)
	)
	set VSCODE_SHELL_ENV_REPORTING=
)