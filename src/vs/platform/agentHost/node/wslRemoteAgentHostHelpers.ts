/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { join } from '../../../base/common/path.js';
import type { IWSLDistro } from '../common/wslRemoteAgentHost.js';
import {
	buildAgentHostBaseCommand,
	buildCLIDownloadUrl,
	buildCleanupOldCLIsCommand,
	extractAgentHostWebSocketURL,
	getRemoteCLIBin,
	getRemoteCLIDataDir,
	getRemoteCLIInstallRoot,
	shellEscape,
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
			stdio: ['ignore', 'pipe', 'pipe'],
		});

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
		if (!name) {
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

export interface IComposeAgentHostBootstrapScriptArgs {
	readonly serverDataFolderName: string;
	readonly quality: string;
	readonly commit: string | undefined;
	readonly os: string;
	readonly arch: string;
	/** Dev override; when set, returned verbatim and all CLI bootstrap is skipped. */
	readonly remoteAgentHostCommand?: string;
}

/**
 * Compose the bash one-liner passed to `wsl.exe -d <distro> -e bash -lc`.
 *
 * Reuses the same install layout helpers as Remote-SSH
 * ({@link getRemoteCLIBin}, {@link buildCLIDownloadUrl},
 * {@link buildCleanupOldCLIsCommand}, {@link buildAgentHostBaseCommand}) so
 * a WSL-installed CLI and an SSH-installed CLI share the same
 * `~/<serverDataFolderName>/...` files inside the distro.
 *
 * SSH composes the same operations across multiple sequential `exec` calls
 * (so it can branch on lockfile reuse and CLI-install failures); WSL does
 * not have a control channel back to the host between commands and so
 * collapses the install+launch into one script per spawn. The shared layout
 * lives in the helper functions above, not in the composition itself.
 */
export function composeAgentHostBootstrapScript(args: IComposeAgentHostBootstrapScriptArgs): string {
	if (args.remoteAgentHostCommand) {
		return args.remoteAgentHostCommand;
	}
	const installRoot = getRemoteCLIInstallRoot(args.serverDataFolderName);
	const cliBin = getRemoteCLIBin(args.serverDataFolderName, args.quality, args.commit);
	const cliDataDir = getRemoteCLIDataDir(args.serverDataFolderName);
	const url = buildCLIDownloadUrl(args.os, args.arch, args.quality, args.commit);
	const launch = `exec ${buildAgentHostBaseCommand(cliBin, cliDataDir)}`;

	if (args.commit) {
		// Pinned-install path. Mirrors SSH's _ensureCLIInstalledPinned: stage
		// into a same-FS tmpdir for atomic rename, validate +x, then prune
		// older commit-keyed binaries (keep newest 5). Touch keeps the
		// reuse-path binary's mtime fresh so it doesn't fall out of that
		// window.
		const cleanup = buildCleanupOldCLIsCommand(args.serverDataFolderName, args.quality);
		const installSteps = [
			`tmpdir=$(mktemp -d ${installRoot}/.cli-install-XXXXXX)`,
			`(cd "$tmpdir" && curl -fsSL ${shellEscape(url)} | tar xz)`,
			`mv "$tmpdir"/* ${cliBin}`,
			`chmod +x ${cliBin}`,
			`rm -rf "$tmpdir"`,
		].join(' && ');
		return [
			`mkdir -p ${installRoot}`,
			`if [ ! -x ${cliBin} ]; then ${installSteps}; fi`,
			`touch -- ${cliBin} 2>/dev/null || true`,
			`(${cleanup}) >/dev/null 2>&1 || true`,
			launch,
		].join(' && ');
	}

	// Loose dev-build path. Matches SSH's _ensureCLIInstalledLoose: single
	// non-pinned binary, no retention pruning, install on first miss.
	const installLoose = `curl -fsSL ${shellEscape(url)} | tar xz -C ${installRoot} && chmod +x ${cliBin}`;
	return [
		`mkdir -p ${installRoot}`,
		`if [ ! -x ${cliBin} ]; then ${installLoose}; fi`,
		launch,
	].join(' && ');
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
