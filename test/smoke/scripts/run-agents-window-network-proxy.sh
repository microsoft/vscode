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
PROXY_AUTH="none"
if [[ "${1:-}" == "--kerberos" ]]; then
	PROXY_AUTH="kerberos"
	shift
fi
PROXY_GROUP="vscodeproxytest"
PF_ANCHOR="com.apple/vscodeproxytest"
MOCK_HOST="vscode-smoke.test"
PROXY_HEADER_VALUE="vscode-smoke-network-proxy-$$"
PAC_URL="http://127.0.0.1:44444/test.pac"
PAC_FILE="$FIXTURE_DIR/test.pac"
PAC_LOG="$LOG_DIR/pac-server.log"
SQUID_ACCESS_LOG="$LOG_DIR/squid-access.log"
SQUID_LOG="$LOG_DIR/squid.log"
SQUID_PREFIX="$(brew --prefix squid 2>/dev/null || true)"
SQUID_BIN="$SQUID_PREFIX/sbin/squid"
NODE_BIN="$(command -v node)"
KDC_BIN="/System/Library/PrivateFrameworks/Heimdal.framework/Helpers/kdc"
KDC_PORT="61088"
KDC_LOG="$LOG_DIR/kdc.log"
KERBEROS_AUTH_LOG="$LOG_DIR/kerberos-auth.log"
KERBEROS_CONFIG="$TEMP_ROOT/krb5.conf"
KERBEROS_CACHE="FILE:$TEMP_ROOT/krb5cc"
KERBEROS_KEYTAB="FILE:$TEMP_ROOT/proxy.keytab"
KERBEROS_REALM="VSCODE.PROXY.TEST"
KERBEROS_USERNAME="PlaceholderUsername"
KERBEROS_PASSWORD="Placeholder"

pac_pid=""
squid_pid=""
kdc_pid=""
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
	if [[ -n "$kdc_pid" ]]; then
		kill "$kdc_pid"
		wait "$kdc_pid"
	fi

	if $group_created; then
		sudo dseditgroup -o delete "$PROXY_GROUP"
	elif $member_added; then
		sudo dseditgroup -o edit -d "$(id -un)" -t user "$PROXY_GROUP"
	fi

	if [[ $exit_code -ne 0 ]]; then
		tail -n 100 "$PAC_LOG" "$SQUID_LOG" "$SQUID_ACCESS_LOG" "$KDC_LOG" "$KERBEROS_AUTH_LOG" 2>/dev/null
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
rm -f "$PAC_LOG" "$SQUID_ACCESS_LOG" "$SQUID_LOG" "$KDC_LOG" "$KERBEROS_AUTH_LOG"
git clone --depth 1 https://github.com/microsoft/vscode-smoketest-express "$TEST_REPO"

if [[ -z "$SQUID_PREFIX" || ! -x "$SQUID_BIN" ]]; then
	echo "Squid is required; install it with 'brew install squid'" >&2
	exit 1
fi

if [[ "$PROXY_AUTH" == "kerberos" ]]; then
	PAC_FILE="$FIXTURE_DIR/test-kerberos.pac"
	if [[ ! -x "$KDC_BIN" ]]; then
		echo "The macOS Heimdal KDC is required at $KDC_BIN" >&2
		exit 1
	fi
	if nc -z 127.0.0.1 "$KDC_PORT"; then
		echo "Port $KDC_PORT must be available for the Kerberos KDC" >&2
		exit 1
	fi

	cat > "$KERBEROS_CONFIG" <<EOF
[libdefaults]
	default_realm = $KERBEROS_REALM
	dns_lookup_realm = false
	dns_lookup_kdc = false

[realms]
	$KERBEROS_REALM = {
		kdc = 127.0.0.1:$KDC_PORT
	}

[domain_realm]
	.localhost = $KERBEROS_REALM
	localhost = $KERBEROS_REALM

[kdc]
	database = {
		dbname = $TEMP_ROOT/heimdal
		realm = $KERBEROS_REALM
		mkey_file = $TEMP_ROOT/heimdal.mkey
	}
EOF

	/usr/sbin/kadmin -l -c "$KERBEROS_CONFIG" init --realm-max-ticket-life=1d --realm-max-renewable-life=7d "$KERBEROS_REALM"
	/usr/sbin/kadmin -l -c "$KERBEROS_CONFIG" add --use-defaults --password="$KERBEROS_PASSWORD" "$KERBEROS_USERNAME"
	/usr/sbin/kadmin -l -c "$KERBEROS_CONFIG" add --use-defaults --random-key HTTP/localhost
	/usr/sbin/kadmin -l -c "$KERBEROS_CONFIG" ext_keytab --keytab="${KERBEROS_KEYTAB#FILE:}" HTTP/localhost

	"$KDC_BIN" --listen-on-network --addresses=127.0.0.1 --ports="$KDC_PORT" --config-file="$KERBEROS_CONFIG" --no-sandbox > "$KDC_LOG" 2>&1 &
	kdc_pid=$!

	kdc_ready=false
	for _ in {1..50}; do
		if nc -z 127.0.0.1 "$KDC_PORT"; then
			kdc_ready=true
			break
		fi
		sleep 0.1
	done
	if ! $kdc_ready; then
		echo "The local Kerberos KDC did not become ready" >&2
		exit 1
	fi

	printf '%s\n' "$KERBEROS_PASSWORD" > "$TEMP_ROOT/kerberos-password"
	KRB5_CONFIG="$KERBEROS_CONFIG" KRB5CCNAME="$KERBEROS_CACHE" \
		/usr/bin/kinit --password-file="$TEMP_ROOT/kerberos-password" "$KERBEROS_USERNAME"
fi

cat > "$TEMP_ROOT/hosts" <<EOF
127.0.0.1 $MOCK_HOST
EOF
cat > "$TEMP_ROOT/squid.conf" <<EOF
visible_hostname vscode-smoke-proxy
http_port 127.0.0.1:43144
hosts_file $TEMP_ROOT/hosts
request_header_add X-VSCode-Smoke-Proxy $PROXY_HEADER_VALUE all
cache deny all
cache_store_log none
access_log stdio:$SQUID_ACCESS_LOG
cache_log $SQUID_LOG
pid_filename $TEMP_ROOT/squid.pid
coredump_dir $TEMP_ROOT
shutdown_lifetime 1 seconds
EOF

if [[ "$PROXY_AUTH" == "kerberos" ]]; then
	cat >> "$TEMP_ROOT/squid.conf" <<EOF
auth_param negotiate program $NODE_BIN $ROOT/test/smoke/out/networkProxy/negotiateAuthHelper.js $KERBEROS_AUTH_LOG
auth_param negotiate children 5
auth_param negotiate keep_alive on
acl connect method CONNECT
acl smoke_mock url_regex ^http://$MOCK_HOST:
acl authenticated proxy_auth REQUIRED
http_access allow smoke_mock !connect
http_access allow authenticated
http_access deny all
EOF
else
	cat >> "$TEMP_ROOT/squid.conf" <<EOF
acl all src all
http_access allow all
EOF
fi

if nc -z 127.0.0.1 44444 || nc -z 127.0.0.1 43144; then
	echo "Ports 44444 and 43144 must be available for the PAC server and Squid proxy" >&2
	exit 1
fi

node "$ROOT/test/smoke/out/networkProxy/pacServer.js" "$PAC_FILE" > "$PAC_LOG" 2>&1 &
pac_pid=$!
if [[ "$PROXY_AUTH" == "kerberos" ]]; then
	KRB5_CONFIG="$KERBEROS_CONFIG" KRB5_KTNAME="$KERBEROS_KEYTAB" "$SQUID_BIN" -N -f "$TEMP_ROOT/squid.conf" -d 1 >> "$SQUID_LOG" 2>&1 &
else
	"$SQUID_BIN" -N -f "$TEMP_ROOT/squid.conf" -d 1 >> "$SQUID_LOG" 2>&1 &
fi
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
if [[ "$PROXY_AUTH" == "kerberos" ]]; then
	restricted_env+=(
		"KRB5_CONFIG=$KERBEROS_CONFIG"
		"KRB5CCNAME=$KERBEROS_CACHE"
	)
fi
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

if [[ "$PROXY_AUTH" == "kerberos" ]]; then
	if curl --fail --silent --connect-timeout 3 --proxy http://localhost:43144 --noproxy '' "$PAC_URL" >/dev/null 2>&1; then
		echo "The Kerberos proxy accepted an unauthenticated request" >&2
		exit 1
	fi
	KRB5_CONFIG="$KERBEROS_CONFIG" KRB5CCNAME="$KERBEROS_CACHE" \
		curl --fail --silent --connect-timeout 3 --proxy http://localhost:43144 --noproxy '' --proxy-negotiate --proxy-user : "$PAC_URL" >/dev/null
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
if [[ -n "$kdc_pid" ]]; then
	kill "$kdc_pid"
	wait "$kdc_pid" || true
	kdc_pid=""
fi

if ! grep -Fq 'GET /test.pac' "$PAC_LOG"; then
	echo "The macOS proxy resolver did not fetch the PAC script" >&2
	exit 1
fi
if ! grep -Fq "$MOCK_HOST" "$SQUID_ACCESS_LOG"; then
	echo "The Agents Window smoke test did not reach the mock server through Squid" >&2
	exit 1
fi
if [[ "$PROXY_AUTH" == "kerberos" ]]; then
	if ! grep -Fq "$KERBEROS_USERNAME@$KERBEROS_REALM" "$KERBEROS_AUTH_LOG"; then
		echo "Squid did not validate a Kerberos token from the Agents Window smoke test" >&2
		exit 1
	fi
	if ! awk -v host="$MOCK_HOST" -v user="$KERBEROS_USERNAME@$KERBEROS_REALM" 'index($0, "TCP_TUNNEL/200") && index($0, "CONNECT " host) && index($0, " " user " ") { found=1 } END { exit !found }' "$SQUID_ACCESS_LOG"; then
		echo "The Agents Window smoke test did not establish a Kerberos-authenticated tunnel through Squid" >&2
		exit 1
	fi
fi
