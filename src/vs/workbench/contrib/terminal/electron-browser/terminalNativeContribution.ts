/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeNonWindowsPath } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { execFile } from 'child_process';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { getWindowsBuildNumber } from 'vs/platform/terminal/node/terminalEnvironment';
import { linuxDistro } from 'vs/workbench/contrib/terminal/node/terminal';

export class TerminalNativeContribution extends Disposable implements IWorkbenchContribution {
	public _serviceBrand: undefined;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IRemoteAgentService readonly remoteAgentService: IRemoteAgentService,
		@INativeHostService readonly nativeHostService: INativeHostService
	) {
		super();

		this._terminalService.setLinuxDistro(linuxDistro);
		this._terminalService.setNativeWindowsDelegate({
			getWslPath: this._getWslPath.bind(this),
			getWindowsBuildNumber: this._getWindowsBuildNumber.bind(this)
		});
	}

	/**
	 * Converts a path to a path on WSL using the wslpath utility.
	 * @param path The original path.
	 */
	private _getWslPath(path: string): Promise<string> {
		if (getWindowsBuildNumber() < 17063) {
			throw new Error('wslpath does not exist on Windows build < 17063');
		}
		return new Promise<string>(c => {
			const proc = execFile('bash.exe', ['-c', `wslpath ${escapeNonWindowsPath(path)}`], {}, (error, stdout, stderr) => {
				c(escapeNonWindowsPath(stdout.trim()));
			});
			proc.stdin!.end();
		});
	}

	private _getWindowsBuildNumber(): number {
		return getWindowsBuildNumber();
	}
}
