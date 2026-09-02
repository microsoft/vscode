#!/usr/bin/env bash
# Launch Code OSS (VS Code from sources) with:
#   - a fresh, slimmed copy of the authenticated user-data-dir (so Copilot/GitHub auth works)
#   - an isolated --shared-data-dir (otherwise two instances share ~/.vscode-oss-shared and crash each other)
#   - unique debug ports for renderer (CDP), extension host, main process, and agent host
#   - a persistent, token-authenticated automation driver for arbitrary Playwright code
#
# Auth on macOS comes from the OS keychain (per-app, shared automatically) plus
# the encrypted blob in User/globalStorage/state.vscdb (per-UDD). The slim copy
# keeps the auth-relevant state and drops caches / workspaceStorage / logs.
#
# Prints a single JSON line to stdout with the chosen ports + paths so the
# caller can pick them up programmatically. Logs go to stderr.
#
# Usage:
#   launch.sh [--agents] [--source-user-data-dir <path>] [--repo <vscode-repo-root>]
#             [--clone-extensions] [--full] [--skip-prelaunch]
#             [--disable-workspace-trust] [-- <extra code.sh args>]
#
# Flags:
#   --clone-extensions  Copy the source extensions/ into the new profile (~10s).
#                       Default: start with an EMPTY extensions/ dir - fastest
#                       and conflict-free, but no third-party extensions.
#   --full              Copy the entire profile (incl. extensions). Use if the
#                       slim copy is missing something you need.
#   --skip-prelaunch    Skip build/lib/preLaunch.ts after a successful prepared
#                       launch while build outputs remain current.
#   --disable-workspace-trust
#                       Disable trust prompts for unattended automation. Only
#                       use with content you trust.
#
# Defaults:
#   --source-user-data-dir  $CODE_OSS_DEV_AUTHED_USER_DATA_DIR  (else ~/.vscode-oss-dev)
#   --repo                  $PWD if it looks like a vscode checkout; otherwise pass it explicitly

set -euo pipefail
umask 077

AGENTS=0
SOURCE_UDD="${CODE_OSS_DEV_AUTHED_USER_DATA_DIR:-$HOME/.vscode-oss-dev}"
REPO=""
EXTRA_ARGS=()
CLONE_EXTENSIONS=0
FULL=0
SKIP_PRELAUNCH=0
DISABLE_WORKSPACE_TRUST=0

while [[ $# -gt 0 ]]; do
	case "$1" in
		--agents) AGENTS=1; shift ;;
		--source-user-data-dir) SOURCE_UDD="$2"; shift 2 ;;
		--repo) REPO="$2"; shift 2 ;;
		--clone-extensions|--copy-extensions) CLONE_EXTENSIONS=1; shift ;;
		--full) FULL=1; shift ;;
		--skip-prelaunch) SKIP_PRELAUNCH=1; shift ;;
		--disable-workspace-trust) DISABLE_WORKSPACE_TRUST=1; shift ;;
		--) shift; EXTRA_ARGS=("$@"); break ;;
		*) echo "Unknown arg: $1" >&2; exit 2 ;;
	esac
done

monotonic_ms() {
	node -e 'process.stdout.write(String(process.hrtime.bigint() / 1_000_000n))'
}

stop_run_processes() {
	local run_dir="$1"
	shift
	for pid in "$@"; do
		if [[ "$pid" =~ ^[0-9]+$ ]]; then
			kill "$pid" 2>/dev/null || true
		fi
	done
	sleep 1

	if ! command -v pgrep >/dev/null; then
		echo "[launch.sh] pgrep not found; could not verify process-tree cleanup for $run_dir" >&2
		return
	fi

	local run_re survivors survivor
	run_re=$(printf '%s' "$run_dir" | sed 's/[][\.^$*+?(){}|\\]/\\&/g')
	if survivors=$(pgrep -f "$run_re"); then
		while IFS= read -r survivor; do
			if [[ "$survivor" =~ ^[0-9]+$ ]]; then
				kill "$survivor" 2>/dev/null || true
			fi
		done <<<"$survivors"
		sleep 1
	fi

	if survivors=$(pgrep -f "$run_re"); then
		echo "[launch.sh] WARNING: process(es) still running for $run_dir: $(printf '%s' "$survivors" | tr '\n' ' ')" >&2
	fi
}

LAUNCH_START_MS=$(monotonic_ms)

if [[ -z "$REPO" ]]; then
	if [[ -x "$PWD/scripts/code.sh" ]]; then
		REPO="$PWD"
	else
		echo "Could not find a vscode checkout in $PWD. Pass --repo <path>." >&2
		exit 2
	fi
fi
NORMALIZE_SETTINGS="$(cd "$(dirname "$0")" && pwd)/normalize-automation-settings.ts"

if [[ ! -d "$SOURCE_UDD" ]]; then
	echo "Source user-data-dir does not exist: $SOURCE_UDD" >&2
	echo "Pass --source-user-data-dir <path> or set CODE_OSS_DEV_AUTHED_USER_DATA_DIR." >&2
	exit 2
fi

# A workspace value wins over the cloned profile's user setting. Refuse a
# forwarded folder or .code-workspace that disables the simple dialog, or Open
# Folder would still launch a native OS dialog that CDP cannot drive.
if (( ${#EXTRA_ARGS[@]} )); then
	if ! node "$NORMALIZE_SETTINGS" --check-workspace-args "${EXTRA_ARGS[@]}"; then
		exit 1
	fi
elif ! node "$NORMALIZE_SETTINGS" --check-workspace-args; then
	exit 1
fi

PORTS=$(node <<'NODE'
const net = require('net');

const fail = error => {
	console.error('[launch.sh] failed to allocate debug ports:', error);
	process.exit(1);
};
const servers = Array.from({ length: 5 }, () => net.createServer().on('error', fail));
(async () => {
	await Promise.all(servers.map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))));
	const ports = servers.map(server => server.address().port);
	await Promise.all(servers.map(server => new Promise((resolve, reject) => {
		server.close(error => error ? reject(error) : resolve());
	})));
	console.log(ports.join(' '));
})().catch(fail);
NODE
)
read -r CDP_PORT EXTHOST_PORT MAIN_PORT AGENTHOST_PORT AUTOMATION_PORT <<< "$PORTS"

STAMP=$(date +%Y%m%d-%H%M%S)-$$
# mktemp fills in the X's only when they trail the template; elsewhere they stay literal.
RUN_NAME="code-oss-dev-$STAMP-XXXXXX"
RUN_BASE="${TMPDIR:-/tmp}"
# Electron's main IPC socket ("<run-dir>/user-data/<version>-main.sock") must fit
# the ~103-byte unix socket limit, which macOS's default TMPDIR alone overflows.
# Measure bytes, not characters, since a multibyte TMPDIR would pass a char count
# and still fail to bind.
if (( $(printf '%s' "$RUN_BASE/$RUN_NAME" | wc -c) + 25 > 103 )); then
	RUN_BASE=/tmp
	echo "[launch.sh] TMPDIR too long for unix sockets; using $RUN_BASE" >&2
fi
# mktemp -d creates the directory atomically with 0700 perms, so this copy of the
# authenticated profile can't be pre-created or symlinked by another user, and its
# token files aren't left world-readable when the temp base is shared (/tmp).
RUN_DIR=$(mktemp -d "$RUN_BASE/$RUN_NAME")
DEST_UDD="$RUN_DIR/user-data"
SHARED_DATA_DIR="$RUN_DIR/shared-data"
mkdir -p "$DEST_UDD" "$SHARED_DATA_DIR"

# Excludes (deny-list, so future VS Code additions copy through by default).
# Anchored excludes (starting with /) match only at the top level so we don't
# accidentally strip files inside subdirs that share a name.
EXCLUDES=(
	'/extensions'                                       # handled separately below
	'/workspaceStorage' 'User/workspaceStorage'         # per-workspace state, incl. chat sessions
	'User/History'                                      # local file edit history
	'/CachedExtensionVSIXs'                             # backup VSIXs
	'/logs'
	'/Cache' '/Code Cache' '/CachedData' '/component_crx_cache'
	'/GPUCache' '/ShaderCache' '/Dawn*Cache'
	'Partitions/vscode-browser/Cache' 'Partitions/vscode-browser/Code Cache'
	'Partitions/vscode-browser/GPUCache' 'Partitions/vscode-browser/Dawn*Cache'
	'/Backups' '/blob_storage' '/BrowserMetrics' '/Crashpad'
	'/Session Storage'
	'/Singleton*'
	'*.lock' '*.sock'
)

if [[ "$FULL" == "1" ]]; then
	echo "[launch.sh] full copy: $SOURCE_UDD -> $DEST_UDD" >&2
	rsync -a "$SOURCE_UDD/" "$DEST_UDD/"
else
	echo "[launch.sh] slim copy: $SOURCE_UDD -> $DEST_UDD" >&2
	RSYNC_ARGS=(-a)
	for e in "${EXCLUDES[@]}"; do RSYNC_ARGS+=(--exclude="$e"); done
	rsync "${RSYNC_ARGS[@]}" "$SOURCE_UDD/" "$DEST_UDD/"
fi

# Extensions:
#   --full              -> already copied above
#   --clone-extensions  -> copy into the new profile (~10s)
#   default             -> fresh empty dir
EXT_DIR="$DEST_UDD/extensions"
mkdir -p "$EXT_DIR"
if [[ "$FULL" != "1" && "$CLONE_EXTENSIONS" == "1" ]]; then
	echo "[launch.sh] copying extensions: $SOURCE_UDD/extensions -> $EXT_DIR" >&2
	rsync -a "$SOURCE_UDD/extensions/" "$EXT_DIR/"
fi

# Normalize the settings that automation depends on. Both overlays are
# per-launch and always applied, because every instance launched under this
# skill is a throwaway used for automation.
#
#   files.simpleDialog.enable  Forces the simple (quick-input) file dialog so
#     automation can drive "Open Folder" / workspace pickers. The native OS
#     file dialog cannot be controlled by @playwright/cli over CDP (and is
#     completely unreachable over SSH on headless macOS).
#
#   editor.editContext  Forces the EditContext input mode. test/automation's
#     page objects choose between `.native-edit-context` and `textarea` from
#     `Code.editContextEnabled`, which is derived from quality/version and is
#     unconditionally true for a dev build. If the cloned profile disabled
#     this setting, Monaco renders a `textarea`, the page objects still wait
#     for `.native-edit-context`, and every text-input helper (Chat,
#     Extensions, Editors, AgentsWindow, ...) times out.
mkdir -p "$DEST_UDD/User"

# Discovery lives in the shared script, so both launchers normalize exactly the
# same set of files: the default profile plus every named profile that has its
# own settings.json. That matters because the clone preserves workspace/profile
# associations, and an associated workspace opens with its named profile.
if ! SETTINGS_COUNT=$(node "$NORMALIZE_SETTINGS" --user-data-dir "$DEST_UDD"); then
	echo "[launch.sh] failed to normalize automation settings under $DEST_UDD — automation may need to fall back to per-key input" >&2
	exit 1
fi
echo "[launch.sh] ensured files.simpleDialog.enable=true and editor.editContext=true in $SETTINGS_COUNT profile settings file(s)" >&2
PROFILE_READY_MS=$(monotonic_ms)

# Strip ELECTRON_RUN_AS_NODE, commonly inherited from VS Code's integrated
# terminal / agent runtimes; it breaks ./scripts/code.sh.
unset ELECTRON_RUN_AS_NODE

CODE_SH="$REPO/scripts/code.sh"
if [[ ! -x "$CODE_SH" ]]; then
	echo "Could not find an executable Code OSS launcher at $CODE_SH. Pass --repo <vscode-repo-root>." >&2
	exit 2
fi

ARGS=(
	"--user-data-dir=$DEST_UDD"
	"--extensions-dir=$EXT_DIR"
	"--shared-data-dir=$SHARED_DATA_DIR"
	"--remote-debugging-port=$CDP_PORT"
	"--inspect-extensions=$EXTHOST_PORT"
	"--inspect=$MAIN_PORT"
	"--inspect-agenthost=$AGENTHOST_PORT"
	"--enable-smoke-test-driver"
)
if [[ "$DISABLE_WORKSPACE_TRUST" == "1" ]]; then
	ARGS+=("--disable-workspace-trust")
fi
if [[ "$AGENTS" == "1" ]]; then
	ARGS=("--agents" "${ARGS[@]}")
fi
if (( ${#EXTRA_ARGS[@]} )); then
	ARGS+=("${EXTRA_ARGS[@]}")
fi
# --new-window: without an explicit path VS Code otherwise restores the previous
# workspace from cloned application state. That workspace can override the simple
# dialog setting, so force an empty window instead.
#
# --sync=off: the cloned profile keeps application storage, which is where
# settings-sync enablement lives, so a source profile with sync on would treat
# this run's automation-only overrides as local edits and upload them to the
# user's real synced settings. Forcing it off keeps the profile throwaway.
#
# Appended *after* EXTRA_ARGS deliberately: for string options VS Code keeps the
# last occurrence, so a forwarded `-- --sync=on` would otherwise win.
ARGS+=("--new-window" "--sync=off")

LOG_FILE="$RUN_DIR/code.log"
echo "[launch.sh] launching: $CODE_SH ${ARGS[*]}" >&2
echo "[launch.sh] logs: $LOG_FILE" >&2

# Run pre-launch (electron download, compile-if-missing, built-in extensions) and
# compile the automation page objects in the foreground so any errors surface
# synchronously. Then skip code.sh's own pre-launch.
if [[ "$SKIP_PRELAUNCH" == "1" ]]; then
	echo "[launch.sh] skipping pre-launch by request" >&2
else
	echo "[launch.sh] running pre-launch (ensures electron + compiled output + built-ins + automation)..." >&2
	if ! (
		cd "$REPO" &&
		node build/lib/preLaunch.ts &&
		cd test/automation &&
		node tools/copy-driver-definition.js &&
		node ../../node_modules/typescript/bin/tsc6
	) >>"$LOG_FILE" 2>&1; then
		echo "[launch.sh] pre-launch FAILED. Log tail:" >&2
		tail -n 80 "$LOG_FILE" >&2
		exit 1
	fi
fi
if [[ ! -f "$REPO/out/main.js" ]]; then
	echo "[launch.sh] compiled client entry point is missing: $REPO/out/main.js" >&2
	echo "[launch.sh] run 'npm run compile' successfully before launching." >&2
	exit 1
fi
PRELAUNCH_READY_MS=$(monotonic_ms)

# Launch code.sh in the background. Detaching with `nohup ... & disown` is
# sufficient: by the time we return below, CDP is up and Electron is fully
# forked into its own process tree, so it's robust to its launching shell
# going away. (Earlier failures came from returning while Electron was still
# mid-bootstrap, not from process-group concerns.)
nohup env VSCODE_SKIP_PRELAUNCH=1 "$CODE_SH" "${ARGS[@]}" \
	</dev/null >>"$LOG_FILE" 2>&1 &
PID=$!
disown $PID 2>/dev/null || true

# Block until the renderer's CDP endpoint is responding so the caller can attach
# immediately. If code.sh dies or we time out, dump the log so the failure is
# visible.
echo "[launch.sh] waiting for CDP on port $CDP_PORT (timeout 90s)..." >&2
WAIT_FOR_CDP="$(cd "$(dirname "$0")" && pwd)/waitForCdp.ts"
if READY_MS=$(node "$WAIT_FOR_CDP" "$PID" "$CDP_PORT"); then
	echo "[launch.sh] CDP ready after ${READY_MS}ms" >&2
else
	READY_STATUS=$?
	case "$READY_STATUS" in
		1) echo "[launch.sh] timed out waiting for CDP on port $CDP_PORT. Log tail:" >&2 ;;
		2) echo "[launch.sh] code.sh (PID $PID) exited before CDP came up. Log tail:" >&2 ;;
		*) echo "[launch.sh] failed while waiting for CDP on port $CDP_PORT. Log tail:" >&2 ;;
	esac
	tail -n 80 "$LOG_FILE" >&2
	exit 1
fi
CDP_READY_AT_MS=$(monotonic_ms)

AUTOMATION_DRIVER="$(cd "$(dirname "$0")" && pwd)/automationDriver.ts"
AUTOMATION_TOKEN_FILE="$RUN_DIR/automation-token"
AUTOMATION_LOG_FILE="$RUN_DIR/automation-driver.log"
AUTOMATION_LOGS_PATH="$RUN_DIR/automation-logs"
mkdir -p "$AUTOMATION_LOGS_PATH"
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' >"$AUTOMATION_TOKEN_FILE"
chmod 600 "$AUTOMATION_TOKEN_FILE"
AUTOMATION_WINDOW=workbench
if [[ "$AGENTS" == "1" ]]; then
	AUTOMATION_WINDOW=agents
fi

echo "[launch.sh] starting persistent automation driver on port $AUTOMATION_PORT..." >&2
nohup node "$AUTOMATION_DRIVER" serve \
	--cdp-port "$CDP_PORT" \
	--port "$AUTOMATION_PORT" \
	--token-file "$AUTOMATION_TOKEN_FILE" \
	--repo "$REPO" \
	--window "$AUTOMATION_WINDOW" \
	--logs-path "$AUTOMATION_LOGS_PATH" \
	</dev/null >>"$AUTOMATION_LOG_FILE" 2>&1 &
AUTOMATION_PID=$!
disown $AUTOMATION_PID 2>/dev/null || true

WAIT_FOR_HTTP="$(cd "$(dirname "$0")" && pwd)/waitForHttp.ts"
if AUTOMATION_READY_MS=$(node "$WAIT_FOR_HTTP" "$AUTOMATION_PID" "$AUTOMATION_PORT" /health 30000); then
	echo "[launch.sh] automation driver ready after ${AUTOMATION_READY_MS}ms" >&2
else
	AUTOMATION_READY_STATUS=$?
	case "$AUTOMATION_READY_STATUS" in
		1) echo "[launch.sh] timed out waiting for automation driver. Log tail:" >&2 ;;
		2) echo "[launch.sh] automation driver exited before becoming ready. Log tail:" >&2 ;;
		*) echo "[launch.sh] failed while waiting for automation driver. Log tail:" >&2 ;;
	esac
	tail -n 80 "$AUTOMATION_LOG_FILE" >&2
	stop_run_processes "$RUN_DIR" "$AUTOMATION_PID" "$PID"
	exit 1
fi

node -e '
	const finishedAt = Number(process.hrtime.bigint() / 1_000_000n);
	const cdpReadyAt = Number(process.argv[10]);
	const startedAt = Number(process.argv[11]);
	const profileReadyAt = Number(process.argv[12]);
	const preLaunchReadyAt = Number(process.argv[13]);
	console.log(JSON.stringify({
		pid: '"$PID"',
		cdpPort: '"$CDP_PORT"',
		extHostPort: '"$EXTHOST_PORT"',
		mainPort: '"$MAIN_PORT"',
		agentHostPort: '"$AGENTHOST_PORT"',
		automation: {
			pid: '"$AUTOMATION_PID"',
			port: '"$AUTOMATION_PORT"',
			tokenFile: process.argv[7],
			logFile: process.argv[8],
			script: process.argv[9],
		},
		userDataDir: process.argv[1],
		extensionsDir: process.argv[2],
		sharedDataDir: process.argv[3],
		runDir: process.argv[4],
		logFile: process.argv[5],
		repo: process.argv[6],
		agents: '"$AGENTS"' === 1,
		timings: {
			profileMs: profileReadyAt - startedAt,
			preLaunchMs: preLaunchReadyAt - profileReadyAt,
			cdpReadyMs: cdpReadyAt - preLaunchReadyAt,
			automationReadyMs: finishedAt - cdpReadyAt,
			totalMs: finishedAt - startedAt,
		},
	}));
' "$DEST_UDD" "$EXT_DIR" "$SHARED_DATA_DIR" "$RUN_DIR" "$LOG_FILE" "$REPO" "$AUTOMATION_TOKEN_FILE" "$AUTOMATION_LOG_FILE" "$AUTOMATION_DRIVER" "$CDP_READY_AT_MS" "$LAUNCH_START_MS" "$PROFILE_READY_MS" "$PRELAUNCH_READY_MS"
