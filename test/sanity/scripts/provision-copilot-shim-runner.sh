#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

set -eu

purpose='vscode-copilot-shim-package-lifecycle'
marker_root="/run/$purpose"
state_root="/var/lib/$purpose"
usr_probe_root="/usr/share/$purpose"
etc_probe_root="/etc/$purpose"

fail() {
	echo "Error: $1" >&2
	exit 1
}

[ "$(uname -s)" = Linux ] || fail 'Copilot shim package lifecycle provisioning requires Linux.'
[ "$(id -u)" -eq 0 ] || fail 'Copilot shim package lifecycle provisioning requires root inside a disposable runner.'
[ "${VSCODE_COPILOT_SHIM_DISPOSABLE_RUNNER:-}" = 1 ] || fail 'Set VSCODE_COPILOT_SHIM_DISPOSABLE_RUNNER=1 only in a disposable container or VM.'

runner_id=${VSCODE_COPILOT_SHIM_RUNNER_ID:-}
case "$runner_id" in
	''|*[!A-Za-z0-9_-]*)
		fail 'VSCODE_COPILOT_SHIM_RUNNER_ID must contain only letters, digits, underscores, and dashes.'
		;;
esac

assert_not_bind_mounted() {
	mount_path=$1
	if ! awk -v mount_path="$mount_path" '$5 == mount_path && $4 != "/" { bad = 1 } END { exit bad }' /proc/self/mountinfo; then
		fail "$mount_path is a bind or subdirectory mount. Do not mount host /usr or /etc into this runner."
	fi
}

assert_not_bind_mounted /usr
assert_not_bind_mounted /etc

marker_directory="$marker_root/$runner_id"
marker_path="$marker_directory/marker.json"
work_root="$state_root/$runner_id/work"
usr_probe="$usr_probe_root/$runner_id"
etc_probe="$etc_probe_root/$runner_id"
evidence_root=${VSCODE_COPILOT_SHIM_EVIDENCE_DIR:-"$work_root/evidence"}

[ ! -e "$marker_path" ] || fail "Runner marker already exists: $marker_path. Provision a new disposable runner instead of reusing state."
case "${VSCODE_COPILOT_SHIM_RUNNER_MARKER:-$marker_path}" in
	"$marker_path") ;;
	*) fail "VSCODE_COPILOT_SHIM_RUNNER_MARKER must be $marker_path." ;;
esac

umask 077
mkdir -p "$marker_directory" "$work_root" "$usr_probe" "$etc_probe" "$evidence_root"
mount_namespace=$(readlink /proc/self/ns/mnt)

printf '{\n\t"schemaVersion": 1,\n\t"purpose": "%s",\n\t"runnerId": "%s",\n\t"mountNamespace": "%s",\n\t"workRoot": "%s",\n\t"evidenceRoot": "%s",\n\t"usrProbe": "%s",\n\t"etcProbe": "%s"\n}\n' \
	"$purpose" "$runner_id" "$mount_namespace" "$work_root" "$evidence_root" "$usr_probe" "$etc_probe" > "$marker_path"

echo "Provisioned disposable Copilot shim package-lifecycle runner marker: $marker_path"
