# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
#
# Visual Studio Code terminal integration for fish
#
# Manual installation:
#
#   (1) Add the following to the end of `$__fish_config_dir/config.fish`:
#
#         string match -q "$TERM_PROGRAM" "vscode"
#         and . (code --locate-shell-integration-path fish)
#
#   (2) Restart fish.

# Don't run in scripts, other terminals, or more than once per session.
status is-interactive
and string match --quiet "$TERM_PROGRAM" "vscode"
and ! set --query VSCODE_SHELL_INTEGRATION
or exit

set --global VSCODE_SHELL_INTEGRATION 1

# Helper function
function __vsc_esc -d "Emit escape sequences for VS Code shell integration"
	builtin printf "\e]633;%s\a" (string join ";" $argv)
end

# Sent right before executing an interactive command.
# Marks the beginning of command output.
function __vsc_cmd_executed --on-event fish_preexec
	__vsc_esc C
	__vsc_esc E (__vsc_escape_value "$argv")

	# Creates a marker to indicate a command was run.
	set --global _vsc_has_cmd
end


# Escape a value for use in the 'P' ("Property") or 'E' ("Command Line") sequences.
# Backslashes are doubled and non-alphanumeric characters are hex encoded.
function __vsc_escape_value
	# Replace all non-alnum characters with %XX hex form.
	string escape --style=url "$argv" \
	# The characters [-./_~] are not encoded in the builtin url escaping, despite not being alphanumeric.
	# See: https://github.com/fish-shell/fish-shell/blob/f82537bcdcb32f85a530395f00e7be1aa9afc592/src/common.cpp#L738
	# For consistency, also encode those characters.
	| string replace --all '-' '%2D' \
	| string replace --all '.' '%2E' \
	| string replace --all '/' '%2F' \
	| string replace --all '_' '%5F' \
	| string replace --all '~' '%7E' \
	# Now everything is either alphanumeric [0-9A-Za-z] or %XX escapes.
	# Change the hex escape representation from '%' to '\x'. (e.g. ' ' → '%20' → '\x20').
	# Note that all '%' characters are escapes: literal '%' will already have been encoded.
	| string replace --all '%' '\\x' \
	# For readability, prefer to represent literal backslashes with doubling. ('\' → '%5C' → '\x5C' → '\\').
	| string replace --all --ignore-case '%5C' '\\\\' \
	;
end

# Sent right after an interactive command has finished executing.
# Marks the end of command output.
function __vsc_cmd_finished --on-event fish_postexec
	__vsc_esc D $status
end

# Sent when a command line is cleared or reset, but no command was run.
# Marks the cleared line with neither success nor failure.
function __vsc_cmd_clear --on-event fish_cancel
	__vsc_esc D
end

# Sent whenever a new fish prompt is about to be displayed.
# Updates the current working directory.
function __vsc_update_cwd --on-event fish_prompt
	__vsc_esc P "Cwd=$(__vsc_escape_value "$PWD")"

	# If a command marker exists, remove it.
	# Otherwise, the commandline is empty and no command was run.
	if set --query _vsc_has_cmd
		set --erase _vsc_has_cmd
	else
		__vsc_cmd_clear
	end
end

# Sent at the start of the prompt.
# Marks the beginning of the prompt (and, implicitly, a new line).
function __vsc_fish_prompt_start
	__vsc_esc A
end

# Sent at the end of the prompt.
# Marks the beginning of the user's command input.
function __vsc_fish_cmd_start
	__vsc_esc B
end

function __vsc_fish_has_mode_prompt -d "Returns true if fish_mode_prompt is defined and not empty"
	functions fish_mode_prompt | string match -rvq '^ *(#|function |end$|$)'
end

# Preserve the user's existing prompt, to wrap in our escape sequences.
functions --copy fish_prompt __vsc_fish_prompt

# Preserve and wrap fish_mode_prompt (which appears to the left of the regular
# prompt), but only if it's not defined as an empty function (which is the
# officially documented way to disable that feature).
if __vsc_fish_has_mode_prompt
	functions --copy fish_mode_prompt __vsc_fish_mode_prompt

	function fish_mode_prompt
		__vsc_fish_prompt_start
		__vsc_fish_mode_prompt
	end

	function fish_prompt
		__vsc_fish_prompt
		__vsc_fish_cmd_start
	end
else
	# No fish_mode_prompt, so put everything in fish_prompt.
	function fish_prompt
		__vsc_fish_prompt_start
		__vsc_fish_prompt
		__vsc_fish_cmd_start
	end
end
