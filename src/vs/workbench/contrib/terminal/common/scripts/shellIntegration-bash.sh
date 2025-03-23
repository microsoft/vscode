# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# Prevent the script recursing when setting up
if [[ -n "${VSCODE_SHELL_INTEGRATION:-}" ]]; then
	builtin return
fi

VSCODE_SHELL_INTEGRATION=1

vsc_env_keys=()
vsc_env_values=()
use_associative_array=0
bash_major_version=${BASH_VERSINFO[0]}

__vscode_shell_env_reporting="$VSCODE_SHELL_ENV_REPORTING"
unset VSCODE_SHELL_ENV_REPORTING

if (( BASH_VERSINFO[0] >= 4 )); then
	use_associative_array=1
	# Associative arrays are only available in bash 4.0+
	declare -A vsc_aa_env
fi

# Run relevant rc/profile only if shell integration has been injected, not when run manually
if [ "$VSCODE_INJECTION" == "1" ]; then
	if [ -z "$VSCODE_SHELL_LOGIN" ]; then
		if [ -r ~/.bashrc ]; then
			. ~/.bashrc
		fi
	else
		# Imitate -l because --init-file doesn't support it:
		# run the first of these files that exists
		if [ -r /etc/profile ]; then
			. /etc/profile
		fi
		# execute the first that exists
		if [ -r ~/.bash_profile ]; then
			. ~/.bash_profile
		elif [ -r ~/.bash_login ]; then
			. ~/.bash_login
		elif [ -r ~/.profile ]; then
			. ~/.profile
		fi
		builtin unset VSCODE_SHELL_LOGIN

		# Apply any explicit path prefix (see #99878)
		if [ -n "${VSCODE_PATH_PREFIX:-}" ]; then
			export PATH="$VSCODE_PATH_PREFIX$PATH"
			builtin unset VSCODE_PATH_PREFIX
		fi
	fi
	builtin unset VSCODE_INJECTION
fi

if [ -z "$VSCODE_SHELL_INTEGRATION" ]; then
	builtin return
fi

# Apply EnvironmentVariableCollections if needed
if [ -n "${VSCODE_ENV_REPLACE:-}" ]; then
	IFS=':' read -ra ADDR <<< "$VSCODE_ENV_REPLACE"
	for ITEM in "${ADDR[@]}"; do
		VARNAME="$(echo $ITEM | cut -d "=" -f 1)"
		VALUE="$(echo -e "$ITEM" | cut -d "=" -f 2-)"
		export $VARNAME="$VALUE"
	done
	builtin unset VSCODE_ENV_REPLACE
fi
if [ -n "${VSCODE_ENV_PREPEND:-}" ]; then
	IFS=':' read -ra ADDR <<< "$VSCODE_ENV_PREPEND"
	for ITEM in "${ADDR[@]}"; do
		VARNAME="$(echo $ITEM | cut -d "=" -f 1)"
		VALUE="$(echo -e "$ITEM" | cut -d "=" -f 2-)"
		export $VARNAME="$VALUE${!VARNAME}"
	done
	builtin unset VSCODE_ENV_PREPEND
fi
if [ -n "${VSCODE_ENV_APPEND:-}" ]; then
	IFS=':' read -ra ADDR <<< "$VSCODE_ENV_APPEND"
	for ITEM in "${ADDR[@]}"; do
		VARNAME="$(echo $ITEM | cut -d "=" -f 1)"
		VALUE="$(echo -e "$ITEM" | cut -d "=" -f 2-)"
		export $VARNAME="${!VARNAME}$VALUE"
	done
	builtin unset VSCODE_ENV_APPEND
fi

__vsc_get_trap() {
	# 'trap -p DEBUG' outputs a shell command like `trap -- '…shellcode…' DEBUG`.
	# The terms are quoted literals, but are not guaranteed to be on a single line.
	# (Consider a trap like $'echo foo\necho \'bar\'').
	# To parse, we splice those terms into an expression capturing them into an array.
	# This preserves the quoting of those terms: when we `eval` that expression, they are preserved exactly.
	# This is different than simply exploding the string, which would split everything on IFS, oblivious to quoting.
	builtin local -a terms
	builtin eval "terms=( $(trap -p "${1:-DEBUG}") )"
	#                    |________________________|
	#                            |
	#        \-------------------*--------------------/
	# terms=( trap  --  '…arbitrary shellcode…'  DEBUG )
	#        |____||__| |_____________________| |_____|
	#          |    |            |                |
	#          0    1            2                3
	#                            |
	#                   \--------*----/
	builtin printf '%s' "${terms[2]:-}"
}

__vsc_escape_value_fast() {
	builtin local LC_ALL=C out
	out=${1//\\/\\\\}
	out=${out//;/\\x3b}
	builtin printf '%s\n' "${out}"
}

# The property (P) and command (E) codes embed values which require escaping.
# Backslashes are doubled. Non-alphanumeric characters are converted to escaped hex.
__vsc_escape_value() {
	# If the input being too large, switch to the faster function
	if [ "${#1}" -ge 2000 ]; then
		__vsc_escape_value_fast "$1"
		builtin return
	fi

	# Process text byte by byte, not by codepoint.
	builtin local -r LC_ALL=C
	builtin local -r str="${1}"
	builtin local -ir len="${#str}"

	builtin local -i i
	builtin local -i val
	builtin local byte
	builtin local token
	builtin local out=''

	for (( i=0; i < "${#str}"; ++i )); do
		# Escape backslashes, semi-colons specially, then special ASCII chars below space (0x20).
		byte="${str:$i:1}"
		builtin printf -v val '%d' "'$byte"
		if  (( val < 31 )); then
			builtin printf -v token '\\x%02x' "'$byte"
		elif (( val == 92 )); then # \
			token="\\\\"
		elif (( val == 59 )); then # ;
			token="\\x3b"
		else
			token="$byte"
		fi

		out+="$token"
	done

	builtin printf '%s\n' "$out"
}

# Send the IsWindows property if the environment looks like Windows
__vsc_regex_environment="^CYGWIN*|MINGW*|MSYS*"
if [[ "$(uname -s)" =~ $__vsc_regex_environment ]]; then
	builtin printf '\e]633;P;IsWindows=True\a'
	__vsc_is_windows=1
else
	__vsc_is_windows=0
fi

# Allow verifying $BASH_COMMAND doesn't have aliases resolved via history when the right HISTCONTROL
# configuration is used
__vsc_regex_histcontrol=".*(erasedups|ignoreboth|ignoredups).*"
if [[ "$HISTCONTROL" =~ $__vsc_regex_histcontrol ]]; then
	__vsc_history_verify=0
else
	__vsc_history_verify=1
fi

builtin unset __vsc_regex_environment
builtin unset __vsc_regex_histcontrol

__vsc_initialized=0
__vsc_original_PS1="$PS1"
__vsc_original_PS2="$PS2"
__vsc_custom_PS1=""
__vsc_custom_PS2=""
__vsc_in_command_execution="1"
__vsc_current_command=""

# It's fine this is in the global scope as it getting at it requires access to the shell environment
__vsc_nonce="$VSCODE_NONCE"
unset VSCODE_NONCE

# Some features should only work in Insiders
__vsc_stable="$VSCODE_STABLE"
unset VSCODE_STABLE

# Report continuation prompt
if [ "$__vsc_stable" = "0" ]; then
	builtin printf "\e]633;P;ContinuationPrompt=$(echo "$PS2" | sed 's/\x1b/\\\\x1b/g')\a"
fi

# Report this shell supports rich command detection
builtin printf '\e]633;P;HasRichCommandDetection=True\a'

__vsc_report_prompt() {
	# Expand the original PS1 similarly to how bash would normally
	# See https://stackoverflow.com/a/37137981 for technique
	if ((BASH_VERSINFO[0] >= 5 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4))); then
		__vsc_prompt=${__vsc_original_PS1@P}
	else
		__vsc_prompt=${__vsc_original_PS1}
	fi

	__vsc_prompt="$(builtin printf "%s" "${__vsc_prompt//[$'\001'$'\002']}")"
	builtin printf "\e]633;P;Prompt=%s\a" "$(__vsc_escape_value "${__vsc_prompt}")"
}

__vsc_prompt_start() {
	builtin printf '\e]633;A\a'
}

__vsc_prompt_end() {
	builtin printf '\e]633;B\a'
}

__vsc_update_cwd() {
	if [ "$__vsc_is_windows" = "1" ]; then
		__vsc_cwd="$(cygpath -m "$PWD")"
	else
		__vsc_cwd="$PWD"
	fi
	builtin printf '\e]633;P;Cwd=%s\a' "$(__vsc_escape_value "$__vsc_cwd")"
}

__updateEnvCacheAA() {
	local key="$1"
	local value="$2"
	if [ "$use_associative_array" = 1 ]; then
		if [[ "${vsc_aa_env[$key]}" != "$value" ]]; then
			vsc_aa_env["$key"]="$value"
			builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
		fi
	fi
}

__trackMissingEnvVarsAA() {
	if [ "$use_associative_array" = 1 ]; then
		declare -A currentEnvMap
		while IFS= read -r line; do
			if [[ "$line" == *"="* ]]; then
				local key="${line%%=*}"
				local value="${line#*=}"
				currentEnvMap["$key"]="$value"
			fi
		done < <(env)

		for key in "${!vsc_aa_env[@]}"; do
			if [ -z "${currentEnvMap[$key]}" ]; then
				builtin printf '\e]633;EnvSingleDelete;%s;%s;%s\a' "$key" "$(__vsc_escape_value "${vsc_aa_env[$key]}")" "$__vsc_nonce"
				builtin unset "vsc_aa_env[$key]"
			fi
		done
	fi
}

__updateEnvCache() {
	local key="$1"
	local value="$2"

	for i in "${!vsc_env_keys[@]}"; do
		if [[ "${vsc_env_keys[$i]}" == "$key" ]]; then
			if [[ "${vsc_env_values[$i]}" != "$value" ]]; then
				vsc_env_values[$i]="$value"
				builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
			fi
			return
		fi
	done

	vsc_env_keys+=("$key")
	vsc_env_values+=("$value")
	builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
}

__trackMissingEnvVars() {
	local current_env_keys=()

	while IFS='=' read -r key value; do
		current_env_keys+=("$key")
	done < <(env)

	# Compare vsc_env_keys with user's current_env_keys
	for key in "${vsc_env_keys[@]}"; do
		local found=0
		for env_key in "${current_env_keys[@]}"; do
			if [[ "$key" == "$env_key" ]]; then
				found=1
				break
			fi
		done
		if [ "$found" = 0 ]; then
			builtin printf '\e]633;EnvSingleDelete;%s;%s;%s\a' "${vsc_env_keys[i]}" "$(__vsc_escape_value "${vsc_env_values[i]}")" "$__vsc_nonce"
			builtin unset 'vsc_env_keys[i]'
			builtin unset 'vsc_env_values[i]'
		fi
	done

	# Remove gaps from unset
	vsc_env_keys=("${vsc_env_keys[@]}")
	vsc_env_values=("${vsc_env_values[@]}")
}

__vsc_update_env() {
	if [[ "$__vscode_shell_env_reporting" == "1" ]]; then
		builtin printf '\e]633;EnvSingleStart;%s;%s\a' 0 $__vsc_nonce

		if [ "$use_associative_array" = 1 ]; then
			if [ ${#vsc_aa_env[@]} -eq 0 ]; then
				# Associative array is empty, do not diff, just add
				# Use null byte instead of a newline to support multi-line values (e.g. PS1 values)
				while IFS= read -r -d $'\0' line; do
					if [[ "$line" == *"="* ]]; then
						# %% removes longest match of =* Ensure we get everything before first equal sign.
						local key="${line%%=*}"
						# # removes shortest match of *= Ensure we get everything after first equal sign. Preserving additional equal signs.
						local value="${line#*=}"
						vsc_aa_env["$key"]="$value"
						builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
					fi
				done < <(env -0) # env command with null bytes as separator instead of newlines
			else
				# Diff approach for associative array
				while IFS= read -r -d $'\0' line; do
					if [[ "$line" == *"="* ]]; then
						local key="${line%%=*}"
						local value="${line#*=}"
						__updateEnvCacheAA "$key" "$value"
					fi
				done < <(env -0)
				__trackMissingEnvVarsAA
			fi

		else
			if [[ -z ${vsc_env_keys[@]} ]] && [[ -z ${vsc_env_values[@]} ]]; then
				# Non associative arrays are both empty, do not diff, just add
				while IFS= read -r -d $'\0' line; do
					if [[ "$line" == *"="* ]]; then
						local key="${line%%=*}"
						local value="${line#*=}"
						vsc_env_keys+=("$key")
						vsc_env_values+=("$value")
						builtin printf '\e]633;EnvSingleEntry;%s;%s;%s\a' "$key" "$(__vsc_escape_value "$value")" "$__vsc_nonce"
					fi
				done < <(env -0)
			else
				# Diff approach for non-associative arrays
				while IFS= read -r -d $'\0' line; do
					if [[ "$line" == *"="* ]]; then
						local key="${line%%=*}"
						local value="${line#*=}"
						__updateEnvCache "$key" "$value"
					fi
				done < <(env -0)
				__trackMissingEnvVars
			fi
		fi
		builtin printf '\e]633;EnvSingleEnd;%s;\a' $__vsc_nonce
	fi
}

__vsc_command_output_start() {
	if [[ -z "${__vsc_first_prompt-}" ]]; then
		builtin return
	fi
	builtin printf '\e]633;E;%s;%s\a' "$(__vsc_escape_value "${__vsc_current_command}")" $__vsc_nonce
	builtin printf '\e]633;C\a'
}

__vsc_continuation_start() {
	builtin printf '\e]633;F\a'
}

__vsc_continuation_end() {
	builtin printf '\e]633;G\a'
}

__vsc_command_complete() {
	if [[ -z "${__vsc_first_prompt-}" ]]; then
		__vsc_update_cwd
		builtin return
	fi
	if [ "$__vsc_current_command" = "" ]; then
		builtin printf '\e]633;D\a'
	else
		builtin printf '\e]633;D;%s\a' "$__vsc_status"
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
			__vsc_custom_PS1="\[$(__vsc_prompt_start)\]$__vsc_original_PS1\[$(__vsc_prompt_end)\]"
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
	# Report prompt is a work in progress, currently encoding is too slow
	if [ "$__vsc_stable" = "0" ]; then
		__vsc_report_prompt
	fi
	__vsc_first_prompt=1
	__vsc_update_prompt
	__vsc_update_env
}

__vsc_preexec() {
	__vsc_initialized=1
	if [[ ! $BASH_COMMAND == __vsc_prompt* ]]; then
		# Use history if it's available to verify the command as BASH_COMMAND comes in with aliases
		# resolved
		if [ "$__vsc_history_verify" = "1" ]; then
			__vsc_current_command="$(builtin history 1 | sed 's/ *[0-9]* *//')"
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
	__vsc_dbg_trap="$(__vsc_get_trap DEBUG)"

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
				__vsc_preexec
				builtin eval "${__vsc_dbg_trap}"
			fi
		}
		trap '__vsc_preexec_all "$_"' DEBUG
	fi
fi

__vsc_update_prompt

__vsc_restore_exit_code() {
	return "$1"
}

__vsc_prompt_cmd_original() {
	__vsc_status="$?"
	builtin local cmd
	__vsc_restore_exit_code "${__vsc_status}"
	# Evaluate the original PROMPT_COMMAND similarly to how bash would normally
	# See https://unix.stackexchange.com/a/672843 for technique
	for cmd in "${__vsc_original_prompt_command[@]}"; do
		eval "${cmd:-}"
	done
	__vsc_precmd
}

__vsc_prompt_cmd() {
	__vsc_status="$?"
	__vsc_precmd
}

# PROMPT_COMMAND arrays and strings seem to be handled the same (handling only the first entry of
# the array?)
__vsc_original_prompt_command=${PROMPT_COMMAND:-}

if [[ -z "${bash_preexec_imported:-}" ]]; then
	if [[ -n "${__vsc_original_prompt_command:-}" && "${__vsc_original_prompt_command:-}" != "__vsc_prompt_cmd" ]]; then
		PROMPT_COMMAND=__vsc_prompt_cmd_original
	else
		PROMPT_COMMAND=__vsc_prompt_cmd
	fi
fi
