/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getCaseInsensitive } from '../../../base/common/objects.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { ISandboxDependencyStatus, ISandboxHelperService, IWindowsMxcFilesystemPolicy } from '../common/sandboxHelperService.js';

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

		const { getAvailableToolsPolicy, getUserProfilePolicy } = await import('@microsoft/mxc-sdk');
		const availableToolsPolicy = getAvailableToolsPolicy(process.env, { containerType: 'processcontainer' });
		const userProfilePolicy = getUserProfilePolicy();
		return {
			readonlyPaths: [...new Set([...availableToolsPolicy.readonlyPaths, ...userProfilePolicy.readonlyPaths, ...this._getPSModuleReadPaths(), ...this._getTempReadPaths()])],
			readwritePaths: [...new Set([...availableToolsPolicy.readwritePaths, ...userProfilePolicy.readwritePaths])],
		};
	}

	async getWindowsMxcEnvironment(): Promise<string[] | undefined> {
		if (!isWindows) {
			return undefined;
		}

		const env: string[] = [];
		const path = getCaseInsensitive(process.env, 'PATH');
		if (typeof path === 'string' && path) {
			env.push(`PATH=${path}`);
		}

		const pathExt = getCaseInsensitive(process.env, 'PATHEXT');
		env.push(`PATHEXT=${typeof pathExt === 'string' && pathExt ? pathExt : '.COM;.EXE;.BAT;.CMD'}`);

		const psModulePath = this._getPSModuleReadPaths();
		if (psModulePath.length) {
			env.push(`PSModulePath=${psModulePath.join(';')}`);
		}
		return env;
	}

	private _getPSModuleReadPaths(): string[] {
		const paths: string[] = [];
		const psModulePath = getCaseInsensitive(process.env, 'PSModulePath');
		if (typeof psModulePath === 'string' && psModulePath) {
			paths.push(...psModulePath.split(';'));
		}
		return paths;
	}

	private _getTempReadPaths(): string[] {
		const paths: string[] = [];
		for (const variable of ['TMP', 'TEMP']) {
			const path = getCaseInsensitive(process.env, variable);
			if (typeof path === 'string' && path) {
				paths.push(path);
			}
		}
		return paths;
	}
}
