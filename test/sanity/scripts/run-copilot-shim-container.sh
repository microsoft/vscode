#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

set -eu

container=
format=
fixtures=
grep=
arch=amd64
timeout=
registry='vscodehub.azurecr.io/vscode-linux-build-agent/sanity-tests'

usage() {
	cat <<'EOF'
Usage: run-copilot-shim-container.sh --container <ubuntu|fedora|...> --format <deb|rpm> --fixtures <manifest> --grep <selector> [--arch <amd64|arm64>] [--timeout <seconds>]

Runs the focused Copilot shim package-lifecycle suite in a new container. It mounts only the
sanity workspace, fixture bundle, and a retained evidence directory; it never mounts host /usr or /etc.
EOF
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--container) container=$2; shift 2 ;;
		--format) format=$2; shift 2 ;;
		--fixtures) fixtures=$2; shift 2 ;;
		--grep) grep=$2; shift 2 ;;
		--arch) arch=$2; shift 2 ;;
		--timeout) timeout=$2; shift 2 ;;
		--help|-h) usage; exit 0 ;;
		*) echo "Error: unknown argument $1" >&2; usage >&2; exit 1 ;;
	esac
done

[ -n "$container" ] || { echo 'Error: --container is required.' >&2; exit 1; }
[ "$format" = deb ] || [ "$format" = rpm ] || { echo 'Error: --format must be deb or rpm.' >&2; exit 1; }
[ -n "$fixtures" ] || { echo 'Error: --fixtures is required.' >&2; exit 1; }
[ -n "$grep" ] || { echo 'Error: --grep is required.' >&2; exit 1; }
[ -f "$fixtures" ] || { echo "Error: fixture manifest does not exist: $fixtures" >&2; exit 1; }

script_directory=$(cd "$(dirname "$0")" && pwd)
sanity_root=$(cd "$script_directory/.." && pwd)
fixture_manifest=$(cd "$(dirname "$fixtures")" && pwd)/$(basename "$fixtures")
fixture_root=$(dirname "$fixture_manifest")
runner_id="copilot-shim-$(date +%s)-$$"
marker="/run/vscode-copilot-shim-package-lifecycle/$runner_id/marker.json"
evidence_directory="$sanity_root/artifacts/copilot-shim-evidence/$runner_id"
image="$registry:$container-$arch"

mkdir -p "$evidence_directory"

docker pull --platform "linux/$arch" "$image"
docker_arguments=(
	--rm
	--platform "linux/$arch"
	--mount "type=bind,source=$sanity_root,target=/workspace,readonly"
	--mount "type=bind,source=$fixture_root,target=/fixtures,readonly"
	--mount "type=bind,source=$evidence_directory,target=/evidence"
	--env VSCODE_COPILOT_SHIM_DISPOSABLE_RUNNER=1
	--env VSCODE_COPILOT_SHIM_RUNNER_ID="$runner_id"
	--env VSCODE_COPILOT_SHIM_RUNNER_MARKER="$marker"
	--env VSCODE_COPILOT_SHIM_EVIDENCE_DIR=/evidence
	--env "VSCODE_COPILOT_SHIM_FIXTURES=/fixtures/$(basename "$fixture_manifest")"
	--env "VSCODE_COPILOT_SHIM_FORMAT=$format"
	--env "VSCODE_COPILOT_SHIM_GREP=$grep"
)
if [ -n "$timeout" ]; then
	docker_arguments+=(--env "VSCODE_COPILOT_SHIM_TIMEOUT=$timeout")
fi

docker run "${docker_arguments[@]}" \
	--entrypoint /bin/sh \
	"$image" \
	-c 'set -eu
		bash /workspace/scripts/provision-copilot-shim-runner.sh
		if [ -n "${VSCODE_COPILOT_SHIM_TIMEOUT:-}" ]; then
			exec node /workspace/out/copilotShimIndex.js \
				--fixtures "$VSCODE_COPILOT_SHIM_FIXTURES" \
				--format "$VSCODE_COPILOT_SHIM_FORMAT" \
				--grep "$VSCODE_COPILOT_SHIM_GREP" \
				--timeout "$VSCODE_COPILOT_SHIM_TIMEOUT"
		fi
		exec node /workspace/out/copilotShimIndex.js \
			--fixtures "$VSCODE_COPILOT_SHIM_FIXTURES" \
			--format "$VSCODE_COPILOT_SHIM_FORMAT" \
			--grep "$VSCODE_COPILOT_SHIM_GREP"'
