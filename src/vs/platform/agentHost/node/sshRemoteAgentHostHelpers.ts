/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { vArray, vObj, vString, vUnknown } from '../../../base/common/validation.js';
import { TelemetryConfiguration } from '../../telemetry/common/telemetry.js';
import { getAgentHostEndpointIdentityKey, IAgentHostEndpointMetadata, parseAgentHostEndpointRegistry } from '../common/agentHostEndpointRegistry.js';

/**
 * Validate that a quality string is safe for bare interpolation in shell commands.
 * Quality comes from `productService.quality` (not user input) but we validate
 * as defense-in-depth since these values end up in unquoted shell paths (the `~`
 * prefix requires shell expansion, so we cannot single-quote the entire path).
 */
export function validateShellToken(value: string, label: string): string {
	if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
		throw new Error(`Unsafe ${label} value for shell interpolation: ${JSON.stringify(value)}`);
	}
	return value;
}

export function validateAgentHostTelemetryLevel(value: unknown): TelemetryConfiguration {
	switch (value) {
		case TelemetryConfiguration.OFF:
		case TelemetryConfiguration.CRASH:
		case TelemetryConfiguration.ERROR:
		case TelemetryConfiguration.ON:
			return value;
		default:
			throw new Error(`Unsafe telemetry level for shell interpolation: ${JSON.stringify(value)}`);
	}
}

/**
 * Validate and normalize a commit SHA. Returns the lowercase form.
 *
 * The commit-keyed install layout, the cleanup glob (`[0-9a-f]{40}`), and
 * the fallback discovery glob all assume an exactly-40-char lowercase hex
 * commit. If a caller ever supplies a non-SHA value (or uppercase hex),
 * the cleanup pass would silently miss those binaries and the
 * commit-pinned download URL could 404. Enforce the shape at the source.
 *
 * `productService.commit` is already lowercase hex in practice; the
 * normalization is defense-in-depth for any future callers.
 */
export function validateCommit(commit: string): string {
	const normalized = commit.toLowerCase();
	if (!/^[0-9a-f]{40}$/.test(normalized)) {
		throw new Error(`Unsafe commit value (expected 40-char hex SHA): ${JSON.stringify(commit)}`);
	}
	return normalized;
}

/**
 * Name of the CLI binary as it appears inside the downloaded archive,
 * derived from product quality. Matches the names used by Remote-SSH's
 * exec-server installer so that CLI binaries can be shared between the
 * two features.
 */
export function getRemoteCLIArchiveName(quality: string): string {
	const q = validateShellToken(quality, 'quality');
	switch (q) {
		case 'stable': return 'code';
		case 'exploration': return 'code-exploration';
		default: return 'code-insiders';
	}
}

/**
 * Install root for the VS Code CLI on the remote machine. Shared with
 * Remote-SSH's exec-server installer so the two features can reuse each
 * other's installations. Also the parent of the agent host lockfile dir.
 */
export function getRemoteCLIInstallRoot(serverDataFolderName: string): string {
	const d = validateShellToken(serverDataFolderName, 'server data folder name');
	return `~/${d}`;
}

/**
 * Per-machine launcher data dir for `code agent host` (and the embedded
 * CLI machinery it inherits). Passed as `--cli-data-dir` so the CLI's
 * downloads cache, unpacked server installs, supervisor logs, and other
 * launcher state land under the same root Remote-SSH's `command-shell`
 * uses (e.g. `~/.vscode-server/cli`). Without this flag the CLI would
 * default to `~/.vscode-cli{,-<quality>}/` and split state across two
 * roots.
 *
 * The lockfile is unaffected: the Rust CLI anchors it on
 * `serverDataFolderName` regardless of `--cli-data-dir` (see
 * `cli/src/state.rs::agent_host_root`).
 */
export function getRemoteCLIDataDir(serverDataFolderName: string): string {
	return `${getRemoteCLIInstallRoot(serverDataFolderName)}/cli`;
}

/**
 * Full path to the installed CLI binary on the remote.
 *
 * When `commit` is provided, the path is keyed on commit (e.g.
 * `~/.vscode-server/code-insiders-<40hex>`) so we can install the CLI
 * matching the current desktop without disturbing other installs. This
 * mirrors Remote-SSH's exec-server layout.
 *
 * When `commit` is undefined (dev/OSS builds with no commit in product
 * metadata), the path is just `<root>/<archive>` — a single, non-keyed
 * filename. Caller code should keep the loose `--version`-based reuse
 * check in that case.
 */
export function getRemoteCLIBin(serverDataFolderName: string, quality: string, commit?: string): string {
	const archive = getRemoteCLIArchiveName(quality);
	const root = getRemoteCLIInstallRoot(serverDataFolderName);
	if (commit) {
		const c = validateCommit(commit);
		return `${root}/${archive}-${c}`;
	}
	return `${root}/${archive}`;
}

/** Escape a string for use as a single shell argument (single-quote wrapping). */
export function shellEscape(s: string): string {
	// Wrap in single quotes; escape embedded single quotes as: '\''
	const escaped = s.replace(/'/g, '\'\\\'\'');
	return `'${escaped}'`;
}

/**
 * Construct the bare command that launches the agent host on the remote.
 *
 * `--cli-data-dir` is passed up-front so the embedded CLI's launcher
 * state (downloads cache, unpacked server installs, supervisor log) lands
 * under `<cliDataDir>` — the same root Remote-SSH uses. The supervisor
 * propagates this flag to its detached child (see
 * `cli/src/commands/agent_host.rs`), so the entire AH process tree
 * agrees on one launcher root.
 *
 * Inputs must already be safe for unquoted shell interpolation; callers
 * build them via {@link getRemoteCLIBin} / {@link getRemoteCLIDataDir}
 * which validate their components.
 */
export function buildAgentHostBaseCommand(cliBin: string, cliDataDir: string, telemetryLevel: TelemetryConfiguration): string {
	return `${cliBin} --cli-data-dir ${cliDataDir} --telemetry-level ${validateAgentHostTelemetryLevel(telemetryLevel)} agent host --port 0`;
}

export function resolveRemotePlatform(unameS: string, unameM: string, libc = ''): { os: string; arch: string } | undefined {
	const os = unameS.trim().toLowerCase();
	const machine = unameM.trim().toLowerCase();
	const normalizedLibc = libc.trim().toLowerCase();

	let platformOs: string;
	if (os === 'linux') {
		platformOs = normalizedLibc === 'musl' ? 'alpine' : 'linux';
	} else if (os === 'darwin') {
		platformOs = 'darwin';
	} else {
		return undefined;
	}

	let arch: string;
	if (machine === 'x86_64' || machine === 'amd64') {
		arch = 'x64';
	} else if (machine === 'aarch64' || machine === 'arm64') {
		arch = 'arm64';
	} else if (machine === 'armv7l') {
		arch = 'armhf';
	} else {
		return undefined;
	}

	if (platformOs === 'alpine' && arch === 'armhf') {
		return undefined;
	}

	return { os: platformOs, arch };
}

/**
 * URL of the CLI download artifact.
 *
 * When `commit` is provided, uses the commit-pinned URL form so we get
 * the exact CLI matching the current desktop build (mirrors Remote-SSH).
 * When `commit` is undefined (dev/OSS builds), falls back to `latest`.
 */
export function buildCLIDownloadUrl(os: string, arch: string, quality: string, commit?: string): string {
	const base = 'https://update.code.visualstudio.com';
	const artifact = `cli-${os}-${arch}`;
	if (commit) {
		// Defense-in-depth: same validation as getRemoteCLIBin so the URL
		// can never be formed with a non-SHA commit (would 404) and stays
		// consistent with the commit-keyed install path.
		const c = validateCommit(commit);
		return `${base}/commit:${c}/${artifact}/${quality}`;
	}
	return `${base}/latest/${artifact}/${quality}`;
}

/**
 * Shell snippet that prunes older commit-keyed CLI binaries from the
 * install root, keeping the 5 most recently modified. Mirrors the
 * retention policy in Remote-SSH's exec-server installer.
 *
 * The glob is tightened to exactly 40 hex chars (`[0-9a-f]`-only) so we
 * never accidentally delete (or hand to `xargs`) any filename that
 * happens to start with `<archive>-` but isn't actually one of our
 * commit-keyed binaries — both for correctness and to avoid passing
 * attacker-controlled filenames through `xargs rm` with option/whitespace
 * splitting hazards. We also use `rm -f --` and `xargs -I{}` (which
 * skips the command entirely on empty input on both GNU and BSD `xargs`).
 */
export function buildCleanupOldCLIsCommand(serverDataFolderName: string, quality: string): string {
	const root = getRemoteCLIInstallRoot(serverDataFolderName);
	const archive = getRemoteCLIArchiveName(quality);
	const commitGlob = '[0-9a-f]'.repeat(40);
	// `ls -1t` sorts by mtime newest-first on both Linux (coreutils) and
	// macOS (BSD). `awk 'NR>5'` drops the 5 most recent entries we want to
	// keep. `xargs -I{} rm -f -- {}` is one-rm-per-line — slow but safe
	// against whitespace splitting and option injection, and a no-op when
	// input is empty on both BSDs and GNU.
	return `ls -1t -- ${root}/${archive}-${commitGlob} 2>/dev/null | awk 'NR>5' | xargs -I{} rm -f -- {} 2>/dev/null; true`;
}

/**
 * Shell snippet that prints candidate CLI binary paths that could be
 * used as a fallback when the commit-pinned download fails. Order: any
 * commit-keyed binaries in the shared install root (newest mtime first),
 * then the legacy single-binary paths from the previous installer
 * (`~/.vscode-cli{,-<quality>}/<archive>`).
 *
 * Each line is a single path. The glob for commit-keyed candidates is
 * restricted to exactly 40 hex chars so the output can only contain
 * filenames we recognise (callers should still re-validate with
 * {@link isValidFallbackCLIPath}). The legacy paths are fixed strings
 * derived from validated tokens, so they cannot contain shell
 * metacharacters either.
 */
export function buildFindFallbackCLICommand(serverDataFolderName: string, quality: string): string {
	const root = getRemoteCLIInstallRoot(serverDataFolderName);
	const archive = getRemoteCLIArchiveName(quality);
	const commitGlob = '[0-9a-f]'.repeat(40);
	const q = validateShellToken(quality, 'quality');
	const legacyDir = q === 'stable' ? '~/.vscode-cli' : `~/.vscode-cli-${q}`;
	const legacyBin = `${legacyDir}/${archive}`;
	return [
		`ls -1t -- ${root}/${archive}-${commitGlob} 2>/dev/null`,
		`ls -1 -- ${legacyBin} 2>/dev/null`,
		'true',
	].join('; ');
}

/**
 * Validate that a candidate path string returned by the remote shell
 * matches one of the two shapes we expect from
 * {@link buildFindFallbackCLICommand}:
 *
 *  - `<installRoot>/<archive>-<40 hex chars>` — commit-keyed install
 *  - `<legacyDir>/<archive>` — legacy single-binary install
 *
 * Anything else is rejected. This guards against the candidate being
 * interpolated into a follow-up shell command (`<candidate> --version`,
 * agent host spawn) with attacker-controlled metacharacters in the
 * event that something unexpected ends up in the install root.
 */
export function isValidFallbackCLIPath(candidate: string, serverDataFolderName: string, quality: string): boolean {
	const root = getRemoteCLIInstallRoot(serverDataFolderName);
	const archive = getRemoteCLIArchiveName(quality);
	const q = validateShellToken(quality, 'quality');
	const legacyDir = q === 'stable' ? '~/.vscode-cli' : `~/.vscode-cli-${q}`;
	const legacyBin = `${legacyDir}/${archive}`;
	if (candidate === legacyBin) {
		return true;
	}
	const pinnedPrefix = `${root}/${archive}-`;
	if (candidate.startsWith(pinnedPrefix)) {
		const suffix = candidate.slice(pinnedPrefix.length);
		return /^[0-9a-f]{40}$/.test(suffix);
	}
	return false;
}

/** Redact connection tokens from log output. */
export function redactToken(text: string): string {
	return text.replace(/\?tkn=[^\s&]+/g, '?tkn=***');
}

/**
 * Match the `ws://127.0.0.1:PORT[?tkn=TOKEN]` URL emitted by `code agent host`
 * on stdout/stderr. Shared by SSH and WSL agent-host transports — both spawn
 * the CLI inside a posix shell and scrape its first line of output to discover
 * the WebSocket endpoint.
 */
const AGENT_HOST_WS_URL_RE = /ws:\/\/(?:127\.0\.0\.1|localhost):(\d+)(?:\?tkn=([^\s&]+))?/;

/**
 * Extract the `ws://` URL printed by `code agent host` from a line or buffer
 * of mixed output. Returns the full URL plus its parsed components, or
 * `undefined` if no match is found.
 */
export function extractAgentHostWebSocketURL(text: string): { url: string; host: string; port: number; token: string | undefined } | undefined {
	const match = text.match(AGENT_HOST_WS_URL_RE);
	if (!match) {
		return undefined;
	}
	return {
		url: match[0],
		host: '127.0.0.1',
		port: parseInt(match[1], 10),
		token: match[2] || undefined,
	};
}

/**
 * Abstraction over SSH command execution to enable testing without a real SSH connection.
 */
export interface ISshExec {
	(command: string, opts?: { ignoreExitCode?: boolean }): Promise<{ stdout: string; stderr: string; code: number }>;
}

/**
 * Map a recorded `host` value from the agent host lockfile to a dialable
 * loopback address. The supervisor records the literal `--host` value it
 * was given (e.g. `0.0.0.0`, `::1`, `localhost`); local callers (SSH
 * relay, tunnel reuse-forward, renderer bridge) want a target they can
 * actually open a socket to. Wildcards are mapped to their corresponding
 * loopback; specific hosts pass through unchanged. Missing `host`
 * (lockfile written by an older CLI) falls back to IPv4 loopback to
 * preserve the prior behaviour.
 */
export function dialAgentHostHost(bound: string | undefined): string {
	if (!bound || bound === '0.0.0.0' || bound === '::' || bound === '[::]') {
		return '127.0.0.1';
	}
	return bound;
}

/**
 * Build the `code agent endpoints` command that lists every live agent
 * host endpoint (editor + standalone) known to the shared registry on the
 * remote. When `userDataPath` is omitted the CLI resolves its own default
 * user-data path and reports it back in the envelope's `userDataPath`
 * field; once known, callers should pass it back explicitly so every
 * subsequent lookup/spawn/relay command targets the exact same registry.
 */
export function buildAgentEndpointsCommand(cliBin: string, cliDataDir: string, userDataPath?: string): string {
	const userDataArg = userDataPath ? ` --user-data-dir ${shellEscape(userDataPath)}` : '';
	return `${cliBin} --cli-data-dir ${cliDataDir} agent endpoints${userDataArg}`;
}

/**
 * Build the command that spawns a brand-new dedicated standalone agent
 * host on the remote, self-managed via `--idle-timeout`: once no client
 * has been connected for `idleTimeoutSec`, the process exits on its own,
 * so callers must NOT tie its lifetime to the SSH exec channel used to
 * launch it (see {@link waitForNewStandaloneEndpoint}).
 *
 * Always passes `--new-instance`: plain `agent host` reuses an existing
 * live standalone when one is already registered, which would silently
 * defeat the "Start New Dedicated Agent Host" choice (no new entry would
 * ever appear, and delta-matching in {@link waitForNewStandaloneEndpoint}
 * would time out) and could otherwise touch a standalone another
 * selection path is still relying on. `--new-instance` guarantees a
 * genuinely new process/registry entry every time this command runs,
 * leaving all existing standalone/editor entries untouched.
 */
export function buildAgentHostSpawnCommand(cliBin: string, cliDataDir: string, userDataPath: string, telemetryLevel: TelemetryConfiguration, idleTimeoutSec = 300): string {
	if (!Number.isSafeInteger(idleTimeoutSec) || idleTimeoutSec <= 0) {
		throw new Error(`Unsafe idle timeout value for shell interpolation: ${JSON.stringify(idleTimeoutSec)}`);
	}
	return `${buildAgentHostBaseCommand(cliBin, cliDataDir, telemetryLevel)} --new-instance --user-data-dir ${shellEscape(userDataPath)} --idle-timeout ${idleTimeoutSec}`;
}

/**
 * Build the command that performs a raw stdin/stdout byte relay to the
 * exact endpoint identified by `instanceId`, used to open a duplex channel
 * to a `socket`-addressed endpoint (see `AgentHostEndpointAddress`) that
 * `forwardOut` cannot reach directly.
 */
export function buildAgentRelayCommand(cliBin: string, cliDataDir: string, instanceId: string, userDataPath: string): string {
	return `${cliBin} --cli-data-dir ${cliDataDir} agent relay ${shellEscape(instanceId)} --user-data-dir ${shellEscape(userDataPath)}`;
}

/** Parsed, validated result of `code agent endpoints`. */
export interface IAgentEndpointsResult {
	/** The remote user-data path the registry was read from/for. */
	readonly userDataPath: string;
	/** Every live endpoint currently in the registry, already schema-validated. */
	readonly endpoints: readonly IAgentHostEndpointMetadata[];
}

const agentEndpointsEnvelopeValidator = vObj({
	userDataPath: vString(),
	endpoints: vArray(vUnknown()),
});

/**
 * Parse the JSON envelope printed by `code agent endpoints`
 * (`{ userDataPath, endpoints }`). Individual endpoint entries are
 * validated via the shared {@link parseAgentHostEndpointRegistry} parser
 * (malformed/unsupported-schema entries are dropped, not fatal). Returns
 * `undefined` if `stdout` is empty or the top-level envelope itself is
 * malformed.
 */
export function parseAgentEndpointsOutput(stdout: string): IAgentEndpointsResult | undefined {
	const trimmed = stdout.trim();
	if (!trimmed) {
		return undefined;
	}
	const candidates = [trimmed];
	const lastLine = trimmed.split('\n').at(-1)?.trim();
	if (lastLine && lastLine !== trimmed) {
		candidates.push(lastLine);
	}
	for (const candidate of candidates) {
		const result = parseAgentEndpointsDocument(candidate);
		if (result) {
			return result;
		}
	}
	return undefined;
}

function parseAgentEndpointsDocument(value: string): IAgentEndpointsResult | undefined {
	let raw: unknown;
	try {
		raw = JSON.parse(value);
	} catch {
		return undefined;
	}
	const { content, error } = agentEndpointsEnvelopeValidator.validate(raw);
	if (error) {
		return undefined;
	}
	return {
		userDataPath: content.userDataPath,
		endpoints: parseAgentHostEndpointRegistry(content.endpoints),
	};
}

/**
 * Execute `code agent endpoints` over `exec` and return the parsed
 * envelope. Throws if the command fails or its output cannot be parsed —
 * callers rely on endpoint discovery to make a correct selection decision,
 * so a silently empty/garbage result would be worse than a loud failure.
 */
export async function runAgentEndpoints(exec: ISshExec, cliBin: string, cliDataDir: string, userDataPath?: string): Promise<IAgentEndpointsResult> {
	const command = buildAgentEndpointsCommand(cliBin, cliDataDir, userDataPath);
	const { stdout, stderr, code } = await exec(command, { ignoreExitCode: true });
	if (code !== 0) {
		throw new Error(`'agent endpoints' failed (exit code ${code})${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
	}
	const result = parseAgentEndpointsOutput(stdout);
	if (!result) {
		throw new Error(`'agent endpoints' produced unparsable output (${stdout.length} characters)`);
	}
	return result;
}

/**
 * Filter `entries` down to the ones whose PID is still alive, probing each
 * distinct PID at most once with `kill -0`. The registry file itself may
 * lag reality slightly (e.g. a crashed writer's stale entry before its
 * cleanup ran), so liveness must always be re-checked before an entry is
 * offered for reuse.
 */
export async function filterLiveAgentHostEndpoints(exec: ISshExec, entries: readonly IAgentHostEndpointMetadata[]): Promise<IAgentHostEndpointMetadata[]> {
	const pids = [...new Set(entries.map(e => e.pid))];
	const alive = new Set<number>();
	await Promise.all(pids.map(async pid => {
		const { code } = await exec(`kill -0 ${pid} 2>/dev/null`, { ignoreExitCode: true });
		if (code === 0) {
			alive.add(pid);
		}
	}));
	return entries.filter(e => alive.has(e.pid));
}

/**
 * Diff two endpoint snapshots and return the standalone entry present in
 * `after` but not `before`, identified by `(type, pid, instanceId)`. Used
 * to match the endpoint published by a just-spawned agent host without
 * relying on any output scraped from the spawn command itself.
 */
export function findNewAgentHostEndpoint(before: readonly IAgentHostEndpointMetadata[], after: readonly IAgentHostEndpointMetadata[]): IAgentHostEndpointMetadata | undefined {
	const beforeKeys = new Set(before.map(getAgentHostEndpointIdentityKey));
	return after.find(entry => entry.type === 'standalone' && !beforeKeys.has(getAgentHostEndpointIdentityKey(entry)));
}

export interface IWaitForNewEndpointOptions {
	/**
	 * Overall deadline for endpoint registration in milliseconds. When omitted,
	 * the deadline is twenty initial polling intervals (10 seconds by default).
	 */
	readonly timeoutMs?: number;
	/** Initial delay between polls in milliseconds. Defaults to 500. */
	readonly intervalMs?: number;
	readonly token?: CancellationToken;
	/** Called periodically while endpoint registration is still pending. */
	readonly progress?: (elapsedMs: number) => void;
}

const DEFAULT_ENDPOINT_REGISTRATION_POLL_COUNT = 20;
const MAX_ENDPOINT_REGISTRATION_POLL_INTERVAL_MS = 5_000;
const ENDPOINT_REGISTRATION_PROGRESS_INTERVAL_MS = 10_000;
const COLD_AGENT_HOST_REGISTRATION_TIMEOUT_MS = 300_000;

/** Gets the endpoint-registration deadline for a newly installed CLI. */
export function getNewAgentHostRegistrationTimeoutMs(installedCLI: boolean): number | undefined {
	return installedCLI ? COLD_AGENT_HOST_REGISTRATION_TIMEOUT_MS : undefined;
}

/**
 * Poll `code agent endpoints` until a newly spawned standalone entry shows
 * up (see {@link findNewAgentHostEndpoint}), or throw once the deadline
 * expires. The spawn command itself is fire-and-forget (its
 * process is not tied to the SSH exec channel that launched it — see
 * {@link buildAgentHostSpawnCommand}), so this is the only way to learn
 * the freshly assigned TCP address/token/instanceId.
 */
export async function waitForNewStandaloneEndpoint(
	exec: ISshExec,
	cliBin: string,
	cliDataDir: string,
	userDataPath: string,
	before: readonly IAgentHostEndpointMetadata[],
	options?: IWaitForNewEndpointOptions,
): Promise<IAgentHostEndpointMetadata> {
	const initialIntervalMs = options?.intervalMs ?? 500;
	const timeoutMs = options?.timeoutMs ?? DEFAULT_ENDPOINT_REGISTRATION_POLL_COUNT * initialIntervalMs;
	const startTime = Date.now();
	const deadline = startTime + timeoutMs;
	let polls = 0;
	let nextProgressReport = ENDPOINT_REGISTRATION_PROGRESS_INTERVAL_MS;

	while (true) {
		if (options?.token?.isCancellationRequested) {
			throw new CancellationError();
		}
		const { endpoints } = await runAgentEndpoints(exec, cliBin, cliDataDir, userDataPath);
		const found = findNewAgentHostEndpoint(before, endpoints);
		if (found) {
			return found;
		}

		polls++;
		const elapsedMs = Date.now() - startTime;
		if (elapsedMs >= nextProgressReport) {
			options?.progress?.(elapsedMs);
			nextProgressReport = (Math.floor(elapsedMs / ENDPOINT_REGISTRATION_PROGRESS_INTERVAL_MS) + 1) * ENDPOINT_REGISTRATION_PROGRESS_INTERVAL_MS;
		}
		if (Date.now() >= deadline) {
			throw new Error(`Timed out waiting for the newly spawned agent host to register itself after ${Date.now() - startTime}ms (deadline ${timeoutMs}ms)`);
		}

		const intervalMs = Math.min(
			initialIntervalMs * 2 ** Math.floor((polls - 1) / 10),
			MAX_ENDPOINT_REGISTRATION_POLL_INTERVAL_MS,
			deadline - Date.now(),
		);
		if (options?.token) {
			await timeout(intervalMs, options.token);
		} else {
			await timeout(intervalMs);
		}
	}
}
