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
	local VSC_HISTORY_ID=$(history | tail -n1 | awk '{print $1;}')
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
	PS1="%{$(__vsc_prompt_start)%}$PREFIX$PS1%{$(__vsc_prompt_end)%}"
	PS2="%{$(__vsc_continuation_start)%}$PS2%{$(__vsc_continuation_end)%}"
	if [ -n "$RPROMPT" ]; then
		PRIOR_RPROMPT="$RPROMPT"
		RPROMPT="%{$(__vsc_right_prompt_start)%}$RPROMPT%{$(__vsc_right_prompt_end)%}"
	fi
}

__vsc_precmd() {
	local VSC_STATUS="$?"
	if [ -z "${IN_COMMAND_EXECUTION-}" ]; then
		# not in command execution
		__vsc_command_output_start
	fi

	__vsc_command_complete "$VSC_STATUS"

	# in command execution
	if [ -n "$IN_COMMAND_EXECUTION" ]; then
		# non null
		__vsc_update_prompt
	fi
}

__vsc_preexec() {
	PS1="$PRIOR_PROMPT"
	if [ -n "$RPROMPT" ]; then
		RPROMPT="$PRIOR_RPROMPT"
	fi
	IN_COMMAND_EXECUTION="1"
	__vsc_command_output_start
}
add-zsh-hook precmd __vsc_precmd
add-zsh-hook preexec __vsc_preexec

# Show the welcome message
if [ -z "${VSCODE_SHELL_HIDE_WELCOME-}" ]; then
	echo "\033[1;32mShell integration activated\033[0m"
else
	VSCODE_SHELL_HIDE_WELCOME=""
fi
