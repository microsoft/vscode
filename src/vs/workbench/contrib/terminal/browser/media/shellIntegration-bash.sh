# Source .bashrc because --init-file doesn't support it
. ~/.bashrc

IN_COMMAND_EXECUTION="1"
prompt_start() {
    printf "\033]133;A\007"
}

prompt_end() {
    printf "\033]133;B\007"
}

update_cwd() {
    printf "\033]1337;CurrentDir=%s\007" "$PWD"
}

command_output_start() {
    printf "\033]133;C\007"
}

command_complete() {
    printf "\033]133;D;%s\007" "$STATUS"
    update_cwd
}

update_prompt() {
    PRIOR_PROMPT="$PS1"
    IN_COMMAND_EXECUTION=""
    PS1="$(prompt_start)$PREFIX$PS1$(prompt_end)"
}

precmd() {
    local STATUS="$?"
    if [ -z "${IN_COMMAND_EXECUTION-}" ]; then
        # if not in command execution
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
    IN_COMMAND_EXECUTION="1"
    command_output_start
}

update_prompt
prompt_cmd() {
	${ORIGINAL_PROMPT_COMMAND}
	precmd
}
export ORIGINAL_PROMPT_COMMAND=$PROMPT_COMMAND
export PROMPT_COMMAND=prompt_cmd
trap 'preexec' DEBUG

echo -e "\033[01;32mShell integration activated!\033[0m"
