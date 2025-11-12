# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
builtin autoload -Uz add-zsh-hook is-at-least

# Prevent the script recursing when setting up
if [ -n "$VSCODE_SHELL_INTEGRATION" ]; then
	ZDOTDIR=$USER_ZDOTDIR
	builtin return
fi

# This variable allows the shell to both detect that VS Code's shell integration is enabled as well
# as disable it by unsetting the variable.
VSCODE_SHELL_INTEGRATION=1

# By default, zsh will set the $HISTFILE to the $ZDOTDIR location automatically. In the case of the
# shell integration being injected, this means that the terminal will use a different history file
# to other terminals. To fix this issue, set $HISTFILE back to the default location before ~/.zshrc
# is called as that may depend upon the value.
if [[  "$VSCODE_INJECTION" == "1" ]]; then
	HISTFILE=$USER_ZDOTDIR/.zsh_history
fi

# Only fix up ZDOTDIR if shell integration was injected (not manually installed) and has not been called yet
if [[ "$VSCODE_INJECTION" == "1" ]]; then
	if [[ $options[norcs] = off  && -f $USER_ZDOTDIR/.zshrc ]]; then
		VSCODE_ZDOTDIR=$ZDOTDIR
		ZDOTDIR=$USER_ZDOTDIR
		# A user's custom HISTFILE location might be set when their .zshrc file is sourced below
		. $USER_ZDOTDIR/.zshrc
	fi
fi

__vsc_use_aa=0
__vsc_env_keys=()
__vsc_env_values=()

# Associative array are only available in zsh 4.3 or later
if is-at-least 4.3; then
	__vsc_use_aa=1
	typeset -A vsc_aa_env
fi

# Apply EnvironmentVariableCollections if needed
if [ -n "${VSCODE_ENV_REPLACE:-}" ]; then
	IFS=':' read -rA ADDR <<< "$VSCODE_ENV_REPLACE"
	for ITEM in "${ADDR[@]}"; do
		VARNAME="$(echo ${ITEM%%=*})"
		export $VARNAME="$(echo -e ${ITEM#*=})"
	done
	unset VSCODE_ENV_REPLACE
fi
if [ -n "${VSCODE_ENV_PREPEND:-}" ]; then
	IFS=':' read -rA ADDR <<< "$VSCODE_ENV_PREPEND"
	for ITEM in "${ADDR[@]}"; do
		VARNAME="$(echo ${ITEM%%=*})"
		export $VARNAME="$(echo -e ${ITEM#*=})${(P)VARNAME}"
	done
	unset VSCODE_ENV_PREPEND
fi
if [ -n "${VSCODE_ENV_APPEND:-}" ]; then
	IFS=':' read -rA ADDR <<< "$VSCODE_ENV_APPEND"
	for ITEM in "${ADDR[@]}"; do
		VARNAME="$(echo ${ITEM%%=*})"
		export $VARNAME="${(P)VARNAME}$(echo -e ${ITEM#*=})"
	done
	unset VSCODE_ENV_APPEND
fi

# Register Python shell activate hooks
# Prevent multiple activation with guard
if [ -z "${VSCODE_PYTHON_AUTOACTIVATE_GUARD:-}" ]; then
	export VSCODE_PYTHON_AUTOACTIVATE_GUARD=1
	if [ -n "${VSCODE_PYTHON_ZSH_ACTIVATE:-}" ] && [ "$TERM_PROGRAM" = "vscode" ]; then
		# Prevent crashing by negating exit code
		if ! builtin eval "$VSCODE_PYTHON_ZSH_ACTIVATE"; then
			__vsc_activation_status=$?
			builtin printf '\x1b[0m\x1b[7m * \x1b[0;103m VS Code Python zsh activation failed with exit code %d \x1b[0m' "$__vsc_activation_status"
		fi
	fi
fi

# Report prompt type
if [ -n "${P9K_SSH:-}" ] || [ -n "${P9K_TTY:-}" ]; then
	builtin printf '\e]633;P;PromptType=p10k\a'
	# Force shell integration on for p10k
	# typeset -g POWERLEVEL9K_TERM_SHELL_INTEGRATION=true
elif [ -n "${ZSH:-}" ] && [ -n "$ZSH_VERSION" ] && (( ${+functions[omz]} )); then
	builtin printf '\e]633;P;PromptType=oh-my-zsh\a'
elif [ -n "${STARSHIP_SESSION_KEY:-}" ]; then
	builtin printf '\e]633;P;PromptType=starship\a'
fi

# Shell integration was disabled by the shell, exit without warning assuming either the shell has
# explicitly disabled shell integration as it's incompatible or it implements the protocol.
if [ -z "$VSCODE_SHELL_INTEGRATION" ]; then
	builtin return
fi

# The property (P) and command (E) codes embed values which require escaping.
# Backslashes are doubled. Non-alphanumeric characters are converted to escaped hex.
__vsc_escape_value() {
	builtin emulate -L zsh

	# Process text byte by byte, not by codepoint.
	builtin local LC_ALL=C str="$1" i byte token out='' val

	for (( i = 0; i < ${#str}; ++i )); do
	# Escape backslashes, semi-colons specially, then special ASCII chars below space (0x20).
		byte="${str:$i:1}"
		val=$(printf "%d" "'$byte")
		if (( val < 31 )); then
			# For control characters, use hex encoding
			token=$(printf "\\\\x%02x" "'$byte")
		elif [ "$byte" = "\\" ]; then
			token="\\\\"
		elif [ "$byte" = ";" ]; then
			token="\\x3b"
		else
			token="$byte"
		fi

		out+="$token"
	done

	builtin print -r -- "$out"
}

__vsc_in_command_execution="1"
__vsc_current_command=""

# It's fine this is in the global scope as it getting at it requires access to the shell environment
__vsc_nonce="$VSCODE_NONCE"
unset VSCODE_NONCE

__vscode_shell_env_reporting="${VSCODE_SHELL_ENV_REPORTING:-}"
unset VSCODE_SHELL_ENV_REPORTING

envVarsToReport=()
IFS=',' read -rA envVarsToReport <<< "$__vscode_shell_env_reporting"

builtin printf "\e]633;P;ContinuationPrompt=%s\a" "$(echo "$PS2" | sed 's/\x1b/\\\\x1b/g')"

# Report this shell supports rich command detection
builtin printf '\e]633;P;HasRichCommandDetection=True\a'

__vsc_prompt_start() {
	builtin printf '\e]633;A\a'
}

__vsc_prompt_end() {
	builtin printf '\e]633;B\a'
}

__vsc_update_cwd() {
	builtin printf '\e]633;P;Cwd=%s\a' "$(__vsc_escape_value "${PWD}")"
}

__update_env_cache_aa() {
	local key="$1"
	local value="$2"
	if [ $__vsc_use_aa -eq 1 ]; then
		if [[ "${vsc_aa_env["$key"]}" != "$value" ]]; then
			vsc_aa_env["$key"]="$value"
			builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
		fi
	fi
}

__update_env_cache() {
	local key="$1"
	local value="$2"

	for (( i=1; i <= $#__vsc_env_keys; i++ )); do
		if [[ "${__vsc_env_keys[$i]}" == "$key" ]]; then
			if [[ "${__vsc_env_values[$i]}" != "$value" ]]; then
				__vsc_env_values[$i]="$value"
				builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
			fi
			return
		fi
	done

		# Key does not exist so add key, value pair
		__vsc_env_keys+=("$key")
		__vsc_env_values+=("$value")
		builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
}

__vsc_update_env() {
	if [[ ${#envVarsToReport[@]} -gt 0 ]]; then
		builtin printf '\e]633;EnvSingleStart;%s;%s;\a' 0 $__vsc_nonce
		if [ $__vsc_use_aa -eq 1 ]; then
			if [[ ${#vsc_aa_env[@]} -eq 0 ]]; then
				# Associative array is empty, do not diff, just add
				for key in "${envVarsToReport[@]}"; do
					if [[ -n "$key" && -n "${(P)key+_}" ]]; then
						vsc_aa_env["$key"]="${(P)key}"
						builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "${(P)key}")" "$__vsc_nonce"
					fi
				done
			else
				# Diff approach for associative array
				for var in "${envVarsToReport[@]}"; do
					if [[ -n "$var" && -n "${(P)var+_}" ]]; then
						value="${(P)var}"
						__update_env_cache_aa "$var" "$value"
					fi
				done
				# Track missing env vars not needed for now, as we are only tracking pre-defined env var from terminalEnvironment.
			fi
		else
			# Two arrays approach
			if [[ ${#__vsc_env_keys[@]} -eq 0 ]] && [[ ${#__vsc_env_values[@]} -eq 0 ]]; then
				# Non-associative arrays are both empty, do not diff, just add
				for key in "${envVarsToReport[@]}"; do
					if [[ -n "$key" && -n "${(P)key+_}" ]]; then
						value="${(P)key}"
						__vsc_env_keys+=("$key")
						__vsc_env_values+=("$value")
						builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
					fi
				done
			else
				# Diff approach for non-associative arrays
				for var in "${envVarsToReport[@]}"; do
					if [[ -n "$var" && -n "${(P)var+_}" ]]; then
						value="${(P)var}"
						__update_env_cache "$var" "$value"
					fi
				done
				# Track missing env vars not needed for now, as we are only tracking pre-defined env var from terminalEnvironment.
			fi
		fi

		builtin printf '\e]633;EnvSingleEnd;%s;\a' $__vsc_nonce
	fi
}

__vsc_command_output_start() {
	builtin printf '\e]633;E;%s;%s\a' "$(__vsc_escape_value "${__vsc_current_command}")" $__vsc_nonce
	builtin printf '\e]633;C\a'
}

__vsc_continuation_start() {
	builtin printf '\e]633;F\a'
}

__vsc_continuation_end() {
	builtin printf '\e]633;G\a'
}

__vsc_right_prompt_start() {
	builtin printf '\e]633;H\a'
}

__vsc_right_prompt_end() {
	builtin printf '\e]633;I\a'
}

__vsc_command_complete() {
	if [[ "$__vsc_current_command" == "" ]]; then
		builtin printf '\e]633;D\a'
	else
		builtin printf '\e]633;D;%s\a' "$__vsc_status"
	fi
	__vsc_update_cwd
}

if [[ -o NOUNSET ]]; then
	if [ -z "${RPROMPT-}" ]; then
		RPROMPT=""
	fi
fi
__vsc_update_prompt() {
	__vsc_prior_prompt="$PS1"
	__vsc_prior_prompt2="$PS2"
	__vsc_in_command_execution=""
	PS1="%{$(__vsc_prompt_start)%}$PS1%{$(__vsc_prompt_end)%}"
	PS2="%{$(__vsc_continuation_start)%}$PS2%{$(__vsc_continuation_end)%}"
	if [ -n "$RPROMPT" ]; then
		__vsc_prior_rprompt="$RPROMPT"
		RPROMPT="%{$(__vsc_right_prompt_start)%}$RPROMPT%{$(__vsc_right_prompt_end)%}"
	fi
}

__vsc_precmd() {
	builtin local __vsc_status="$?"
	if [ -z "${__vsc_in_command_execution-}" ]; then
		# not in command execution
		__vsc_command_output_start
	fi

	__vsc_command_complete "$__vsc_status"
	__vsc_current_command=""

	# in command execution
	if [ -n "$__vsc_in_command_execution" ]; then
		# non null
		__vsc_update_prompt
	fi
	__vsc_update_env
}

__vsc_preexec() {
	PS1="$__vsc_prior_prompt"
	PS2="$__vsc_prior_prompt2"
	if [ -n "$RPROMPT" ]; then
		RPROMPT="$__vsc_prior_rprompt"
	fi
	__vsc_in_command_execution="1"
	__vsc_current_command=$1
	__vsc_command_output_start
}
add-zsh-hook precmd __vsc_precmd
add-zsh-hook preexec __vsc_preexec

if [[ $options[login] = off && $USER_ZDOTDIR != $VSCODE_ZDOTDIR ]]; then
	ZDOTDIR=$USER_ZDOTDIR
fi
