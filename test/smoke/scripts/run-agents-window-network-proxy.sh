#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIXTURE_DIR="$ROOT/test/smoke/network-proxy"
LOG_DIR="$ROOT/.build/logs/agents-window-network-proxy"
TEMP_ROOT="${RUNNER_TEMP:-${AGENT_TEMPDIRECTORY:-${TMPDIR:-/tmp}}}/vscode-agents-window-network-proxy-$$"
TEST_REPO="$TEMP_ROOT/vscode-smoketest-express"
PROXY_GROUP="vscodeproxytest"
PF_ANCHOR="com.apple/vscodeproxytest"
MOCK_HOST="vscode-smoke.test"
PROXY_HEADER_VALUE="vscode-smoke-network-proxy-$$"
PAC_URL="http://127.0.0.1:44444/test.pac"
PAC_LOG="$LOG_DIR/pac-server.log"
SQUID_ACCESS_LOG="$LOG_DIR/squid-access.log"
SQUID_LOG="$LOG_DIR/squid.log"
SQUID_PREFIX="$(brew --prefix squid 2>/dev/null || true)"
SQUID_BIN="$SQUID_PREFIX/sbin/squid"

pac_pid=""
squid_pid=""
primary_service=""
saved_pac_url=""
saved_pac_enabled="No"
pac_configured=false
pf_configured=false
pf_was_enabled=false
group_created=false
member_added=false

cleanup() {
	exit_code=$?
	set +e

	if $pac_configured; then
		if [[ -n "$saved_pac_url" && "$saved_pac_url" != "(null)" ]]; then
			sudo networksetup -setautoproxyurl "$primary_service" "$saved_pac_url"
		fi
		sudo networksetup -setautoproxystate "$primary_service" "$([[ "$saved_pac_enabled" == "Yes" ]] && echo on || echo off)"
	fi

	if $pf_configured; then
		sudo pfctl -a "$PF_ANCHOR" -F all
		if ! $pf_was_enabled; then
			sudo pfctl -d
		fi
	fi

	if [[ -n "$squid_pid" ]]; then
		kill "$squid_pid"
		wait "$squid_pid"
	fi
	if [[ -n "$pac_pid" ]]; then
		kill "$pac_pid"
		wait "$pac_pid"
	fi

	if $group_created; then
		sudo dseditgroup -o delete "$PROXY_GROUP"
	elif $member_added; then
		sudo dseditgroup -o edit -d "$(id -un)" -t user "$PROXY_GROUP"
	fi

	if [[ $exit_code -ne 0 ]]; then
		tail -n 100 "$PAC_LOG" "$SQUID_LOG" "$SQUID_ACCESS_LOG" 2>/dev/null
	fi
	rm -rf "$TEMP_ROOT"
	exit "$exit_code"
}
trap cleanup EXIT

scutil_show() {
	printf 'show %s\n' "$1" | scutil
}

primary_service_id="$(scutil_show 'State:/Network/Global/IPv4' | sed -n 's/^[[:space:]]*PrimaryService[[:space:]]*:[[:space:]]*//p')"
if [[ -z "$primary_service_id" ]]; then
	echo "Unable to determine the primary macOS network service id" >&2
	exit 1
fi
primary_service="$(scutil_show "Setup:/Network/Service/$primary_service_id" | sed -n 's/^[[:space:]]*UserDefinedName[[:space:]]*:[[:space:]]*//p')"
if [[ -z "$primary_service" ]]; then
	echo "Unable to determine the primary macOS network service name" >&2
	exit 1
fi

saved_pac_state="$(networksetup -getautoproxyurl "$primary_service")"
saved_pac_url="$(printf '%s\n' "$saved_pac_state" | sed -n 's/^URL: //p')"
saved_pac_enabled="$(printf '%s\n' "$saved_pac_state" | sed -n 's/^Enabled: //p')"

mkdir -p "$LOG_DIR" "$TEMP_ROOT"
rm -f "$PAC_LOG" "$SQUID_ACCESS_LOG" "$SQUID_LOG"
git clone --depth 1 https://github.com/microsoft/vscode-smoketest-express "$TEST_REPO"

if [[ -z "$SQUID_PREFIX" || ! -x "$SQUID_BIN" ]]; then
	echo "Squid is required; install it with 'brew install squid'" >&2
	exit 1
fi

cat > "$TEMP_ROOT/hosts" <<EOF
127.0.0.1 $MOCK_HOST
EOF
cat > "$TEMP_ROOT/squid.conf" <<EOF
visible_hostname vscode-smoke-proxy
http_port 127.0.0.1:43144
hosts_file $TEMP_ROOT/hosts
acl all src all
http_access allow all
request_header_add X-VSCode-Smoke-Proxy $PROXY_HEADER_VALUE all
cache deny all
cache_store_log none
access_log stdio:$SQUID_ACCESS_LOG
cache_log $SQUID_LOG
pid_filename $TEMP_ROOT/squid.pid
coredump_dir $TEMP_ROOT
EOF

if nc -z 127.0.0.1 44444 || nc -z 127.0.0.1 43144; then
	echo "Ports 44444 and 43144 must be available for the PAC server and Squid proxy" >&2
	exit 1
fi

node "$ROOT/test/smoke/out/networkProxy/pacServer.js" "$FIXTURE_DIR/test.pac" > "$PAC_LOG" 2>&1 &
pac_pid=$!
"$SQUID_BIN" -N -f "$TEMP_ROOT/squid.conf" -d 1 >> "$SQUID_LOG" 2>&1 &
squid_pid=$!

proxy_ready=false
for _ in {1..50}; do
	if nc -z 127.0.0.1 44444 && nc -z 127.0.0.1 43144; then
		proxy_ready=true
		break
	fi
	sleep 0.1
done
if ! $proxy_ready; then
	echo "The local PAC server and Squid proxy did not become ready" >&2
	exit 1
fi

if ! dscl . -read "/Groups/$PROXY_GROUP" >/dev/null 2>&1; then
	sudo dseditgroup -o create "$PROXY_GROUP"
	group_created=true
fi
if ! dseditgroup -o checkmember -m "$(id -un)" "$PROXY_GROUP" | grep -q 'yes'; then
	sudo dseditgroup -o edit -a "$(id -un)" -t user "$PROXY_GROUP"
	member_added=true
fi

cat > "$TEMP_ROOT/pf.conf" <<EOF
pass quick on lo0
block drop out group $PROXY_GROUP
EOF
sudo pfctl -a "$PF_ANCHOR" -nf "$TEMP_ROOT/pf.conf"
if sudo pfctl -s info 2>/dev/null | grep -q 'Status: Enabled'; then
	pf_was_enabled=true
fi
sudo pfctl -a "$PF_ANCHOR" -f "$TEMP_ROOT/pf.conf"
pf_configured=true
if ! $pf_was_enabled; then
	sudo pfctl -e
fi

sudo networksetup -setautoproxyurl "$primary_service" "$PAC_URL"
pac_configured=true
sudo networksetup -setautoproxystate "$primary_service" on

pac_ready=false
for _ in {1..50}; do
	proxy_state="$(scutil --proxy)"
	if grep -Fq 'ProxyAutoConfigEnable : 1' <<< "$proxy_state" && grep -Fq "ProxyAutoConfigURLString : $PAC_URL" <<< "$proxy_state"; then
		pac_ready=true
		break
	fi
	sleep 0.1
done
if ! $pac_ready; then
	echo "SCDynamicStore did not reflect the PAC configuration within 5 seconds" >&2
	exit 1
fi

restricted_env=(
	"HOME=$HOME"
	"LANG=${LANG:-en_US.UTF-8}"
	"LOGNAME=$(id -un)"
	"PATH=$PATH"
	"SHELL=/bin/bash"
	"TMPDIR=${TMPDIR:-/tmp}"
	"USER=$(id -un)"
)
for name in BUILD_ARTIFACTSTAGINGDIRECTORY CI GITHUB_ACTIONS GITHUB_RUN_ATTEMPT GITHUB_RUN_ID GITHUB_WORKSPACE RUNNER_TEMP TF_BUILD; do
	if [[ -n "${!name:-}" ]]; then
		restricted_env+=("$name=${!name}")
	fi
done

run_restricted() {
	sudo -u "$(id -un)" -g "$PROXY_GROUP" env -i "${restricted_env[@]}" "$@"
}

proxy_group_id="$(dscl . -read "/Groups/$PROXY_GROUP" PrimaryGroupID | awk '{ print $2 }')"
if [[ "$(run_restricted id -g)" != "$proxy_group_id" ]]; then
	echo "Unable to run the smoke test with $PROXY_GROUP as its primary group" >&2
	exit 1
fi

if ! run_restricted curl --fail --silent --connect-timeout 3 --noproxy '*' "$PAC_URL" >/dev/null; then
	echo "Loopback access was blocked for group $PROXY_GROUP" >&2
	exit 1
fi

if run_restricted curl --fail --silent --connect-timeout 3 --noproxy '*' http://1.1.1.1 >/dev/null 2>&1; then
	echo "Direct network access was not blocked for group $PROXY_GROUP" >&2
	exit 1
fi

cd "$ROOT"
run_restricted env VSCODE_SMOKE_TEST_MOCK_HOST="$MOCK_HOST" VSCODE_SMOKE_TEST_PROXY_HEADER="$PROXY_HEADER_VALUE" \
	npm run smoketest-no-compile -- --tracing -g 'Agents Window' --fail-zero --test-repo "$TEST_REPO" --skip-stable-build "$@"

kill "$squid_pid"
wait "$squid_pid" || true
squid_pid=""
kill "$pac_pid"
wait "$pac_pid" || true
pac_pid=""

if ! grep -Fq 'GET /test.pac' "$PAC_LOG"; then
	echo "The macOS proxy resolver did not fetch the PAC script" >&2
	exit 1
fi
if ! grep -Fq "$MOCK_HOST" "$SQUID_ACCESS_LOG"; then
	echo "The Agents Window smoke test did not reach the mock server through Squid" >&2
	exit 1
fi
