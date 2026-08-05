/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	shellEscape,
	sshOperation,
	validateCommit,
	validateShellToken,
	type ISshExec,
} from '../sshRemoteAgentHostHelpers.js';
import {
	_asRemotePath,
	type IInstallCliOptions,
	type IRemoteLaunchSpec,
	type IRemotePlatform,
	type IRemotePlatformInfo,
	type RemotePath,
} from './remotePlatform.js';

const COMMIT_GLOB = '[0-9a-f]'.repeat(40);
const COMMIT_HEX_RE = /^[0-9a-f]{40}$/;

/**
 * Absolute or `~`-rooted path built only from characters that carry no meaning
 * to a POSIX shell. Discovery results are interpolated unquoted into `test -x`,
 * `--version` and `exec`, so a candidate that fails this is never returned.
 */
const SAFE_REMOTE_PATH_RE = /^(?:~|\/[A-Za-z0-9._+-]+)(?:\/[A-Za-z0-9._+-]+)*$/;

/**
 * Remote platform strategy for POSIX remotes (Linux and macOS). One class
 * covers both because the existing commands are already portable: `ls -1t`,
 * `xargs -I{}` and the archive layout all behave identically on GNU and
 * BSD userlands.
 */
export class PosixRemotePlatform implements IRemotePlatform {

	constructor(public readonly info: IRemotePlatformInfo) { }

	cliArchiveName(quality: string): string {
		const q = validateShellToken(quality, 'quality');
		switch (q) {
			case 'stable': return 'code';
			case 'exploration': return 'code-exploration';
			default: return 'code-insiders';
		}
	}

	installRoot(serverDataFolderName: string): RemotePath {
		const d = validateShellToken(serverDataFolderName, 'server data folder name');
		return _asRemotePath(`~/${d}`);
	}

	cliDataDir(serverDataFolderName: string): RemotePath {
		return _asRemotePath(`${this.installRoot(serverDataFolderName)}/cli`);
	}

	cliBin(serverDataFolderName: string, quality: string, commit?: string): RemotePath {
		const archive = this.cliArchiveName(quality);
		const root = this.installRoot(serverDataFolderName);
		if (commit) {
			return _asRemotePath(`${root}/${archive}-${validateCommit(commit)}`);
		}
		return _asRemotePath(`${root}/${archive}`);
	}

	parseFallbackCliPath(candidate: string, serverDataFolderName: string, quality: string): RemotePath | undefined {
		const archive = this.cliArchiveName(quality);
		const q = validateShellToken(quality, 'quality');
		const legacyDir = q === 'stable' ? '~/.vscode-cli' : `~/.vscode-cli-${q}`;

		if (!SAFE_REMOTE_PATH_RE.test(candidate) || candidate.split('/').includes('..')) {
			return undefined;
		}

		const slash = candidate.lastIndexOf('/');
		if (slash < 0) {
			return undefined;
		}
		const dir = candidate.slice(0, slash);
		const name = candidate.slice(slash + 1);

		// The shell expands `~` before `ls` runs, so discovery reports absolute
		// paths. Accept either form, or nothing is ever recognised.
		const inDir = (expected: string): boolean =>
			dir === expected || (dir.startsWith('/') && dir.endsWith(expected.slice(1)));

		if (inDir(legacyDir) && name === archive) {
			return _asRemotePath(candidate);
		}
		if (inDir(this.installRoot(serverDataFolderName))
			&& name.startsWith(`${archive}-`)
			&& COMMIT_HEX_RE.test(name.slice(archive.length + 1))) {
			return _asRemotePath(candidate);
		}
		return undefined;
	}

	async isExecutableFile(exec: ISshExec, path: RemotePath): Promise<boolean> {
		const { code } = await exec(`test -x ${path}`, { description: sshOperation.checkCli, ignoreExitCode: true });
		return code === 0;
	}

	async touchFile(exec: ISshExec, path: RemotePath): Promise<boolean> {
		const { code } = await exec(`touch -- ${path}`, { description: sshOperation.touchCli, ignoreExitCode: true });
		return code === 0;
	}

	async versionCheck(exec: ISshExec, cliBin: RemotePath): Promise<boolean> {
		const { code } = await exec(`${cliBin} --version`, { description: sshOperation.verifyCli, ignoreExitCode: true });
		return code === 0;
	}

	async installCli(exec: ISshExec, options: IInstallCliOptions): Promise<void> {
		const { url, installRoot, cliBin, publish } = options;
		// `mv -n` (GNU, BSD and BusyBox) leaves an existing destination alone;
		// `mv -f` renames over it and fails the `&&` chain when it cannot.
		const publishStep = publish === 'immutable'
			? `mv -n "$tmpdir"/* ${cliBin}`
			: `mv -f "$tmpdir"/* ${cliBin}`;
		// The explicit modes are the install boundary: `mktemp -d` is already
		// 0700, but `mkdir -p` and `tar` both answer to the ambient umask.
		const cmd = [
			`mkdir -p ${installRoot}`,
			`chmod 700 ${installRoot}`,
			`tmpdir=$(mktemp -d ${installRoot}/.cli-install-XXXXXX)`,
			`(cd "$tmpdir" && curl -fsSL ${shellEscape(url)} | tar xz)`,
			publishStep,
			`chmod 700 ${cliBin}`,
			`rm -rf "$tmpdir"`,
		].join(' && ');
		await exec(cmd, { description: sshOperation.installCli });
	}

	async pruneOldClis(exec: ISshExec, serverDataFolderName: string, quality: string, keep: number): Promise<void> {
		if (!Number.isInteger(keep) || keep < 0) {
			throw new Error(`Invalid keep count for pruneOldClis: ${keep}`);
		}
		const root = this.installRoot(serverDataFolderName);
		const archive = this.cliArchiveName(quality);
		const cmd = `ls -1t -- ${root}/${archive}-${COMMIT_GLOB} 2>/dev/null | awk 'NR>${keep}' | xargs -I{} rm -f -- {} 2>/dev/null; true`;
		await exec(cmd, { description: sshOperation.pruneClis, ignoreExitCode: true });
	}

	async findFallbackClis(exec: ISshExec, serverDataFolderName: string, quality: string): Promise<readonly RemotePath[]> {
		const root = this.installRoot(serverDataFolderName);
		const archive = this.cliArchiveName(quality);
		const q = validateShellToken(quality, 'quality');
		const legacyDir = q === 'stable' ? '~/.vscode-cli' : `~/.vscode-cli-${q}`;
		const legacyBin = `${legacyDir}/${archive}`;
		const cmd = [
			`ls -1t -- ${root}/${archive}-${COMMIT_GLOB} 2>/dev/null`,
			`ls -1 -- ${legacyBin} 2>/dev/null`,
			'true',
		].join('; ');
		const { stdout } = await exec(cmd, { description: sshOperation.findClis, ignoreExitCode: true });
		const results: RemotePath[] = [];
		for (const line of stdout.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			const parsed = this.parseFallbackCliPath(trimmed, serverDataFolderName, quality);
			if (parsed) {
				results.push(parsed);
			}
		}
		return results;
	}

	buildLaunchCommand(spec: IRemoteLaunchSpec): string {
		// Both literals and remote paths go in verbatim: the whole command is
		// escaped once as the argument to `bash -l -c`, and a path's `~` has
		// to reach the login shell unquoted to expand.
		const args = spec.args.map(a => typeof a === 'string' ? a : a.path).join(' ');
		const inner = `echo VSCODE_PID=$$ && exec ${spec.executable} ${args}`;
		return `bash -l -c ${shellEscape(inner)}`;
	}

	buildRawLaunchCommand(command: string): string {
		const inner = `echo VSCODE_PID=$$ && exec ${command}`;
		return `bash -l -c ${shellEscape(inner)}`;
	}
}
