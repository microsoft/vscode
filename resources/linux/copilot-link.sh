# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

vscode_copilot_link_path=/usr/bin/copilot
vscode_copilot_link_code_target=/usr/share/code/bin/copilot-shim/copilot
vscode_copilot_link_code_insiders_target=/usr/share/code-insiders/bin/copilot-shim/copilot

vscode_copilot_link_warn() {
	printf '%s\n' "warning: vscode_copilot_link: $1" >&2
}

vscode_copilot_link_read_target() {
	vscode_copilot_link_read_path=$1
	vscode_copilot_link_read_target=

	if [ ! -L "$vscode_copilot_link_read_path" ]; then
		return 1
	fi

	if ! vscode_copilot_link_read_target=$(readlink -n -- "$vscode_copilot_link_read_path" && printf x); then
		vscode_copilot_link_warn "could not inspect symbolic link $vscode_copilot_link_read_path"
		return 1
	fi

	vscode_copilot_link_read_target=${vscode_copilot_link_read_target%x}
	return 0
}

vscode_copilot_link_is_usable() {
	[ -f "$1" ] && [ -x "$1" ]
}

vscode_copilot_link_cleanup_temporary() {
	vscode_copilot_link_cleanup_status=0

	if [ "$vscode_copilot_link_temporary_link_created" = true ] && [ -L "$vscode_copilot_link_temporary_link" ]; then
		if vscode_copilot_link_read_target "$vscode_copilot_link_temporary_link" && [ "$vscode_copilot_link_read_target" = "$vscode_copilot_link_new_target" ]; then
			if ! rm -f -- "$vscode_copilot_link_temporary_link"; then
				vscode_copilot_link_warn "$vscode_copilot_link_operation: failed to remove temporary link $vscode_copilot_link_temporary_link"
				vscode_copilot_link_cleanup_status=1
			fi
		else
			vscode_copilot_link_warn "$vscode_copilot_link_operation: temporary link $vscode_copilot_link_temporary_link changed before cleanup; preserving it"
			vscode_copilot_link_cleanup_status=1
		fi
	elif [ -e "$vscode_copilot_link_temporary_link" ]; then
		vscode_copilot_link_warn "$vscode_copilot_link_operation: temporary path $vscode_copilot_link_temporary_link is no longer an owned symbolic link; preserving it"
		vscode_copilot_link_cleanup_status=1
	fi

	if [ -d "$vscode_copilot_link_temporary_directory" ]; then
		if ! rmdir -- "$vscode_copilot_link_temporary_directory"; then
			vscode_copilot_link_warn "$vscode_copilot_link_operation: failed to remove temporary directory $vscode_copilot_link_temporary_directory"
			vscode_copilot_link_cleanup_status=1
		fi
	elif [ -e "$vscode_copilot_link_temporary_directory" ] || [ -L "$vscode_copilot_link_temporary_directory" ]; then
		vscode_copilot_link_warn "$vscode_copilot_link_operation: temporary path $vscode_copilot_link_temporary_directory is no longer an owned directory; preserving it"
		vscode_copilot_link_cleanup_status=1
	fi

	return "$vscode_copilot_link_cleanup_status"
}

vscode_copilot_link_replace_recognized() {
	vscode_copilot_link_new_target=$1
	vscode_copilot_link_expected_target=$2
	vscode_copilot_link_operation=$3
	vscode_copilot_link_temporary_directory=
	vscode_copilot_link_temporary_link=
	vscode_copilot_link_temporary_link_created=false

	if ! vscode_copilot_link_temporary_directory=$(mktemp -d "${vscode_copilot_link_path}.vscode-copilot.XXXXXX"); then
		vscode_copilot_link_warn "$vscode_copilot_link_operation: failed to create a temporary directory beside $vscode_copilot_link_path while selecting $vscode_copilot_link_new_target"
		return 1
	fi

	vscode_copilot_link_temporary_link=$vscode_copilot_link_temporary_directory/copilot
	if ! ln -s -T -- "$vscode_copilot_link_new_target" "$vscode_copilot_link_temporary_link"; then
		vscode_copilot_link_warn "$vscode_copilot_link_operation: failed to create temporary link $vscode_copilot_link_temporary_link"
		vscode_copilot_link_cleanup_temporary || :
		return 1
	fi
	vscode_copilot_link_temporary_link_created=true

	if ! vscode_copilot_link_read_target "$vscode_copilot_link_path"; then
		vscode_copilot_link_warn "$vscode_copilot_link_operation: could not recheck $vscode_copilot_link_path before replacement; preserving it"
		vscode_copilot_link_cleanup_temporary || :
		return 1
	fi

	if [ "$vscode_copilot_link_read_target" != "$vscode_copilot_link_expected_target" ]; then
		vscode_copilot_link_warn "$vscode_copilot_link_operation: $vscode_copilot_link_path changed before replacement; preserving it"
		vscode_copilot_link_cleanup_temporary || :
		return 1
	fi

	if ! mv -Tf -- "$vscode_copilot_link_temporary_link" "$vscode_copilot_link_path"; then
		vscode_copilot_link_warn "$vscode_copilot_link_operation: failed to replace $vscode_copilot_link_path with $vscode_copilot_link_new_target"
		vscode_copilot_link_cleanup_temporary || :
		return 1
	fi
	vscode_copilot_link_temporary_link_created=false

	if ! vscode_copilot_link_cleanup_temporary; then
		return 1
	fi

	return 0
}

vscode_copilot_link_install() {
	if ! vscode_copilot_link_is_usable "$vscode_copilot_link_current_target"; then
		vscode_copilot_link_warn "install: current Copilot shim is not a regular executable file at $vscode_copilot_link_current_target; preserving $vscode_copilot_link_path"
		return 1
	fi

	if [ -L "$vscode_copilot_link_path" ]; then
		if ! vscode_copilot_link_read_target "$vscode_copilot_link_path"; then
			vscode_copilot_link_warn "install: could not inspect $vscode_copilot_link_path; preserving it"
			return 1
		fi

		if [ "$vscode_copilot_link_read_target" = "$vscode_copilot_link_code_target" ] || [ "$vscode_copilot_link_read_target" = "$vscode_copilot_link_code_insiders_target" ]; then
			vscode_copilot_link_replace_recognized "$vscode_copilot_link_current_target" "$vscode_copilot_link_read_target" install
			return $?
		fi

		return 0
	fi

	if [ -e "$vscode_copilot_link_path" ]; then
		return 0
	fi

	if ! ln -s -T -- "$vscode_copilot_link_current_target" "$vscode_copilot_link_path"; then
		vscode_copilot_link_warn "install: failed to create $vscode_copilot_link_path pointing to $vscode_copilot_link_current_target; preserving the current entry"
		return 1
	fi

	return 0
}

vscode_copilot_link_remove() {
	if [ ! -L "$vscode_copilot_link_path" ]; then
		return 0
	fi

	if ! vscode_copilot_link_read_target "$vscode_copilot_link_path"; then
		vscode_copilot_link_warn "remove: could not inspect $vscode_copilot_link_path; preserving it"
		return 1
	fi

	if [ "$vscode_copilot_link_read_target" != "$vscode_copilot_link_current_target" ]; then
		return 0
	fi

	if vscode_copilot_link_is_usable "$vscode_copilot_link_other_target"; then
		vscode_copilot_link_replace_recognized "$vscode_copilot_link_other_target" "$vscode_copilot_link_current_target" remove
		return $?
	fi

	if ! vscode_copilot_link_read_target "$vscode_copilot_link_path"; then
		vscode_copilot_link_warn "remove: could not recheck $vscode_copilot_link_path before removal; preserving it"
		return 1
	fi

	if [ "$vscode_copilot_link_read_target" != "$vscode_copilot_link_current_target" ]; then
		vscode_copilot_link_warn "remove: $vscode_copilot_link_path changed before removal; preserving it"
		return 1
	fi

	if ! rm -f -- "$vscode_copilot_link_path"; then
		vscode_copilot_link_warn "remove: failed to remove owned link $vscode_copilot_link_path"
		return 1
	fi

	return 0
}

vscode_copilot_link() {
	vscode_copilot_link_action=${1-}
	vscode_copilot_link_application_name=${2-}

	if [ "$#" -ne 2 ]; then
		vscode_copilot_link_warn "expected an action and application name"
		return 1
	fi

	case "$vscode_copilot_link_application_name" in
		code)
			vscode_copilot_link_current_target=$vscode_copilot_link_code_target
			vscode_copilot_link_other_target=$vscode_copilot_link_code_insiders_target
			;;
		code-insiders)
			vscode_copilot_link_current_target=$vscode_copilot_link_code_insiders_target
			vscode_copilot_link_other_target=$vscode_copilot_link_code_target
			;;
		*)
			return 0
			;;
	esac

	case "$vscode_copilot_link_action" in
		install)
			vscode_copilot_link_install
			;;
		remove)
			vscode_copilot_link_remove
			;;
		*)
			vscode_copilot_link_warn "unknown action $vscode_copilot_link_action"
			return 1
			;;
	esac
}
