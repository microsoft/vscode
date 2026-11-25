/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { join } from '../../../base/common/path.js';
import { TelemetryConfiguration } from '../../telemetry/common/telemetry.js';
import { AgentHostTelemetryLevelEnvKey } from '../common/agentHostTelemetryEnv.js';
import { WSL_MUSL_SERVER_LIBRARIES, type IWSLDistro } from '../common/wslRemoteAgentHost.js';
import {
	buildAgentHostBaseCommand,
	buildCleanupOldCLIsCommand,
	DETECT_MUSL_COMMAND,
	extractAgentHostWebSocketURL,
	getRemoteCLIBin,
	getRemoteCLIInstallRoot,
	validateAgentHostTelemetryLevel,
	validateShellToken,
} from './sshRemoteAgentHostHelpers.js';

export { extractAgentHostWebSocketURL };

/**
 * Locate `wsl.exe`. Prefer the absolute path under `%SystemRoot%\System32`
 * (defends against PATH hijacks on Windows hosts where `wsl.exe` is itself
 * a security boundary). Falls back to bare `wsl.exe` if `%SystemRoot%` is
 * unset so non-Windows hosts still produce a sensible value for testing.
 */
export function getWslExePath(): string {
	const systemRoot = process.env['SystemRoot'];
	if (!systemRoot) {
		return 'wsl.exe';
	}
	return join(systemRoot, 'System32', 'wsl.exe');
}

/**
 * Cheap probe for `wsl.exe --status`. Returns false on any non-Windows host,
 * on spawn failure (ENOENT), or on non-zero exit. Used by both the platform
 * capability check (renderer) and the picker gating logic (UI).
 */
export async function isWSLSupported(): Promise<boolean> {
	if (process.platform !== 'win32') {
		return false;
	}
	try {
		const result = await runWslCommand(['--status'], { timeout: 5_000 });
		return result.exitCode === 0;
	} catch {
		return false;
	}
}

export interface IRunWslCommandOptions {
	readonly timeout?: number;
	readonly distro?: string;
	/** Bytes written to the command's stdin, which is closed afterwards. */
	readonly input?: Uint8Array;
}

export interface IRunWslCommandResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

/**
 * Spawn `wsl.exe` with `WSL_UTF8=1` and capture stdout/stderr. Modern WSL
 * builds honor `WSL_UTF8` and emit UTF-8; older builds emit null-padded
 * UTF-16LE regardless. We detect the latter by sniffing the first few bytes
 * and decode accordingly so a single helper covers both.
 *
 * Times out after {@link options.timeout} ms (default 30s); on timeout the
 * child is hard-killed and the promise rejects.
 */
export function runWslCommand(args: readonly string[], options?: IRunWslCommandOptions): Promise<IRunWslCommandResult> {
	return new Promise((resolve, reject) => {
		const fullArgs = options?.distro ? ['-d', options.distro, ...args] : [...args];
		const child = cp.spawn(getWslExePath(), fullArgs, {
			env: { ...process.env, WSL_UTF8: '1' },
			windowsHide: true,
			stdio: [options?.input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
		});
		if (options?.input) {
			// The exit code reports why a command stopped reading its input early.
			child.stdin?.on('error', () => { });
			child.stdin?.end(options.input);
		}

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let settled = false;

		const timeout = setTimeout(() => {
			if (settled) {
				return;
			}
			settled = true;
			try {
				child.kill('SIGKILL');
			} catch { /* ignore */ }
			reject(new Error(`wsl.exe ${fullArgs.join(' ')} timed out after ${options?.timeout ?? 30_000}ms`));
		}, options?.timeout ?? 30_000);

		child.stdout?.on('data', chunk => stdoutChunks.push(chunk));
		child.stderr?.on('data', chunk => stderrChunks.push(chunk));

		child.on('error', err => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			reject(err);
		});

		child.on('close', exitCode => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			resolve({
				stdout: decodeWslOutput(Buffer.concat(stdoutChunks)),
				stderr: decodeWslOutput(Buffer.concat(stderrChunks)),
				exitCode: exitCode ?? -1,
			});
		});
	});
}

/**
 * Decode a `wsl.exe` output buffer that may be UTF-8 (modern builds with
 * `WSL_UTF8=1`) or UTF-16LE (older builds that ignore the env var). Strips
 * the BOM in either case.
 */
export function decodeWslOutput(buffer: Buffer): string {
	if (buffer.length === 0) {
		return '';
	}
	// UTF-16LE BOM
	if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
		return buffer.toString('utf16le', 2);
	}
	// Heuristic: WSL UTF-16LE output is ASCII text, so every other byte is
	// 0x00. Sample the first 16 bytes (skipping byte 0 in case it's a BOM
	// remnant). If a clear majority of odd-indexed bytes are zero, treat as
	// UTF-16LE.
	const sampleLen = Math.min(buffer.length, 16);
	if (sampleLen >= 4) {
		let zeros = 0;
		let total = 0;
		for (let i = 1; i < sampleLen; i += 2) {
			total++;
			if (buffer[i] === 0) {
				zeros++;
			}
		}
		if (total > 0 && zeros / total >= 0.75) {
			let text = buffer.toString('utf16le');
			if (text.charCodeAt(0) === 0xfeff) {
				text = text.slice(1);
			}
			return text;
		}
	}
	let text = buffer.toString('utf8');
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1);
	}
	return text;
}

/**
 * Parse the output of `wsl --list --verbose`. Only WSL 2 distros are
 * returned — WSL 1 lacks the kernel features needed to host the agent.
 * Docker Desktop's internal `docker-desktop*` distros are skipped because
 * they cannot run the agent host.
 *
 * Robust against:
 *  - BOM, CRLF and lone LF line endings
 *  - header row with locale-dependent column names
 *  - the leading `* ` marker on the default distro
 *  - trailing whitespace and empty lines
 */
export function parseWslListVerbose(output: string): IWSLDistro[] {
	if (!output) {
		return [];
	}
	const stripped = output.charCodeAt(0) === 0xfeff ? output.slice(1) : output;
	const lines = stripped.split(/\r\n|\r|\n/);
	const distros: IWSLDistro[] = [];
	let headerSeen = false;
	for (const rawLine of lines) {
		const line = rawLine.replace(/\s+$/, '');
		if (!line.trim()) {
			continue;
		}
		// The header row starts with `NAME` (possibly preceded by leading
		// whitespace where the `* ` marker would otherwise appear). Skip
		// it once seen; any subsequent NAME-headed row is data.
		if (!headerSeen) {
			const upper = line.trim().toUpperCase();
			if (upper.startsWith('NAME')) {
				headerSeen = true;
				continue;
			}
		}
		let working = line;
		let isDefault = false;
		if (working.startsWith('* ') || working.startsWith('*\t')) {
			isDefault = true;
			working = working.slice(2);
		} else if (working.startsWith('  ') || working.startsWith(' \t')) {
			working = working.slice(2);
		} else if (working.startsWith(' ')) {
			working = working.slice(1);
		}
		const columns = working.trim().split(/\s+/);
		if (columns.length < 3) {
			continue;
		}
		const version = parseInt(columns[columns.length - 1], 10);
		if (version !== 2) {
			continue;
		}
		const state = columns[columns.length - 2];
		const name = columns.slice(0, columns.length - 2).join(' ');
		if (!name || name.toLowerCase().startsWith('docker-desktop')) {
			continue;
		}
		distros.push({
			name,
			isDefault,
			isRunning: state.toLowerCase() === 'running',
			version: 2,
		});
	}
	return distros;
}

/**
 * Parse the output of `wsl --list --running --quiet`. One distro per line.
 */
export function parseRunningDistros(output: string): string[] {
	if (!output) {
		return [];
	}
	const stripped = output.charCodeAt(0) === 0xfeff ? output.slice(1) : output;
	return stripped
		.split(/\r\n|\r|\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0);
}

/** What {@link composeDistroProbeScript} reports about a distribution. */
export interface IWSLDistroProbe {
	readonly unameS: string;
	readonly unameM: string;
	/** `musl` on musl-based distributions such as Alpine, otherwise empty. */
	readonly libc: string;
	/** Whether the installed CLI runs, so it can be reused instead of being installed again. */
	readonly cliRunnable: boolean;
	/** Libraries from {@link WSL_MUSL_SERVER_LIBRARIES} that are missing on a musl distribution. */
	readonly missingLibraries: readonly string[];
	/** Whether the distribution has Alpine's `apk` package manager, which can install missing libraries. */
	readonly hasApk: boolean;
}

/**
 * Compose the POSIX `sh` script that reports, one `key=value` per line, the
 * platform for picking the CLI build, whether the CLI at `cliBin` runs (a CLI
 * of the wrong platform or libc doesn't and is replaced), and which libraries
 * the server needs are missing on musl and whether `apk` can install them.
 */
export function composeDistroProbeScript(cliBin: string): string {
	return [
		'printf \'os=%s\\n\' "$(uname -s)"',
		'printf \'arch=%s\\n\' "$(uname -m)"',
		`libc=$(${DETECT_MUSL_COMMAND})`,
		'printf \'libc=%s\\n\' "$libc"',
		`if [ "$libc" = musl ]; then for lib in ${WSL_MUSL_SERVER_LIBRARIES.join(' ')}; do [ -e "/usr/lib/$lib" ] || [ -e "/lib/$lib" ] || printf 'missing=%s\\n' "$lib"; done; fi`,
		'if command -v apk >/dev/null 2>&1; then echo apk=yes; fi',
		`if ${cliBin} --version >/dev/null 2>&1; then echo cli=ok; fi`,
	].join('; ');
}

/** Parse the output of {@link composeDistroProbeScript}. */
export function parseDistroProbe(output: string): IWSLDistroProbe {
	const values = new Map<string, string>();
	const missingLibraries: string[] = [];
	for (const line of output.split(/\r\n|\r|\n/)) {
		const separator = line.indexOf('=');
		if (separator <= 0) {
			continue;
		}
		const key = line.slice(0, separator);
		const value = line.slice(separator + 1).trim();
		if (key === 'missing') {
			missingLibraries.push(value);
		} else {
			values.set(key, value);
		}
	}
	return {
		unameS: values.get('os') ?? '',
		unameM: values.get('arch') ?? '',
		libc: values.get('libc') ?? '',
		cliRunnable: values.get('cli') === 'ok',
		missingLibraries,
		hasApk: values.get('apk') === 'yes',
	};
}

/**
 * Compose the POSIX `sh` script that installs the CLI from the `.tar.gz`
 * archive on its stdin, which is downloaded on the Windows side so the
 * distribution needs neither `curl` nor `wget`. It extracts into a temporary
 * directory in the install root and renames the binary into place, replacing
 * a CLI that doesn't run, then verifies that the new one runs.
 */
export function composeCLIInstallScript(serverDataFolderName: string, quality: string, commit: string | undefined): string {
	const installRoot = getRemoteCLIInstallRoot(serverDataFolderName);
	const cliBin = getRemoteCLIBin(serverDataFolderName, quality, commit);
	return [
		'set -e',
		`mkdir -p ${installRoot}`,
		`tmpdir=$(mktemp -d ${installRoot}/.cli-install-XXXXXX)`,
		'trap \'rm -rf "$tmpdir"\' EXIT',
		'tar -xzf - -C "$tmpdir"',
		`mv -f "$tmpdir"/* ${cliBin}`,
		`chmod +x ${cliBin}`,
		`${cliBin} --version >/dev/null`,
	].join('; ');
}

/**
 * Arguments after `wsl.exe -d <distro> -e` that run `script` in Bash's login
 * shell, which reads `~/.bash_profile` for settings such as proxies that the
 * CLI's server download needs, or in a POSIX login shell on distros without
 * Bash, such as Alpine.
 */
export function getWslLoginShellArgs(script: string): string[] {
	return ['sh', '-c', 'if command -v bash >/dev/null 2>&1; then exec bash -lc "$1"; fi; exec sh -lc "$1"', 'sh', script];
}

export interface IComposeAgentHostBootstrapScriptArgs {
	readonly serverDataFolderName: string;
	readonly quality: string;
	readonly commit: string | undefined;
	readonly telemetryLevel?: TelemetryConfiguration;
	/** Dev override; executed verbatim with no appended arguments. All CLI bootstrap is skipped. */
	readonly remoteAgentHostCommand?: string;
}

/**
 * Compose the POSIX `sh` one-liner that {@link getWslLoginShellArgs} runs in a
 * login shell, which launches the CLI that {@link composeCLIInstallScript}
 * installed.
 *
 * Reuses the same install layout helpers as Remote-SSH
 * ({@link getRemoteCLIBin}, {@link buildCleanupOldCLIsCommand},
 * {@link buildAgentHostBaseCommand}) so a WSL-installed CLI and an
 * SSH-installed CLI share the same `~/<serverDataFolderName>/...` files
 * inside the distro.
 */
export function composeAgentHostBootstrapScript(args: IComposeAgentHostBootstrapScriptArgs): string {
	const telemetryLevel = validateAgentHostTelemetryLevel(args.telemetryLevel ?? TelemetryConfiguration.OFF);
	if (args.remoteAgentHostCommand) {
		// The override may not be the VS Code CLI, so pass launch restrictions out-of-band.
		return `export ${AgentHostTelemetryLevelEnvKey}=${telemetryLevel} && ${args.remoteAgentHostCommand}`;
	}
	const cliBin = getRemoteCLIBin(args.serverDataFolderName, args.quality, args.commit);
	const launch = buildWslAgentHostLaunch(buildAgentHostBaseCommand(cliBin, args.serverDataFolderName, telemetryLevel));
	if (!args.commit) {
		// Dev builds use a single non-pinned binary without retention pruning.
		return launch;
	}
	// Mirrors SSH's pinned install: touch keeps the reused binary's mtime
	// fresh so pruning older commit-keyed binaries (keep newest 5) keeps it.
	const cleanup = buildCleanupOldCLIsCommand(args.serverDataFolderName, args.quality);
	return [
		`touch -- ${cliBin} 2>/dev/null || true`,
		`(${cleanup}) >/dev/null 2>&1 || true`,
		launch,
	].join(' && ');
}

/**
 * Build the WSL launch command with the CLI's disconnected-host reaper.
 */
function buildWslAgentHostLaunch(command: string, idleTimeoutSec = 300): string {
	if (!Number.isSafeInteger(idleTimeoutSec) || idleTimeoutSec <= 0) {
		throw new Error(`Unsafe idle timeout value for shell interpolation: ${JSON.stringify(idleTimeoutSec)}`);
	}
	return `exec ${command} --idle-timeout ${idleTimeoutSec}`;
}

/**
 * Validate that a string is safe to interpolate as a `wsl.exe -d <distro>`
 * argument. WSL distro names are user-creatable so they could in principle
 * contain spaces or quotes, but every distro shipped through the Store
 * matches `[A-Za-z0-9._-]+`. Reject anything else as defense-in-depth.
 */
export function validateDistroName(name: string): string {
	return validateShellToken(name, 'WSL distro name');
}
