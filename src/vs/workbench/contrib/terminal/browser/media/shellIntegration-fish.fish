# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# Manual installation:
#
#   (1) Add the following to the end of `$__fish_config_dir/config.fish`:
#
#         string match -q "$TERM_PROGRAM" "vscode"
#         and . (code --locate-shell-integration-path fish)
#
#   (2) Restart fish.

# ---------------------------------------------------------------------------------------------
# TODO: Confirm all escape sequences once they are finalized.
# See microsoft/vscode#155639 and microsoft/vscode#139400 for discussion.
# ---------------------------------------------------------------------------------------------

# Don't run in scripts, other terminals, or more than once per session.
status is-interactive
and string match --quiet "$TERM_PROGRAM" "vscode"
and ! set --query VSCODE_SHELL_INTEGRATION
or return

set --global VSCODE_SHELL_INTEGRATION 1

# Helper function
function __vsc_esc -d "Emit escape sequences for VS Code shell integration"
	builtin printf "\e]633;%s\007" (string join ";" $argv)
end

# Sent right before executing an interactive command.
# Marks the beginning of command output.
function __vsc_cmd_executed --on-event fish_preexec
	__vsc_esc C
	__vsc_esc E "$argv"
end

# Sent right after an interactive command has finished executing.
# Marks the end of command output.
function __vsc_cmd_finished --on-event fish_postexec
	__vsc_esc D $status
end

# Sent whenever a new fish prompt is about to be displayed.
# Updates the current working directory.
function __vsc_update_cwd --on-event fish_prompt
	__vsc_esc P "Cwd=$PWD"
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

# Sent at the start of the right-side prompt, if any.
function __vsc_fish_right_prompt_start
	__vsc_esc H
end

# Sent at the end of the right-side prompt, if any.
function __vsc_fish_right_prompt_end
	__vsc_esc I
end

# Preserve the user's existing prompt, and wrap it in our escape sequences.
functions --copy fish_prompt __vsc_fish_prompt

function fish_prompt
	__vsc_fish_prompt_start
	__vsc_fish_prompt
	__vsc_fish_cmd_start
end

# Likewise for the right-side prompt, if it exists.
if functions --query fish_right_prompt
	functions --copy fish_right_prompt __vsc_fish_right_prompt

	function fish_right_prompt
		__vsc_fish_right_prompt_start
		__vsc_fish_right_prompt
		__vsc_fish_right_prompt_end
	end
end
