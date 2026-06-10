/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getCaseInsensitive } from '../../../base/common/objects.js';
import { win32 } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { ISandboxDependencyStatus, ISandboxHelperService, type IWindowsMxcConfig, IWindowsMxcFilesystemPolicy, type IWindowsMxcPolicyContainment, type IWindowsMxcSandboxPolicy } from '../common/sandboxHelperService.js';

type FindCommand = (command: string) => Promise<string | undefined>;

export class SandboxHelperService implements ISandboxHelperService {
	declare readonly _serviceBrand: undefined;

	static async checkSandboxDependenciesWith(findCommand: FindCommand, linux: boolean = isLinux): Promise<ISandboxDependencyStatus | undefined> {
		if (!linux) {
			return undefined;
		}

		const [bubblewrapPath, socatPath] = await Promise.all([
			findCommand('bwrap'),
			findCommand('socat'),
		]);

		return {
			bubblewrapInstalled: !!bubblewrapPath,
			socatInstalled: !!socatPath,
		};
	}

	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined> {
		return SandboxHelperService.checkSandboxDependenciesWith(findExecutable);
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
