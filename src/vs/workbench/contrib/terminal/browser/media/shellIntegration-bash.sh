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
	echo -e "\033[1;33mShell integration cannot be activated due to complex PROMPT_COMMAND: $PROMPT_COMMAND\033[0m"
	VSCODE_SHELL_HIDE_WELCOME=""
	return;
fi

if [ -z "$VSCODE_SHELL_INTEGRATION" ]; then
	echo -e "\033[1;33mShell integration was disabled by the shell\033[0m"
	return
fi

IN_COMMAND_EXECUTION="1"
LAST_HISTORY_ID=$(history 1 | awk '{print $1;}')

__vsc_prompt_start() {
	printf "\033]633;A\007"
}

__vsc_prompt_end() {
	printf "\033]633;B\007"
}

__vsc_update_cwd() {
	printf "\033]633;P;Cwd=%s\007" "$PWD"
}

__vsc_command_output_start() {
	printf "\033]633;C\007"
}

__vsc_continuation_start() {
	printf "\033]633;F\007"
}

__vsc_continuation_end() {
	printf "\033]633;G\007"
}

__vsc_command_complete() {
	local VSC_HISTORY_ID=$(history 1 | awk '{print $1;}')
	if [[ "$VSC_HISTORY_ID" == "$LAST_HISTORY_ID" ]]; then
		printf "\033]633;D\007"
	else
		printf "\033]633;D;%s\007" "$VSC_STATUS"
		LAST_HISTORY_ID=$VSC_HISTORY_ID
	fi
	__vsc_update_cwd
}

__vsc_update_prompt() {
	PRIOR_PROMPT="$PS1"
	IN_COMMAND_EXECUTION=""
	PS1="\[$(__vsc_prompt_start)\]$PREFIX$PS1\[$(__vsc_prompt_end)\]"
	PS2="\[$(__vsc_continuation_start)\]$PS2\[$(__vsc_continuation_end)\]"
}

precmd() {
	__vsc_command_complete "$VSC_STATUS"

	# in command execution
	if [ -n "$IN_COMMAND_EXECUTION" ]; then
		# non null
		__vsc_update_prompt
	fi
}
preexec() {
	PS1="$PRIOR_PROMPT"
	if [ -z "${IN_COMMAND_EXECUTION-}" ]; then
		IN_COMMAND_EXECUTION="1"
		__vsc_command_output_start
	fi
}

__vsc_update_prompt

prompt_cmd_original() {
	VSC_STATUS="$?"
	if [[ "$ORIGINAL_PROMPT_COMMAND" =~ .+\;.+ ]]; then
		IFS=';'
	else
		IFS=' '
	fi
	read -ra ADDR <<<"$ORIGINAL_PROMPT_COMMAND"
	for ((i = 0; i < ${#ADDR[@]}; i++)); do
		eval ${ADDR[i]}
	done
	IFS=''
	precmd
}

prompt_cmd() {
	VSC_STATUS="$?"
	precmd
}

if [[ "$PROMPT_COMMAND" =~ (.+\;.+) ]]; then
	# item1;item2...
	ORIGINAL_PROMPT_COMMAND="$PROMPT_COMMAND"
else
	# (item1, item2...)
	ORIGINAL_PROMPT_COMMAND=${PROMPT_COMMAND[@]}
fi

if [[ -n "$ORIGINAL_PROMPT_COMMAND" && "$ORIGINAL_PROMPT_COMMAND" != "prompt_cmd" ]]; then
	PROMPT_COMMAND=prompt_cmd_original
else
	PROMPT_COMMAND=prompt_cmd
fi

trap 'preexec' DEBUG
if [ -z "$VSCODE_SHELL_HIDE_WELCOME" ]; then
	echo -e "\033[1;32mShell integration activated\033[0m"
else
	VSCODE_SHELL_HIDE_WELCOME=""
fi
