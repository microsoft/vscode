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
	builtin local LC_ALL=C str="$1" i byte token out=''

	for (( i = 0; i < ${#str}; ++i )); do
		byte="${str:$i:1}"

		# Escape backslashes, semi-colons and newlines
		if [ "$byte" = "\\" ]; then
			token="\\\\"
		elif [ "$byte" = ";" ]; then
			token="\\x3b"
		elif [ "$byte" = $'\n' ]; then
			token="\x0a"
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

__vscode_shell_env_reporting="$VSCODE_SHELL_ENV_REPORTING"
unset VSCODE_SHELL_ENV_REPORTING

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

__track_missing_env_vars_aa() {
	if [ $__vsc_use_aa -eq 1 ]; then
		typeset -A currentEnvMap
		while IFS='=' read -r key value; do
			currentEnvMap["$key"]="$value"
		done < <(env)

		for k in "${(@k)vsc_aa_env}"; do
			# if currentEnvMap does not have the key, then it is missing
			if ! [[ -v currentEnvMap[$k] ]]; then
				builtin printf '\e]633;EnvSingleDelete;%s;%s;%s\a' "${(Q)k}" "$(__vsc_escape_value "${vsc_aa_env[$k]}")" "$__vsc_nonce"
				builtin unset "vsc_aa_env[$k]"
			fi
		done
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

__track_missing_env_vars() {
	local currentEnvKeys=();

	while IFS='=' read -r key value; do
		currentEnvKeys+=("$key");
	done < <(env);

	# Compare __vsc_env_keys with user's currentEnvKeys
	for ((i = 1; i <= ${#__vsc_env_keys[@]}; i++)); do
		local found=0;
		for envKey in "${currentEnvKeys[@]}"; do
			if [[ "${__vsc_env_keys[$i]}" == "$envKey" ]]; then
				found=1;
				break;
			fi;
		done;
		if [ "$found" = 0 ]; then
			builtin printf '\e]633;EnvSingleDelete;%s;%s;%s\a' "${__vsc_env_keys[$i]}" "$(__vsc_escape_value "${__vsc_env_values[$i]}")" "$__vsc_nonce";
			unset "__vsc_env_keys[$i]";
			unset "__vsc_env_values[$i]";
		fi;
	done;

	# Remove gaps from unset
	__vsc_env_keys=("${(@)__vsc_env_keys}");
	__vsc_env_values=("${(@)__vsc_env_values}");
}


__vsc_update_env() {
	if [[ "$__vscode_shell_env_reporting" == "1" ]]; then
		builtin printf '\e]633;EnvSingleStart;%s;%s;\a' 0 $__vsc_nonce
		if [ $__vsc_use_aa -eq 1 ]; then
			if [[ ${#vsc_aa_env[@]} -eq 0 ]]; then
				# Associative array is empty, do not diff, just add
				while IFS='=' read -r key value; do
					vsc_aa_env["$key"]="$value"
					builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
				done < <(env)
			else
				# Diff approach for associative array
				while IFS='=' read -r key value; do
					__update_env_cache_aa "$key" "$value"
				done < <(env)
				__track_missing_env_vars_aa

			fi
		else
			# Two arrays approach
			if [[ ${#__vsc_env_keys[@]} -eq 0 ]] && [[ ${#__vsc_env_values[@]} -eq 0 ]]; then
				# Non-associative arrays are both empty, do not diff, just add
				while IFS='=' read -r key value; do
					__vsc_env_keys+=("$key")
					__vsc_env_values+=("$value")
					builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
				done < <(env)
			else
				# Diff approach for non-associative arrays
				while IFS='=' read -r key value; do
					__update_env_cache "$key" "$value"
				done < <(env)
				__track_missing_env_vars

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
