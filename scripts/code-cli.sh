#!/usr/bin/env bash



:   '
@overview A function that returns the root directory for a given entry (file or directory) 
by going up a specified number of levels.

:param $1 type(string) // Path (can be relative or absolute) for which to find the root directory.
:param $2 type(int) // Number of levels to go up in the directory structure.

:return type(string) // The root directory after going up the specified number of levels.
'

function get_root_dir_for_entry 
{
    # Declaration variables
    local target=$1
    local level_up=$2
    local current_path_for_entry=""
    local root_entry=""


    # Check if the correct number of parameters is passed (2 parameters)
    if [[ $# -ne 2 ]]
    then
        echo "~"
        echo -e "\033[1;31mError\033[0m : The [ \033[1;32mget_root_dir_for_entry\033[0m ] function requires exactly 2 parameters." >&2
        return 1
    fi

    # Check if the second parameter is a non-negative integer (integer >= 0)
    if [[ ! "$level_up" =~ ^[0-9]+$ ]]
    then
        echo "~"
        echo -e "\033[1;31mError\033[0m : The second parameter of the [ \033[1;32mget_root_dir_for_entry\033[0m ] function must be a non-negative integer." >&2
        return 1
    fi

    # Check if the target path exists
    if [[ ! -e "$target" ]]
    then
        echo "~"
        echo -e "\033[1;31mError\033[0m : \033[1;35m$target\033[0m does not exist." >&2
        return 1
    fi

    # If the path starts with `~`, replace it with the `$HOME` directory
    [[ $target == ~* ]] && target="${target/#\~/$HOME}"

    # If the path is absolute (starts with '/')
    if [[ "${target:0:1}" == "/" ]]; 
    then
        current_path_for_entry="$target"
    else
        # If the path is relative, convert it to an absolute path
        current_path_for_entry="$(cd "$(dirname "$target")" && pwd)/$(basename "$target")"
    fi

    # If it's a symbolic link, resolve it to the actual "file/directory"
    if [[ -L "$current_path_for_entry" ]]
    then
        # Fallback for "macOS" when `realpath` is not available, use `readlink -f` if available
        if command -v realpath > /dev/null 2>&1
        then
            current_path_for_entry=$(realpath "$current_path_for_entry")

        elif command -v readlink > /dev/null 2>&1
        then
            # For systems that support `readlink -f` (Linux or some macOS versions ...)
            current_path_for_entry=$(readlink -f "$current_path_for_entry")

        else
			# Use a manual workaround (I prefer to raise an error/exception)
            current_path_for_entry=$(cd "$(dirname "$current_path_for_entry")" && pwd)/$(basename "$current_path_for_entry")
        fi
    fi

    # Store the current directory (`root_entry` starts as `current_path_for_entry`)
    root_entry=$current_path_for_entry

    # Go up the specified number of levels
    for (( i = 0; i < level_up; i++ )); do
        root_entry=$(dirname "$root_entry")
    done

    echo "$root_entry"
}


 
# Call of function : Get the root directory of the project by going up 2 levels from the script's directory 
ROOT=$(get_root_dir_for_entry "$0" 2)



function code() {
	cd $ROOT

	if [[ "$OSTYPE" == "darwin"* ]]; then
		NAME=`node -p "require('./product.json').nameLong"`
		CODE="./.build/electron/$NAME.app/Contents/MacOS/Electron"
	else
		NAME=`node -p "require('./product.json').applicationName"`
		CODE=".build/electron/$NAME"
	fi

	# Get electron, compile, built-in extensions
	if [[ -z "${VSCODE_SKIP_PRELAUNCH}" ]]; then
		node build/lib/preLaunch.js
	fi

	# Manage built-in extensions
	if [[ "$1" == "--builtin" ]]; then
		exec "$CODE" build/builtin
		return
	fi

	ELECTRON_RUN_AS_NODE=1 \
	NODE_ENV=development \
	VSCODE_DEV=1 \
	ELECTRON_ENABLE_LOGGING=1 \
	ELECTRON_ENABLE_STACK_DUMPING=1 \
	"$CODE" --inspect=5874 "$ROOT/out/cli.js" . "$@"
}

code "$@"
