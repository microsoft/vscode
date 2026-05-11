/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';

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

/** Install location for the VS Code CLI on the remote machine. */
export function getRemoteCLIDir(quality: string): string {
	const q = validateShellToken(quality, 'quality');
	return q === 'stable' ? '~/.vscode-cli' : `~/.vscode-cli-${q}`;
}

export function getRemoteCLIBin(quality: string): string {
	const q = validateShellToken(quality, 'quality');
	const binaryName = q === 'stable' ? 'code' : 'code-insiders';
	return `${getRemoteCLIDir(q)}/${binaryName}`;
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

export function buildCLIDownloadUrl(os: string, arch: string, quality: string): string {
	return `https://update.code.visualstudio.com/latest/cli-${os}-${arch}/${quality}`;
}

/** Redact connection tokens from log output. */
export function redactToken(text: string): string {
	return text.replace(/\?tkn=[^\s&]+/g, '?tkn=***');
}

/** Path to our state file on the remote, recording the agent host's PID/port/token. */
export function getAgentHostStateFile(quality: string): string {
	return `${getRemoteCLIDir(quality)}/.agent-host-state`;
}

export interface AgentHostState {
	readonly pid: number;
	readonly port: number;
	readonly connectionToken: string | null;
}

/**
 * Validate that a parsed object conforms to the AgentHostState shape.
 * Returns the validated state or undefined if the shape is invalid.
 */
function parseAgentHostState(raw: unknown): AgentHostState | undefined {
	if (typeof raw !== 'object' || raw === null) {
		return undefined;
	}
	const obj = raw as Record<string, unknown>;
	if (typeof obj.pid !== 'number' || !Number.isSafeInteger(obj.pid) || obj.pid <= 0) {
		return undefined;
	}
	if (typeof obj.port !== 'number' || !Number.isSafeInteger(obj.port) || obj.port <= 0 || obj.port > 65535) {
		return undefined;
	}
	if (obj.connectionToken !== null && typeof obj.connectionToken !== 'string') {
		return undefined;
	}
	return { pid: obj.pid, port: obj.port, connectionToken: obj.connectionToken as string | null };
}

/**
 * Abstraction over SSH command execution to enable testing without a real SSH connection.
 */
export interface ISshExec {
	(command: string, opts?: { ignoreExitCode?: boolean }): Promise<{ stdout: string; stderr: string; code: number }>;
}

/**
 * Try to find a running agent host on the remote by reading our state file and
 * verifying the recorded PID is still alive.
 */
export async function findRunningAgentHost(
	exec: ISshExec,
	logService: ILogService,
	quality: string,
): Promise<{ port: number; connectionToken: string | undefined } | undefined> {
	const stateFile = getAgentHostStateFile(quality);
	const { stdout, code } = await exec(`cat ${stateFile} 2>/dev/null`, { ignoreExitCode: true });
	if (code !== 0 || !stdout.trim()) {
		return undefined;
	}

	let state: AgentHostState | undefined;
	try {
		state = parseAgentHostState(JSON.parse(stdout.trim()));
	} catch {
		// fall through
	}
	if (!state) {
		logService.info(`${LOG_PREFIX} Invalid agent host state file ${stateFile}, removing`);
		await exec(`rm -f ${stateFile}`, { ignoreExitCode: true });
		return undefined;
	}

	// Verify the PID is still alive
	const { code: killCode } = await exec(`kill -0 ${state.pid} 2>/dev/null`, { ignoreExitCode: true });
	if (killCode !== 0) {
		logService.info(`${LOG_PREFIX} Stale agent host state in ${stateFile} (PID ${state.pid} not running), cleaning up`);
		await exec(`rm -f ${stateFile}`, { ignoreExitCode: true });
		return undefined;
	}

	logService.info(`${LOG_PREFIX} Found running agent host via ${stateFile}: PID ${state.pid}, port ${state.port}`);
	return { port: state.port, connectionToken: state.connectionToken ?? undefined };
}

/**
 * After starting an agent host, record its PID/port/token in a state file on
 * the remote so that future connections can reuse the process.
 */
export async function writeAgentHostState(
	exec: ISshExec,
	logService: ILogService,
	quality: string,
	pid: number | undefined,
	port: number,
	connectionToken: string | undefined,
): Promise<void> {
	if (!pid) {
		logService.info(`${LOG_PREFIX} Agent host PID unknown, state file not written`);
		return;
	}

	const stateFile = getAgentHostStateFile(quality);
	const state: AgentHostState = { pid, port, connectionToken: connectionToken ?? null };
	const json = JSON.stringify(state);
	// Remove any existing file first so `>` creates a fresh inode with the
	// new umask (overwriting an existing file preserves its old permissions).
	// Use a subshell with restrictive umask (077) so the file is created with
	// owner-only permissions (0600), protecting the connection token.
	// The CLI itself stores its token file with the same permissions.
	const result = await exec(`rm -f ${stateFile} && (umask 077 && echo ${shellEscape(json)} > ${stateFile})`, { ignoreExitCode: true });
	if (result.code !== 0) {
		logService.warn(`${LOG_PREFIX} Failed to write agent host state to ${stateFile} (exit code ${result.code})${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
		return;
	}
	logService.info(`${LOG_PREFIX} Wrote agent host state to ${stateFile}: PID ${pid}, port ${port}`);
}

/**
 * Kill a remote agent host tracked by our state file and remove the state file.
 */
export async function cleanupRemoteAgentHost(
	exec: ISshExec,
	logService: ILogService,
	quality: string,
): Promise<void> {
	const stateFile = getAgentHostStateFile(quality);
	const { stdout, code } = await exec(`cat ${stateFile} 2>/dev/null`, { ignoreExitCode: true });
	if (code === 0 && stdout.trim()) {
		let state: AgentHostState | undefined;
		try {
			state = parseAgentHostState(JSON.parse(stdout.trim()));
		} catch { /* ignore parse errors */ }
		if (state) {
			logService.info(`${LOG_PREFIX} Killing remote agent host PID ${state.pid} (from ${stateFile})`);
			await exec(`kill ${state.pid} 2>/dev/null`, { ignoreExitCode: true });
		}
	}
	await exec(`rm -f ${stateFile}`, { ignoreExitCode: true });
}
