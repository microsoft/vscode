/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinux } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { ISandboxDependencyStatus, ISandboxHelperService } from '../common/sandboxHelperService.js';

type FindCommand = (command: string) => Promise<string | undefined>;

export class SandboxHelperService implements ISandboxHelperService {
	declare readonly _serviceBrand: undefined;

	static async checkSandboxDependenciesWith(findCommand: FindCommand, linux: boolean = isLinux): Promise<ISandboxDependencyStatus> {
		if (!linux) {
			return {
				bubblewrapInstalled: true,
				socatInstalled: true,
			};
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

	checkSandboxDependencies(): Promise<ISandboxDependencyStatus> {
		return SandboxHelperService.checkSandboxDependenciesWith(findExecutable);
	}
}
