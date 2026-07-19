/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { getCaseInsensitive } from '../../../base/common/objects.js';
import { win32 } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { getOSReleaseInfo } from '../../../base/node/osReleaseInfo.js';
import { findExecutable } from '../../../base/node/processes.js';
import { ISandboxDependencyStatus, ISandboxHelperService, type IWindowsMxcConfig, IWindowsMxcFilesystemPolicy, type IWindowsMxcPolicyContainment, type IWindowsMxcSandboxPolicy } from '../common/sandboxHelperService.js';

type FindCommand = (command: string) => Promise<string | undefined>;
type BubblewrapProbe = (command: string) => Promise<{ usable: boolean; error?: string }>;
type ResolveLinuxInstallEnvironment = () => Promise<{ distributionIds: readonly string[]; isRoot: boolean }>;

const linuxDependencyInstallCommands: readonly { distributionIds: readonly string[]; commands: readonly [executable: string, command: string][] }[] = [
	{ distributionIds: ['debian', 'ubuntu', 'linuxmint', 'pop', 'elementary', 'kali', 'raspbian'], commands: [['apt-get', 'apt-get install -y'], ['apt', 'apt install -y']] },
	{ distributionIds: ['fedora', 'rhel', 'centos', 'rocky', 'almalinux'], commands: [['dnf', 'dnf install -y'], ['yum', 'yum install -y']] },
	{ distributionIds: ['arch', 'manjaro', 'endeavouros'], commands: [['pacman', 'pacman -S --needed --noconfirm']] },
	{ distributionIds: ['suse', 'opensuse', 'opensuse-leap', 'opensuse-tumbleweed'], commands: [['zypper', 'zypper --non-interactive install']] },
	{ distributionIds: ['alpine'], commands: [['apk', 'apk add']] },
];

export class SandboxHelperService implements ISandboxHelperService {
	declare readonly _serviceBrand: undefined;

	static async checkSandboxDependenciesWith(findCommand: FindCommand, linux: boolean = isLinux, probeBubblewrap: BubblewrapProbe = command => SandboxHelperService._probeBubblewrap(command), resolveInstallEnvironment: ResolveLinuxInstallEnvironment = () => SandboxHelperService._resolveLinuxInstallEnvironment()): Promise<ISandboxDependencyStatus | undefined> {
		if (!linux) {
			return undefined;
		}

		const [bubblewrapPath, socatPath] = await Promise.all([
			findCommand('bwrap'),
			findCommand('socat'),
		]);
		const bubblewrapProbe = bubblewrapPath ? await probeBubblewrap(bubblewrapPath) : { usable: false };
		const dependencyInstallCommand = !bubblewrapPath || !socatPath
			? await SandboxHelperService._findDependencyInstallCommand(findCommand, resolveInstallEnvironment)
			: undefined;

		return {
			bubblewrapInstalled: !!bubblewrapPath,
			bubblewrapUsable: bubblewrapProbe.usable,
			bubblewrapError: bubblewrapProbe.error,
			socatInstalled: !!socatPath,
			dependencyInstallCommand,
		};
	}

	private static async _findDependencyInstallCommand(findCommand: FindCommand, resolveInstallEnvironment: ResolveLinuxInstallEnvironment): Promise<string | undefined> {
		const environment = await resolveInstallEnvironment();
		const installer = linuxDependencyInstallCommands.find(candidate => candidate.distributionIds.some(id => environment.distributionIds.includes(id)));
		if (!installer) {
			return undefined;
		}
		const elevation = environment.isRoot ? '' : await findCommand('sudo') ? 'sudo ' : undefined;
		if (elevation === undefined) {
			return undefined;
		}
		for (const [executable, command] of installer.commands) {
			if (await findCommand(executable)) {
				return `${elevation}${command}`;
			}
		}
		return undefined;
	}

	private static async _resolveLinuxInstallEnvironment(): Promise<{ distributionIds: readonly string[]; isRoot: boolean }> {
		const releaseInfo = await getOSReleaseInfo(() => { });
		return {
			distributionIds: [releaseInfo?.id, ...releaseInfo?.id_like?.split(/\s+/) ?? []].filter((id): id is string => !!id),
			isRoot: process.getuid?.() === 0,
		};
	}

	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined> {
		return SandboxHelperService.checkSandboxDependenciesWith(findExecutable);
	}

	private static _probeBubblewrap(command: string): Promise<{ usable: boolean; error?: string }> {
		return new Promise(resolve => {
			execFile(command, ['--unshare-net', '--dev-bind', '/', '/', 'echo', 'ok'], { encoding: 'utf8', timeout: 5000 }, (error, stdout, stderr) => {
				if (!error && stdout.trim() === 'ok') {
					resolve({ usable: true });
					return;
				}

				const detail = stderr.trim() || error?.message || `Unexpected output: ${stdout.trim()}`;
				resolve({ usable: false, error: detail.slice(0, 1000) });
			});
		});
	}

	async getWindowsMxcFilesystemPolicy(): Promise<IWindowsMxcFilesystemPolicy | undefined> {
		if (!isWindows) {
			return undefined;
		}

		const { getAvailableToolsPolicy, getUserProfilePolicy, getTemporaryFilesPolicy } = await import('@microsoft/mxc-sdk');
		const availableToolsPolicy = getAvailableToolsPolicy(process.env, { containerType: 'processcontainer' });
		const userProfilePolicy = getUserProfilePolicy();
		const temporaryFilesPolicy = getTemporaryFilesPolicy(process.env);
		const psHome = await this._getPSHome();
		return {
			readonlyPaths: [...new Set([...availableToolsPolicy.readonlyPaths, ...userProfilePolicy.readonlyPaths, ...temporaryFilesPolicy.readonlyPaths, ...(psHome ? [psHome] : [])])],
			readwritePaths: [...new Set([...availableToolsPolicy.readwritePaths, ...userProfilePolicy.readwritePaths, ...temporaryFilesPolicy.readwritePaths])],
		};
	}

	async getWindowsMxcEnvironment(): Promise<string[] | undefined> {
		if (!isWindows) {
			return undefined;
		}

		const env: string[] = [];
		for (const variable of ['SystemRoot', 'PATH', 'ComSpec', 'PATHEXT', 'PSModulePath']) {
			const value = getCaseInsensitive(process.env, variable);
			if (typeof value === 'string' && value) {
				env.push(`${variable}=${value}`);
			}
		}
		const userProfile = getCaseInsensitive(process.env, 'USERPROFILE');
		if (typeof userProfile === 'string' && userProfile) {
			env.push(`USERPROFILE=${userProfile}`);
		}
		const appData = getCaseInsensitive(process.env, 'APPDATA');
		if (typeof appData === 'string' && appData) {
			env.push(`APPDATA=${appData}`);
		}
		const localAppData = this._getLocalAppData();
		if (typeof localAppData === 'string' && localAppData) {
			env.push(`LOCALAPPDATA=${localAppData}`);
		}

		const psHome = await this._getPSHome();
		if (psHome) {
			env.push(`PSHOME=${psHome}`);
		}
		return env;
	}

	async buildWindowsMxcSandboxPayload(commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment: IWindowsMxcPolicyContainment = 'process'): Promise<IWindowsMxcConfig | undefined> {
		if (!isWindows) {
			return undefined;
		}

		const { buildSandboxPayload } = await import('@microsoft/mxc-sdk');
		return buildSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
	}

	private async _getPSHome(): Promise<string | undefined> {
		const psHome = getCaseInsensitive(process.env, 'PSHOME');
		if (typeof psHome === 'string' && psHome) {
			return psHome;
		}

		const powerShellPath = await findExecutable('pwsh') ?? await findExecutable('powershell');
		return powerShellPath ? win32.dirname(powerShellPath) : undefined;
	}

	private _getLocalAppData(): string | undefined {
		const localAppData = getCaseInsensitive(process.env, 'LOCALAPPDATA');
		return typeof localAppData === 'string' && localAppData ? localAppData : undefined;
	}
}
