# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
autoload -Uz add-zsh-hook

if [ -f ~/.zshenv ]; then
	. ~/.zshenv
fi
if [[ -o "login" &&  -f ~/.zprofile ]]; then
	. ~/.zprofile
fi
if [ -f ~/.zshrc ]; then
	. ~/.zshrc
fi
unset ZDOTDIR # ensure ~/.zlogout runs as expected

IN_COMMAND_EXECUTION="1"
LAST_HISTORY_ID=0

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

__vsc_right_prompt_start() {
	printf "\033]633;H\007"
}

__vsc_right_prompt_end() {
	printf "\033]633;I\007"
}

__vsc_command_complete() {
	local HISTORY_ID=$(history | tail -n1 | awk '{print $1;}')
	if [[ "$HISTORY_ID" == "$LAST_HISTORY_ID" ]]; then
		printf "\033]633;D\007"
	else
		printf "\033]633;D;%s\007" "$STATUS"
		LAST_HISTORY_ID=$HISTORY_ID
	fi
	__vsc_update_cwd
}

__vsc_update_prompt() {
	PRIOR_PROMPT="$PS1"
	IN_COMMAND_EXECUTION=""
	PS1="%{$(__vsc_prompt_start)%}$PREFIX$PS1%{$(__vsc_prompt_end)%}"
	PS2="%{$(__vsc_continuation_start)%}$PS2%{$(__vsc_continuation_end)%}"
	if [ -n "$RPROMPT" ]; then
		PRIOR_RPROMPT="$RPROMPT"
		RPROMPT="%{$(__vsc_right_prompt_start)%}$RPROMPT%{$(__vsc_right_prompt_end)%}"
	fi
}

precmd() {
	local STATUS="$?"
	if [ -z "${IN_COMMAND_EXECUTION-}" ]; then
		# not in command execution
		__vsc_command_output_start
	fi

	__vsc_command_complete "$STATUS"

	# in command execution
	if [ -n "$IN_COMMAND_EXECUTION" ]; then
		# non null
		__vsc_update_prompt
	fi
}

preexec() {
	PS1="$PRIOR_PROMPT"
	if [ -n "$RPROMPT" ]; then
		RPROMPT="$PRIOR_RPROMPT"
	fi
	IN_COMMAND_EXECUTION="1"
	__vsc_command_output_start
}
add-zsh-hook precmd precmd
add-zsh-hook preexec preexec

# Show the welcome message
if [ -z "${VSCODE_SHELL_HIDE_WELCOME-}" ]; then
	echo "\033[1;32mShell integration activated\033[0m"
else
	VSCODE_SHELL_HIDE_WELCOME=""
fi
