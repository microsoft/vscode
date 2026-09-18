/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import {
	buildCLIDownloadUrl,
	buildCleanupOldCLIsCommand,
	buildFindFallbackCLICommand,
	getRemoteCLIBin,
	getRemoteCLIInstallRoot,
	isValidFallbackCLIPath,
	ISshExec,
	shellEscape,
} from './sshRemoteAgentHostHelpers.js';

export interface IRemoteAgentHostCliInstallOptions {
	readonly serverDataFolderName: string;
	readonly quality: string;
	readonly commit: string | undefined;
	readonly reportInstalling: () => void;
	readonly logService: ILogService;
	readonly logPrefix?: string;
}

/** The resolved CLI path and whether this invocation installed it. */
export interface IRemoteAgentHostCliInstallResult {
	readonly cliBin: string;
	readonly installed: boolean;
}

/**
 * Ensure that a VS Code CLI suitable for launching an Agent Host is installed
 * on a remote execution target.
 */
export async function ensureRemoteAgentHostCliInstalled(
	exec: ISshExec,
	platform: { readonly os: string; readonly arch: string },
	options: IRemoteAgentHostCliInstallOptions,
): Promise<IRemoteAgentHostCliInstallResult> {
	return options.commit
		? ensurePinnedCliInstalled(exec, platform, options, options.commit)
		: ensureLooseCliInstalled(exec, platform, options);
}

async function ensurePinnedCliInstalled(
	exec: ISshExec,
	platform: { readonly os: string; readonly arch: string },
	options: IRemoteAgentHostCliInstallOptions,
	commit: string,
): Promise<IRemoteAgentHostCliInstallResult> {
	const cliBin = getRemoteCLIBin(options.serverDataFolderName, options.quality, commit);
	const installRoot = getRemoteCLIInstallRoot(options.serverDataFolderName);
	const logPrefix = options.logPrefix ?? '[RemoteAgentHostCliInstaller]';
	const { code: existsCode } = await exec(`test -x ${cliBin}`, { ignoreExitCode: true });
	if (existsCode === 0) {
		options.logService.info(`${logPrefix} Reusing remote CLI at ${cliBin}`);
		const { code: touchCode } = await exec(`touch -- ${cliBin}`, { ignoreExitCode: true });
		if (touchCode === 0) {
			await exec(buildCleanupOldCLIsCommand(options.serverDataFolderName, options.quality), { ignoreExitCode: true });
		} else {
			options.logService.warn(`${logPrefix} Skipping CLI retention cleanup: touch exited ${touchCode}`);
		}
		return { cliBin, installed: false };
	}

	options.reportInstalling();
	const url = buildCLIDownloadUrl(platform.os, platform.arch, options.quality, commit);
	const installCommand = [
		`mkdir -p ${installRoot}`,
		`tmpdir=$(mktemp -d ${installRoot}/.cli-install-XXXXXX)`,
		`(cd "$tmpdir" && curl -fsSL ${shellEscape(url)} | tar xz)`,
		`mv "$tmpdir"/* ${cliBin}`,
		`chmod +x ${cliBin}`,
		`rm -rf "$tmpdir"`,
	].join(' && ');

	try {
		await exec(installCommand);
		const { code: versionCode } = await exec(`${cliBin} --version`, { ignoreExitCode: true });
		if (versionCode !== 0) {
			throw new Error(`CLI at ${cliBin} failed --version check after install (exit code ${versionCode})`);
		}
		options.logService.info(`${logPrefix} Installed remote CLI at ${cliBin}`);
		await exec(buildCleanupOldCLIsCommand(options.serverDataFolderName, options.quality), { ignoreExitCode: true });
		return { cliBin, installed: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		options.logService.warn(`${logPrefix} Could not install matching CLI for commit ${commit}: ${message}. Looking for a fallback CLI...`);
		const fallback = await findFallbackCli(exec, options);
		if (fallback) {
			options.logService.warn(`${logPrefix} Using fallback CLI at ${fallback} (does not match desktop commit ${commit}).`);
			return { cliBin: fallback, installed: false };
		}
		throw error;
	}
}

async function ensureLooseCliInstalled(
	exec: ISshExec,
	platform: { readonly os: string; readonly arch: string },
	options: IRemoteAgentHostCliInstallOptions,
): Promise<IRemoteAgentHostCliInstallResult> {
	const cliBin = getRemoteCLIBin(options.serverDataFolderName, options.quality);
	const installRoot = getRemoteCLIInstallRoot(options.serverDataFolderName);
	const logPrefix = options.logPrefix ?? '[RemoteAgentHostCliInstaller]';
	options.logService.warn(`${logPrefix} Desktop has no product commit; falling back to non-pinned CLI install at ${cliBin}.`);

	const updateExitCodeMarker = '__vscode_cli_update_exit_code__:';
	const { code, stdout } = await exec(`${cliBin} --version && (${cliBin} update; update_code=$?; echo ${updateExitCodeMarker}$update_code; true)`, { ignoreExitCode: true });
	if (code === 0) {
		const updateExitCodeLine = stdout.split('\n').find(line => line.startsWith(updateExitCodeMarker));
		const updateExitCode = updateExitCodeLine === undefined ? undefined : Number.parseInt(updateExitCodeLine.slice(updateExitCodeMarker.length), 10);
		if (updateExitCode !== undefined && updateExitCode !== 0) {
			options.logService.warn(`${logPrefix} Could not refresh the dev-build remote CLI at ${cliBin}; reusing the existing executable: update exited ${updateExitCode}`);
		}
		options.logService.info(`${logPrefix} Reusing remote CLI at ${cliBin} (dev build, latest-version refresh attempted)`);
		return { cliBin, installed: false };
	}

	options.reportInstalling();
	const url = buildCLIDownloadUrl(platform.os, platform.arch, options.quality);
	await exec([
		`mkdir -p ${installRoot}`,
		`curl -fsSL ${shellEscape(url)} | tar xz -C ${installRoot}`,
		`chmod +x ${cliBin}`,
	].join(' && '));
	options.logService.info(`${logPrefix} Installed remote CLI at ${cliBin}`);
	return { cliBin, installed: true };
}

async function findFallbackCli(exec: ISshExec, options: IRemoteAgentHostCliInstallOptions): Promise<string | undefined> {
	const logPrefix = options.logPrefix ?? '[RemoteAgentHostCliInstaller]';
	const { stdout } = await exec(buildFindFallbackCLICommand(options.serverDataFolderName, options.quality), { ignoreExitCode: true });
	const rawCandidates = stdout.split('\n').map(candidate => candidate.trim()).filter(candidate => candidate.length > 0);
	for (const candidate of rawCandidates) {
		if (!isValidFallbackCLIPath(candidate, options.serverDataFolderName, options.quality)) {
			options.logService.info(`${logPrefix} Ignoring fallback CLI candidate with unexpected path shape: ${candidate}`);
			continue;
		}
		const { code } = await exec(`${candidate} --version`, { ignoreExitCode: true });
		if (code === 0) {
			return candidate;
		}
		options.logService.info(`${logPrefix} Fallback CLI candidate ${candidate} failed --version check (exit ${code}).`);
	}
	return undefined;
}
