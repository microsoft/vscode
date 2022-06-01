# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

VSCODE_SHELL_INTEGRATION=1

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
	VSCODE_SHELL_LOGIN=""
fi

if [[ "$PROMPT_COMMAND" =~ .*(' '.*\;)|(\;.*' ').* ]]; then
	VSCODE_SHELL_INTEGRATION=""
	builtin return
fi

if [ -z "$VSCODE_SHELL_INTEGRATION" ]; then
	builtin return
fi

__vsc_in_command_execution="1"
__vsc_last_history_id=$(history 1 | awk '{print $1;}')

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
}

__vsc_continuation_start() {
	builtin printf "\033]633;F\007"
}

__vsc_continuation_end() {
	builtin printf "\033]633;G\007"
}

__vsc_command_complete() {
	local __vsc_history_id=$(builtin history 1 | awk '{print $1;}')
	if [[ "$__vsc_history_id" == "$__vsc_last_history_id" ]]; then
		builtin printf "\033]633;D\007"
	else
		builtin printf "\033]633;D;%s\007" "$__vsc_status"
		__vsc_last_history_id=$__vsc_history_id
	fi
	__vsc_update_cwd
}

__vsc_update_prompt() {
	__vsc_prior_prompt="$PS1"
	__vsc_in_command_execution=""
	PS1="\[$(__vsc_prompt_start)\]$PREFIX$PS1\[$(__vsc_prompt_end)\]"
	PS2="\[$(__vsc_continuation_start)\]$PS2\[$(__vsc_continuation_end)\]"
}

__vsc_precmd() {
	__vsc_command_complete "$__vsc_status"

	# in command execution
	if [ -n "$__vsc_in_command_execution" ]; then
		# non null
		__vsc_update_prompt
	fi
}

__vsc_preexec() {
	PS1="$__vsc_prior_prompt"
	if [ -z "${__vsc_in_command_execution-}" ]; then
		__vsc_in_command_execution="1"
		__vsc_command_output_start
	fi
}

# Debug trapping/preexec inspired by starship (ISC)
dbg_trap="$(trap -p DEBUG | cut -d' ' -f3 | tr -d \')"
if [[ -z "$dbg_trap" ]]; then
	__vsc_preexec_only() {
		__vsc_status="$?"
		__vsc_preexec
	}
	trap '__vsc_preexec_only "$_"' DEBUG
elif [[ "$dbg_trap" != '__vsc_preexec "$_"' && "$dbg_trap" != '__vsc_preexec_all "$_"' ]]; then
	__vsc_preexec_all() {
		__vsc_status="$?"
		local PREV_LAST_ARG=$1 ; $dbg_trap; __vsc_preexec; : "$PREV_LAST_ARG";
	}
	trap '__vsc_preexec_all "$_"' DEBUG
fi

__vsc_update_prompt

__vsc_prompt_cmd_original() {
	if [[ ${IFS+set} ]]; then
		__vsc_original_ifs="$IFS"
	fi
	if [[ "$__vsc_original_prompt_command" =~ .+\;.+ ]]; then
		IFS=';'
	else
		IFS=' '
	fi
	builtin read -ra ADDR <<<"$__vsc_original_prompt_command"
	if [[ ${__vsc_original_ifs+set} ]]; then
		IFS="$__vsc_original_ifs"
		unset __vsc_original_ifs
	else
		unset IFS
	fi
	for ((i = 0; i < ${#ADDR[@]}; i++)); do
		(exit ${__vsc_status})
		builtin eval ${ADDR[i]}
	done
	__vsc_precmd
}

__vsc_prompt_cmd() {
	__vsc_status="$?"
	__vsc_precmd
}

if [[ "$PROMPT_COMMAND" =~ (.+\;.+) ]]; then
	# item1;item2...
	__vsc_original_prompt_command="$PROMPT_COMMAND"
else
	# (item1, item2...)
	__vsc_original_prompt_command=${PROMPT_COMMAND[@]}
fi

if [[ -n "$__vsc_original_prompt_command" && "$__vsc_original_prompt_command" != "__vsc_prompt_cmd" ]]; then
	PROMPT_COMMAND=__vsc_prompt_cmd_original
else
	PROMPT_COMMAND=__vsc_prompt_cmd
fi
