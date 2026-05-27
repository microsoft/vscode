/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { createRemoteAgentHostState, parseRemoteAgentHostState } from '../common/remoteAgentHostMetadata.js';

const LOG_PREFIX = '[SSHRemoteAgentHost]';

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
		const c = validateShellToken(commit, 'commit');
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

export function resolveRemotePlatform(unameS: string, unameM: string): { os: string; arch: string } | undefined {
	const os = unameS.trim().toLowerCase();
	const machine = unameM.trim().toLowerCase();

	let platformOs: string;
	if (os === 'linux') {
		platformOs = 'linux';
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
		// Note: commit safety is enforced by the caller / by getRemoteCLIBin
		// which runs the same validation. Repeat it here as defense-in-depth
		// because the URL is built independently in some call paths.
		const c = validateShellToken(commit, 'commit');
		return `${base}/commit:${c}/${artifact}/${quality}`;
	}
	return `${base}/latest/${artifact}/${quality}`;
}

/**
 * Shell snippet that prunes older commit-keyed CLI binaries from the
 * install root, keeping the 5 most recently modified. Mirrors the
 * retention policy in Remote-SSH's exec-server installer. The pattern
 * matches `<archive>-<exactly-40-chars>` for all known archive names so
 * that the non-commit-keyed dev fallback binary is never deleted.
 */
export function buildCleanupOldCLIsCommand(serverDataFolderName: string, quality: string): string {
	const root = getRemoteCLIInstallRoot(serverDataFolderName);
	const archive = getRemoteCLIArchiveName(quality);
	// 40 `?` chars match any 40-character commit suffix. Using `?` rather than
	// a literal `[0-9a-f]` × 40 keeps the glob short; commit names produced by
	// our build are always 40 hex chars, so the pattern is precise enough.
	const commitGlob = '?'.repeat(40);
	// `ls -1t` sorts by mtime newest-first across both Linux (coreutils) and
	// macOS (BSD). `awk 'NR>5'` drops the 5 most recent entries we want to
	// keep. `xargs rm -f` ignores missing files; the leading `2>/dev/null`
	// suppresses "No such file" complaints when the directory is empty.
	return `ls -1t ${root}/${archive}-${commitGlob} 2>/dev/null | awk 'NR>5' | xargs rm -f 2>/dev/null; true`;
}

/**
 * Shell snippet that prints candidate CLI binary paths that could be
 * used as a fallback when the commit-pinned download fails. Order: any
 * commit-keyed binaries in the shared install root (newest mtime first),
 * then the legacy single-binary paths from the previous installer
 * (`~/.vscode-cli{,-<quality>}/<archive>`).
 *
 * Each line is a single path. Callers should `--version`-test each
 * candidate in order and pick the first one that succeeds. The list may
 * be empty.
 */
export function buildFindFallbackCLICommand(serverDataFolderName: string, quality: string): string {
	const root = getRemoteCLIInstallRoot(serverDataFolderName);
	const archive = getRemoteCLIArchiveName(quality);
	const commitGlob = '?'.repeat(40);
	const q = validateShellToken(quality, 'quality');
	const legacyDir = q === 'stable' ? '~/.vscode-cli' : `~/.vscode-cli-${q}`;
	const legacyBin = `${legacyDir}/${archive}`;
	// Print candidates one per line. Both `ls` invocations are tolerant of
	// missing files / empty matches. The trailing `true` ensures the
	// pipeline overall succeeds.
	return [
		`ls -1t ${root}/${archive}-${commitGlob} 2>/dev/null`,
		`ls -1 ${legacyBin} 2>/dev/null`,
		'true',
	].join('; ');
}

/** Redact connection tokens from log output. */
export function redactToken(text: string): string {
	return text.replace(/\?tkn=[^\s&]+/g, '?tkn=***');
}

/**
 * Path to the per-quality agent host lockfile written by `code agent host`.
 *
 * Mirrors the Rust CLI's launcher path layout (see
 * `cli/src/state.rs::agent_host_root`). The Rust CLI anchors the agent host
 * lockfile on `serverDataFolderName` (exposed to the CLI build as
 * `VSCODE_CLI_SERVER_DATA_FOLDER_NAME`, derived from
 * `IProductConfiguration.serverDataFolderName`) so a `code agent host`
 * started locally and the supervisor spawned by the SSH `command-shell`
 * path agree on the same lockfile regardless of `--cli-data-dir`.
 */
export function getAgentHostLockfile(serverDataFolderName: string, quality: string): string {
	const d = validateShellToken(serverDataFolderName, 'server data folder name');
	const q = validateShellToken(quality, 'quality');
	return `~/${d}/cli/agent-host-${q}.lock`;
}

/**
 * Abstraction over SSH command execution to enable testing without a real SSH connection.
 */
export interface ISshExec {
	(command: string, opts?: { ignoreExitCode?: boolean }): Promise<{ stdout: string; stderr: string; code: number }>;
}

export type FindRunningAgentHostResult =
	| { readonly kind: 'notFound' }
	| { readonly kind: 'compatible'; readonly host: string; readonly port: number; readonly connectionToken: string | undefined };

/**
 * Try to find a running agent host on the remote by reading the lockfile and
 * verifying the recorded PID is still alive.
 */
export async function findRunningAgentHost(
	exec: ISshExec,
	logService: ILogService,
	serverDataFolderName: string,
	quality: string,
): Promise<FindRunningAgentHostResult> {
	const stateFile = getAgentHostLockfile(serverDataFolderName, quality);
	const { stdout, code } = await exec(`cat ${stateFile} 2>/dev/null`, { ignoreExitCode: true });
	if (code !== 0 || !stdout.trim()) {
		return { kind: 'notFound' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout.trim());
	} catch {
		// fall through
	}
	const state = parseRemoteAgentHostState(parsed);
	if (!state) {
		logService.info(`${LOG_PREFIX} Invalid agent host state file ${stateFile}, removing`);
		await exec(`rm -f ${stateFile}`, { ignoreExitCode: true });
		return { kind: 'notFound' };
	}

	// Verify the PID is still alive
	const { code: killCode } = await exec(`kill -0 ${state.pid} 2>/dev/null`, { ignoreExitCode: true });
	if (killCode !== 0) {
		logService.info(`${LOG_PREFIX} Stale agent host state in ${stateFile} (PID ${state.pid} not running), cleaning up`);
		await exec(`rm -f ${stateFile}`, { ignoreExitCode: true });
		return { kind: 'notFound' };
	}

	// We deliberately do not gate on `protocolVersion` here: the remote
	// agent host server is downloaded on demand and may speak a newer
	// protocol than this desktop was built with. The renderer↔AH
	// handshake will surface a real incompatibility; for the SSH-side
	// reuse decision we treat any live process as a candidate, and the
	// caller (sshRemoteAgentHostService) already falls back to spawning
	// fresh if the relay fails to connect.
	logService.info(`${LOG_PREFIX} Found running agent host via ${stateFile}: PID ${state.pid}, port ${state.port}`);
	return {
		kind: 'compatible',
		host: dialAgentHostHost(state.host),
		port: state.port,
		connectionToken: state.connectionToken ?? undefined,
	};
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
 * After starting an agent host, record its PID/port/token in the lockfile on
 * the remote so that future connections can reuse the process.
 */
export async function writeAgentHostState(
	exec: ISshExec,
	logService: ILogService,
	serverDataFolderName: string,
	quality: string,
	pid: number | undefined,
	port: number,
	connectionToken: string | undefined,
): Promise<void> {
	if (!pid) {
		logService.info(`${LOG_PREFIX} Agent host PID unknown, state file not written`);
		return;
	}

	const stateFile = getAgentHostLockfile(serverDataFolderName, quality);
	const state = createRemoteAgentHostState({ pid, port, connectionToken, quality });
	const json = JSON.stringify(state);
	// Remove any existing file first so `>` creates a fresh inode with the
	// new umask (overwriting an existing file preserves its old permissions).
	// Use a subshell with restrictive umask (077) so the file is created with
	// owner-only permissions (0600), protecting the connection token.
	// The CLI itself stores its token file with the same permissions.
	const result = await exec(`mkdir -p $(dirname ${stateFile}) && rm -f ${stateFile} && (umask 077 && printf %s ${shellEscape(json)} > ${stateFile})`, { ignoreExitCode: true });
	if (result.code !== 0) {
		logService.warn(`${LOG_PREFIX} Failed to write agent host state to ${stateFile} (exit code ${result.code})${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
		return;
	}
	logService.info(`${LOG_PREFIX} Wrote agent host state to ${stateFile}: PID ${pid}, port ${port}`);
}

/**
 * Kill a remote agent host tracked by our lockfile and remove the lockfile.
 */
export async function cleanupRemoteAgentHost(
	exec: ISshExec,
	logService: ILogService,
	serverDataFolderName: string,
	quality: string,
): Promise<void> {
	const stateFile = getAgentHostLockfile(serverDataFolderName, quality);
	const { stdout, code } = await exec(`cat ${stateFile} 2>/dev/null`, { ignoreExitCode: true });
	if (code === 0 && stdout.trim()) {
		let state: { readonly pid: number } | undefined;
		try {
			state = parseRemoteAgentHostState(JSON.parse(stdout.trim()));
		} catch { /* ignore parse errors */ }
		if (state) {
			logService.info(`${LOG_PREFIX} Killing remote agent host PID ${state.pid} (from ${stateFile})`);
			await exec(`kill ${state.pid} 2>/dev/null`, { ignoreExitCode: true });
		}
	}
	await exec(`rm -f ${stateFile}`, { ignoreExitCode: true });
}
