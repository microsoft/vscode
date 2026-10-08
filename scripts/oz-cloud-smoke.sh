#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#--------------------------------------------------------------------------------------------
#
# OZ / cloud development smoke check.
# Verifies the pinned Node version, installed dependencies, and built desktop
# and web artifacts, then runs one focused unit-test file with scripts/test.sh.
# Pass --web to also start the built server on 127.0.0.1 with connection-token
# authentication enabled, check HTTP, and stop only that server.
#
# See scripts/oz-cloud.md.

set -euo pipefail

if [[ "${OSTYPE}" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname "$(dirname "$(realpath "$0")")")
else
	ROOT=$(dirname "$(dirname "$(readlink -f "$0")")")
fi

cd "$ROOT"

WEB=0
if [[ "${1:-}" == "--web" ]]; then
	WEB=1
elif [[ -n "${1:-}" ]]; then
	echo "Usage: ./scripts/oz-cloud-smoke.sh [--web]" >&2
	exit 2
fi

UNIT_TEST_FILE="src/vs/server/test/node/serverConnectionToken.test.ts"
WEB_PORT_RANGE="39200-39220"
server_pid=""
smoke_tmp=""

kill_started_tree() {
	local pid="$1"
	local child
	if [[ -z "$pid" ]]; then
		return 0
	fi
	# Children first so a parent shell does not leave the server running.
	while read -r child; do
		[[ -n "$child" ]] || continue
		kill_started_tree "$child"
	done < <(ps -o pid= --ppid "$pid" 2>/dev/null || true)
	kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
	local pid="$server_pid"
	server_pid=""
	if [[ -n "$pid" ]]; then
		kill_started_tree "$pid"
		wait "$pid" 2>/dev/null || true
	fi
	if [[ -n "$smoke_tmp" && -d "$smoke_tmp" ]]; then
		rm -rf "$smoke_tmp"
		smoke_tmp=""
	fi
}
trap cleanup EXIT

echo "oz-cloud-smoke: repo ${ROOT}"

expected_node="v$(tr -d '[:space:]' < .nvmrc)"
actual_node="$(node -v)"
if [[ "$actual_node" != "$expected_node" ]]; then
	echo "node: ${actual_node} does not match .nvmrc ${expected_node}" >&2
	exit 1
fi
echo "node: ${actual_node} matches .nvmrc"

if [[ ! -d node_modules || ! -f node_modules/.package-lock.json || ! -f node_modules/mocha/package.json ]]; then
	echo "dependencies: node_modules is missing a completed npm install (node_modules/.package-lock.json, mocha)" >&2
	exit 1
fi
remote_node="$(node build/lib/node.ts)"
if [[ ! -x "$remote_node" ]]; then
	echo "dependencies: remote node from build/lib/node.ts is missing (${remote_node})" >&2
	exit 1
fi
echo "dependencies: node_modules present; remote node ${remote_node}"

app_name="$(node -p "require('./product.json').applicationName")"
desktop=".build/electron/${app_name}"
expected_electron="$(sed -n 's/^target="\([^"]*\)"$/\1/p' .npmrc | head -1)"
if [[ ! -x "$desktop" || ! -f .build/electron/version ]]; then
	echo "desktop: ${desktop} or .build/electron/version is missing" >&2
	exit 1
fi
installed_electron="$(tr -d '[:space:]' < .build/electron/version)"
installed_electron="${installed_electron#v}"
if [[ "$installed_electron" != "$expected_electron" ]]; then
	echo "desktop: electron ${installed_electron} does not match .npmrc target ${expected_electron}" >&2
	exit 1
fi
for artifact in \
	out/main.js \
	out/vs/code/electron-main/main.js \
	out/vs/workbench/workbench.desktop.main.js
do
	if [[ ! -f "$artifact" ]]; then
		echo "desktop: missing ${artifact}" >&2
		exit 1
	fi
done
echo "desktop: ${desktop} (electron ${installed_electron}); out/main.js and workbench.desktop.main.js present"

for artifact in \
	out/server-main.js \
	out/vs/code/browser/workbench/workbench.js \
	out/vs/code/browser/workbench/workbench-dev.html
do
	if [[ ! -f "$artifact" ]]; then
		echo "web: missing ${artifact}" >&2
		exit 1
	fi
done
echo "web: out/server-main.js and workbench-dev.html present"

test_log="$(mktemp)"
test_started=$(date +%s.%N)
set +e
./scripts/test.sh --run "$UNIT_TEST_FILE" 2>&1 | tee "$test_log"
test_status=${PIPESTATUS[0]}
set -e
test_ended=$(date +%s.%N)
test_elapsed=$(awk -v s="$test_started" -v e="$test_ended" 'BEGIN { printf "%.3f", e - s }')
passing=$(grep -E '[0-9]+ passing' "$test_log" | tail -1 || true)
failing=$(grep -E '[0-9]+ failing' "$test_log" | tail -1 || true)
echo "unit tests: ./scripts/test.sh --run ${UNIT_TEST_FILE}"
echo "unit tests: exit ${test_status}; elapsed ${test_elapsed}s; ${passing:-no passing summary}${failing:+; ${failing}}"
rm -f "$test_log"
if [[ "$test_status" -ne 0 ]]; then
	exit "$test_status"
fi

if [[ "$WEB" -ne 1 ]]; then
	echo "oz-cloud-smoke: ok"
	exit 0
fi

smoke_tmp="$(mktemp -d)"
chmod 700 "$smoke_tmp"
token_file="${smoke_tmp}/connection-token"
node -e "require('fs').writeFileSync(process.argv[1], require('crypto').randomBytes(24).toString('hex'), { mode: 0o600 })" "$token_file"
chmod 600 "$token_file"
server_log="${smoke_tmp}/server.log"
server_data="${smoke_tmp}/server-data"

echo "web probe: ./scripts/code-server.sh --host 127.0.0.1 --port ${WEB_PORT_RANGE} --accept-server-license-terms --connection-token-file <token> --server-data-dir <temp> --disable-telemetry"
set -m
./scripts/code-server.sh \
	--host 127.0.0.1 \
	--port "$WEB_PORT_RANGE" \
	--accept-server-license-terms \
	--connection-token-file "$token_file" \
	--server-data-dir "$server_data" \
	--disable-telemetry \
	>"$server_log" 2>&1 </dev/null &
server_pid=$!

web_started=$(date +%s.%N)
ready=0
for _ in $(seq 1 120); do
	if grep -q "Web UI available at " "$server_log" && grep -q "Server bound to 127.0.0.1:" "$server_log"; then
		ready=1
		break
	fi
	if ! kill -0 "$server_pid" 2>/dev/null; then
		break
	fi
	sleep 1
done
if [[ "$ready" -ne 1 ]]; then
	echo "web probe: server did not become ready" >&2
	sed -E 's/(tkn=)[^&[:space:]]+/\1<redacted>/g' "$server_log" | tail -n 60 >&2 || true
	exit 1
fi

bound=$(grep -m1 -E 'Server bound to 127\.0\.0\.1:[0-9]+ \(IPv4\)' "$server_log" || true)
if [[ -z "$bound" ]]; then
	echo "web probe: server did not bind to 127.0.0.1" >&2
	sed -E 's/(tkn=)[^&[:space:]]+/\1<redacted>/g' "$server_log" | tail -n 40 >&2 || true
	exit 1
fi
port="${bound#*127.0.0.1:}"
port="${port%% *}"
base="http://127.0.0.1:${port}"

if command -v ss >/dev/null 2>&1; then
	listeners=$(ss -ltn "sport = :${port}" || true)
	if ! grep -q "127.0.0.1:${port}" <<<"$listeners"; then
		echo "web probe: ${port} is not listening on 127.0.0.1" >&2
		echo "$listeners" >&2
		exit 1
	fi
	if grep -E "0\\.0\\.0\\.0:${port}|\\*:${port}|\\[::\\]:${port}" <<<"$listeners" >/dev/null; then
		echo "web probe: ${port} is listening beyond loopback" >&2
		echo "$listeners" >&2
		exit 1
	fi
fi

unauth_headers="${smoke_tmp}/unauth.headers"
unauth_body="${smoke_tmp}/unauth.body"
curl -sS --max-time 20 -D "$unauth_headers" -o "$unauth_body" "${base}/"
unauth_status=$(awk '/^HTTP/{ code=$2 } END{ print code }' "$unauth_headers")
unauth_text=$(tr -d '\r' < "$unauth_body")
unauth_text="${unauth_text%$'\n'}"
if [[ "$unauth_status" != "403" ]] || [[ "$unauth_text" != "Forbidden." ]]; then
	echo "web probe: unauthenticated GET ${base}/ returned ${unauth_status}" >&2
	exit 1
fi

token="$(tr -d '[:space:]' < "$token_file")"
auth_headers="${smoke_tmp}/auth.headers"
auth_body="${smoke_tmp}/auth.body"
cookie_jar="${smoke_tmp}/cookies"
curl -sS --max-time 20 -c "$cookie_jar" -D "$auth_headers" -o "$auth_body" "${base}/?tkn=${token}"
auth_status=$(awk '/^HTTP/{ code=$2 } END{ print code }' "$auth_headers")
if [[ "$auth_status" != "302" ]] || ! grep -q "vscode-tkn=" "$auth_headers"; then
	echo "web probe: token GET returned ${auth_status} without a vscode-tkn cookie" >&2
	exit 1
fi

page_headers="${smoke_tmp}/page.headers"
page_body="${smoke_tmp}/page.body"
curl -sS --max-time 20 -b "$cookie_jar" -D "$page_headers" -o "$page_body" "${base}/"
page_status=$(awk '/^HTTP/{ code=$2 } END{ print code }' "$page_headers")
if [[ "$page_status" != "200" ]] || ! grep -q 'id="vscode-workbench-web-configuration"' "$page_body"; then
	echo "web probe: authenticated GET ${base}/ returned ${page_status}" >&2
	exit 1
fi

web_ended=$(date +%s.%N)
web_elapsed=$(awk -v s="$web_started" -v e="$web_ended" 'BEGIN { printf "%.3f", e - s }')
echo "web probe: bound ${bound#Server bound to }"
echo "web probe: unauthenticated GET / -> 403 Forbidden."
echo "web probe: GET /?tkn=<token> -> 302 Set-Cookie vscode-tkn"
echo "web probe: authenticated GET / -> 200 workbench html"
echo "web probe: elapsed ${web_elapsed}s"

# Stop the server before the EXIT trap so a second cleanup is a no-op.
cleanup
echo "oz-cloud-smoke: ok"
exit 0
