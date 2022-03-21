# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

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

IN_COMMAND_EXECUTION="1"
LAST_HISTORY_ID=$(history 1 | awk '{print $1;}')

prompt_start() {
	printf "\033]633;A\007"
}

prompt_end() {
	printf "\033]633;B\007"
}

update_cwd() {
	printf "\033]633;P;Cwd=%s\007" "$PWD"
}

command_output_start() {
	printf "\033]633;C\007"
}

continuation_start() {
	printf "\033]633;F\007"
}

continuation_end() {
	printf "\033]633;G\007"
}

command_complete() {
	local HISTORY_ID=$(history 1 | awk '{print $1;}')
	if [[ "$HISTORY_ID" == "$LAST_HISTORY_ID" ]]; then
		printf "\033]633;D\007"
	else
		printf "\033]633;D;%s\007" "$STATUS"
		LAST_HISTORY_ID=$HISTORY_ID
	fi
	update_cwd
}

update_prompt() {
	PRIOR_PROMPT="$PS1"
	IN_COMMAND_EXECUTION=""
	PS1="\[$(prompt_start)\]$PREFIX$PS1\[$(prompt_end)\]"
	PS2="\[$(continuation_start)\]$PS2\[$(continuation_end)\]"
}

precmd() {
	command_complete "$STATUS"

	# in command execution
	if [ -n "$IN_COMMAND_EXECUTION" ]; then
		# non null
		update_prompt
	fi
}
preexec() {
	PS1="$PRIOR_PROMPT"
	if [ -z "${IN_COMMAND_EXECUTION-}" ]; then
		IN_COMMAND_EXECUTION="1"
		command_output_start
	fi
}

update_prompt
prompt_cmd_original() {
	STATUS="$?"
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
	STATUS="$?"
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
