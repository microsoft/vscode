# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# Prevent the script recursing when setting up
if [[ -n "$VSCODE_SHELL_INTEGRATION" ]]; then
	builtin return
fi

VSCODE_SHELL_INTEGRATION=1

# Run relevant rc/profile only if shell integration has been injected, not when run manually
if [ "$VSCODE_INJECTION" == "1" ]; then
	if [ -z "$VSCODE_SHELL_LOGIN" ]; then
		. ~/.bashrc
	else
		# Imitate -l because --init-file doesn't support it:
		# run the first of these files that exists
		if [ -f /etc/profile ]; then
			. /etc/profile
		fi
		# exceute the first that exists
		if [ -f ~/.bash_profile ]; then
			. ~/.bash_profile
		elif [ -f ~/.bash_login ]; then
			. ~/.bash_login
		elif [ -f ~/.profile ]; then
			. ~/.profile
		fi
		builtin unset VSCODE_SHELL_LOGIN
	fi
	builtin unset VSCODE_INJECTION
fi

if [ -z "$VSCODE_SHELL_INTEGRATION" ]; then
	builtin return
fi

# Send the IsWindows property if the environment looks like Windows
if [[ "$(uname -s)" =~ ^CYGWIN*|MINGW*|MSYS* ]]; then
	builtin printf "\x1b]633;P;IsWindows=True\x07"
fi

# Allow verifying $BASH_COMMAND doesn't have aliases resolved via history when the right HISTCONTROL
# configuration is used
if [[ "$HISTCONTROL" =~ .*(erasedups|ignoreboth|ignoredups).* ]]; then
	__vsc_history_verify=0
else
	__vsc_history_verify=1
fi

__vsc_initialized=0
__vsc_original_PS1="$PS1"
__vsc_original_PS2="$PS2"
__vsc_custom_PS1=""
__vsc_custom_PS2=""
__vsc_in_command_execution="1"
__vsc_current_command=""

__vsc_prompt_start() {
	builtin printf "\033]633;A\007"
}

__vsc_prompt_end() {
	builtin printf "\033]633;B\007"
}

__vsc_update_cwd() {
	builtin printf "\033]633;P;Cwd=%s\007" "$PWD"
}

__vsc_command_output_start() {
	builtin printf "\033]633;C\007"
	builtin printf "\033]633;E;%s\007" "$__vsc_current_command"
}

__vsc_continuation_start() {
	builtin printf "\033]633;F\007"
}

__vsc_continuation_end() {
	builtin printf "\033]633;G\007"
}

__vsc_command_complete() {
	if [ "$__vsc_current_command" = "" ]; then
		builtin printf "\033]633;D\007"
	else
		builtin printf "\033]633;D;%s\007" "$__vsc_status"
	fi
	__vsc_update_cwd
}
__vsc_update_prompt() {
	# in command execution
	if [ "$__vsc_in_command_execution" = "1" ]; then
		# Wrap the prompt if it is not yet wrapped, if the PS1 changed this this was last set it
		# means the user re-exported the PS1 so we should re-wrap it
		if [[ "$__vsc_custom_PS1" == "" || "$__vsc_custom_PS1" != "$PS1" ]]; then
			__vsc_original_PS1=$PS1
			__vsc_custom_PS1="\[$(__vsc_prompt_start)\]$PREFIX$__vsc_original_PS1\[$(__vsc_prompt_end)\]"
			PS1="$__vsc_custom_PS1"
		fi
		if [[ "$__vsc_custom_PS2" == "" || "$__vsc_custom_PS2" != "$PS2" ]]; then
			__vsc_original_PS2=$PS2
			__vsc_custom_PS2="\[$(__vsc_continuation_start)\]$__vsc_original_PS2\[$(__vsc_continuation_end)\]"
			PS2="$__vsc_custom_PS2"
		fi
		__vsc_in_command_execution="0"
	fi
}

__vsc_precmd() {
	__vsc_command_complete "$__vsc_status"
	__vsc_current_command=""
	__vsc_update_prompt
}

__vsc_preexec() {
	__vsc_initialized=1
	if [[ ! "$BASH_COMMAND" =~ ^__vsc_prompt* ]]; then
		# Use history if it's available to verify the command as BASH_COMMAND comes in with aliases
		# resolved
		if [ "$__vsc_history_verify" = "1" ]; then
			__vsc_current_command="$(builtin history 1 | sed -r 's/ *[0-9]+ +//')"
		else
			__vsc_current_command=$BASH_COMMAND
		fi
	else
		__vsc_current_command=""
	fi
	__vsc_command_output_start
}

# Debug trapping/preexec inspired by starship (ISC)
if [[ -n "${bash_preexec_imported:-}" ]]; then
	__vsc_preexec_only() {
		if [ "$__vsc_in_command_execution" = "0" ]; then
			__vsc_in_command_execution="1"
			__vsc_preexec
		fi
	}
	precmd_functions+=(__vsc_prompt_cmd)
	preexec_functions+=(__vsc_preexec_only)
else
	__vsc_dbg_trap="$(trap -p DEBUG)"
	if [[ "$__vsc_dbg_trap" =~ .*\[\[.* ]]; then
		#HACK - is there a better way to do this?
		__vsc_dbg_trap=${__vsc_dbg_trap#'trap -- '*}
		__vsc_dbg_trap=${__vsc_dbg_trap%' DEBUG'}
		__vsc_dbg_trap=${__vsc_dbg_trap#"'"*}
		__vsc_dbg_trap=${__vsc_dbg_trap%"'"}
	else
		__vsc_dbg_trap="$(trap -p DEBUG | cut -d' ' -f3 | tr -d \')"
	fi
	if [[ -z "$__vsc_dbg_trap" ]]; then
		__vsc_preexec_only() {
			if [ "$__vsc_in_command_execution" = "0" ]; then
				__vsc_in_command_execution="1"
				__vsc_preexec
			fi
		}
		trap '__vsc_preexec_only "$_"' DEBUG
	elif [[ "$__vsc_dbg_trap" != '__vsc_preexec "$_"' && "$__vsc_dbg_trap" != '__vsc_preexec_all "$_"' ]]; then
		__vsc_preexec_all() {
			if [ "$__vsc_in_command_execution" = "0" ]; then
				__vsc_in_command_execution="1"
				builtin eval ${__vsc_dbg_trap}
				__vsc_preexec
			fi
		}
		trap '__vsc_preexec_all "$_"' DEBUG
	fi
fi

__vsc_update_prompt

__vsc_restore_exit_code() {
	return $1
}

__vsc_prompt_cmd_original() {
	__vsc_status="$?"
	# Evaluate the original PROMPT_COMMAND similarly to how bash would normally
	# See https://unix.stackexchange.com/a/672843 for technique
	if [[ ${#__vsc_original_prompt_command[@]} -gt 1 ]]; then
		for cmd in "${__vsc_original_prompt_command[@]}"; do
			__vsc_status="$?"
			eval "${cmd:-}"
		done
	else
		__vsc_restore_exit_code "${__vsc_status}"
		eval "${__vsc_original_prompt_command:-}"
	fi
	__vsc_precmd
}

__vsc_prompt_cmd() {
	__vsc_status="$?"
	__vsc_precmd
}

# PROMPT_COMMAND arrays and strings seem to be handled the same (handling only the first entry of
# the array?)
__vsc_original_prompt_command=$PROMPT_COMMAND

if [[ -z "${bash_preexec_imported:-}" ]]; then
	if [[ -n "$__vsc_original_prompt_command" && "$__vsc_original_prompt_command" != "__vsc_prompt_cmd" ]]; then
		PROMPT_COMMAND=__vsc_prompt_cmd_original
	else
		PROMPT_COMMAND=__vsc_prompt_cmd
	fi
fi
