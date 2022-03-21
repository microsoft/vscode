# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
autoload -Uz add-zsh-hook

# Now that the init script is running, unset ZDOTDIR to ensure ~/.zlogout runs as expected as well
# as prevent problems that may occur if the user's init scripts depend on ZDOTDIR not being set.
unset ZDOTDIR

# This variable allows the shell to both detect that VS Code's shell integration is enabled as well
# as disable it by unsetting the variable.
VSCODE_SHELL_INTEGRATION=1

if [ -f ~/.zshenv ]; then
	. ~/.zshenv
fi
if [[ -o "login" &&  -f ~/.zprofile ]]; then
	. ~/.zprofile
fi
if [ -f ~/.zshrc ]; then
	. ~/.zshrc
fi

if [ -z "$VSCODE_SHELL_INTEGRATION" ]; then
	echo -e "\033[1;32mShell integration was disabled by the shell\033[0m"
	return
fi

IN_COMMAND_EXECUTION="1"
LAST_HISTORY_ID=0

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

right_prompt_start() {
	printf "\033]633;H\007"
}

right_prompt_end() {
	printf "\033]633;I\007"
}

command_complete() {
	local HISTORY_ID=$(history | tail -n1 | awk '{print $1;}')
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
	PS1="%{$(prompt_start)%}$PREFIX$PS1%{$(prompt_end)%}"
	PS2="%{$(continuation_start)%}$PS2%{$(continuation_end)%}"
	if [ -n "$RPROMPT" ]; then
		PRIOR_RPROMPT="$RPROMPT"
		RPROMPT="%{$(right_prompt_start)%}$RPROMPT%{$(right_prompt_end)%}"
	fi
}

precmd() {
	local STATUS="$?"
	if [ -z "${IN_COMMAND_EXECUTION-}" ]; then
		# not in command execution
		command_output_start
	fi

	command_complete "$STATUS"

	# in command execution
	if [ -n "$IN_COMMAND_EXECUTION" ]; then
		# non null
		update_prompt
	fi
}

preexec() {
	PS1="$PRIOR_PROMPT"
	if [ -n "$RPROMPT" ]; then
		RPROMPT="$PRIOR_RPROMPT"
	fi
	IN_COMMAND_EXECUTION="1"
	command_output_start
}
add-zsh-hook precmd precmd
add-zsh-hook preexec preexec

# Show the welcome message
if [ -z "${VSCODE_SHELL_HIDE_WELCOME-}" ]; then
	echo "\033[1;32mShell integration activated\033[0m"
else
	VSCODE_SHELL_HIDE_WELCOME=""
fi
