#!/usr/bin/env bash
# Launch Code OSS (VS Code from sources) with:
#   - a fresh, slimmed copy of the authenticated user-data-dir (so Copilot/GitHub auth works)
#   - an isolated --shared-data-dir (otherwise two instances share ~/.vscode-oss-shared and crash each other)
#   - unique debug ports for renderer (CDP), extension host, main process, and agent host
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
#             [--clone-extensions] [--full] [-- <extra code.sh args>]
#
# Flags:
#   --clone-extensions  Copy the source extensions/ into the new profile (~10s).
#                       Default: start with an EMPTY extensions/ dir - fastest
#                       and conflict-free, but no third-party extensions.
#   --full              Copy the entire profile (incl. extensions). Use if the
#                       slim copy is missing something you need.
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

while [[ $# -gt 0 ]]; do
	case "$1" in
		--agents) AGENTS=1; shift ;;
		--source-user-data-dir) SOURCE_UDD="$2"; shift 2 ;;
		--repo) REPO="$2"; shift 2 ;;
		--clone-extensions|--copy-extensions) CLONE_EXTENSIONS=1; shift ;;
		--full) FULL=1; shift ;;
		--) shift; EXTRA_ARGS=("$@"); break ;;
		*) echo "Unknown arg: $1" >&2; exit 2 ;;
	esac
done

if [[ -z "$REPO" ]]; then
	if [[ -x "$PWD/scripts/code.sh" ]]; then
		REPO="$PWD"
	else
		echo "Could not find a vscode checkout in $PWD. Pass --repo <path>." >&2
		exit 2
	fi
fi

if [[ ! -d "$SOURCE_UDD" ]]; then
	echo "Source user-data-dir does not exist: $SOURCE_UDD" >&2
	echo "Pass --source-user-data-dir <path> or set CODE_OSS_DEV_AUTHED_USER_DATA_DIR." >&2
	exit 2
fi

pick_port() {
	node -e '
		const net = require("net");
		const s = net.createServer();
		s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => console.log(p)); });
	'
}

CDP_PORT=$(pick_port)
EXTHOST_PORT=$(pick_port)
MAIN_PORT=$(pick_port)
AGENTHOST_PORT=$(pick_port)

STAMP=$(date +%Y%m%d-%H%M%S)-$$
RUN_DIR="${TMPDIR:-/tmp}/code-oss-dev/$STAMP"
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

# Force the simple (quick-input) file dialog so automation can drive
# "Open Folder" / workspace pickers. The native OS file dialog cannot be
# controlled by @playwright/cli over CDP (and is completely unreachable
# over SSH on headless macOS). The setting overlay is per-launch and
# always applied because every launched instance under this skill is
# a throwaway used for automation.
SETTINGS_FILE="$DEST_UDD/User/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"
# Data-preserving text-based merge: insert/update `files.simpleDialog.enable`
# without reparsing the whole file. Avoids dropping user comments and
# string values containing `//` (e.g. URLs). Fails loudly if the file
# exists but has no recognizable JSON object shape — never silently
# overwrites with `{}`.
if ! node - "$SETTINGS_FILE" <<'NODE'
const fs = require('fs');
const f = process.argv[2];
const KEY = 'files.simpleDialog.enable';

let text;
try { text = fs.readFileSync(f, 'utf8'); }
catch (e) {
	if (e.code === 'ENOENT') text = '';
	else { console.error('[launch.sh] cannot read ' + f + ': ' + e.message); process.exit(1); }
}

// Empty file → write a fresh object.
if (text.trim() === '') {
	fs.writeFileSync(f, '{\n  "' + KEY + '": true\n}\n');
	process.exit(0);
}

// Key already present (with any value) → update its value to `true`
// via a targeted regex on the value slot only.
const keyValueRe = new RegExp('("' + KEY.replace(/\./g, '\\.') + '"\\s*:\\s*)(true|false|null|"[^"\\n]*"|-?\\d+(?:\\.\\d+)?)', 'g');
if (keyValueRe.test(text)) {
	const updated = text.replace(keyValueRe, '$1true');
	fs.writeFileSync(f, updated);
	process.exit(0);
}

// Otherwise: find the LAST `}` and insert the new key before it.
// We deliberately don't parse JSONC — this preserves comments and
// any other content the source profile had.
const lastBrace = text.lastIndexOf('}');
if (lastBrace === -1) {
	console.error('[launch.sh] settings.json has no closing brace — refusing to clobber it: ' + f);
	process.exit(1);
}

// Decide whether to add a leading comma. If the only thing between the
// first `{` and the last `}` is whitespace and comments, the object is
// empty for our purposes and no comma is needed.
const firstBrace = text.indexOf('{');
if (firstBrace === -1 || firstBrace >= lastBrace) {
	console.error('[launch.sh] settings.json has no opening brace — refusing to clobber it: ' + f);
	process.exit(1);
}
const between = text.slice(firstBrace + 1, lastBrace)
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/\/\/[^\n]*/g, '')
	.trim();
const insertion = between.length === 0
	? '\n  "' + KEY + '": true\n'
	: ',\n  "' + KEY + '": true\n';

fs.writeFileSync(f, text.slice(0, lastBrace) + insertion + text.slice(lastBrace));
NODE
then
	echo "[launch.sh] failed to ensure files.simpleDialog.enable=true in $SETTINGS_FILE — automation may need to fall back to per-key input" >&2
	exit 1
fi
echo "[launch.sh] ensured files.simpleDialog.enable=true in $SETTINGS_FILE" >&2

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
)
if [[ "$AGENTS" == "1" ]]; then
	ARGS=("--agents" "${ARGS[@]}")
fi
if (( ${#EXTRA_ARGS[@]} )); then
	ARGS+=("${EXTRA_ARGS[@]}")
fi

LOG_FILE="$RUN_DIR/code.log"
echo "[launch.sh] launching: $CODE_SH ${ARGS[*]}" >&2
echo "[launch.sh] logs: $LOG_FILE" >&2

# Run pre-launch (electron download, compile-if-missing, built-in extensions) in the
# foreground so any errors surface synchronously. Then skip code.sh's own pre-launch.
echo "[launch.sh] running pre-launch (ensures electron + compiled output + built-ins)..." >&2
if ! ( cd "$REPO" && node build/lib/preLaunch.ts ) >>"$LOG_FILE" 2>&1; then
	echo "[launch.sh] pre-launch FAILED. Log tail:" >&2
	tail -n 80 "$LOG_FILE" >&2
	exit 1
fi

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
READY=0
for i in $(seq 1 90); do
	if ! kill -0 "$PID" 2>/dev/null; then
		echo "[launch.sh] code.sh (PID $PID) exited before CDP came up. Log tail:" >&2
		tail -n 80 "$LOG_FILE" >&2
		exit 1
	fi
	if curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$CDP_PORT/json/version" 2>/dev/null; then
		READY=1
		echo "[launch.sh] CDP ready after ${i}s" >&2
		break
	fi
	sleep 1
done
if [[ "$READY" != "1" ]]; then
	echo "[launch.sh] timed out waiting for CDP on port $CDP_PORT. Log tail:" >&2
	tail -n 80 "$LOG_FILE" >&2
	exit 1
fi

node -e '
	console.log(JSON.stringify({
		pid: '"$PID"',
		cdpPort: '"$CDP_PORT"',
		extHostPort: '"$EXTHOST_PORT"',
		mainPort: '"$MAIN_PORT"',
		agentHostPort: '"$AGENTHOST_PORT"',
		userDataDir: process.argv[1],
		extensionsDir: process.argv[2],
		sharedDataDir: process.argv[3],
		runDir: process.argv[4],
		logFile: process.argv[5],
		repo: process.argv[6],
		agents: '"$AGENTS"' === 1,
	}));
' "$DEST_UDD" "$EXT_DIR" "$SHARED_DATA_DIR" "$RUN_DIR" "$LOG_FILE" "$REPO"