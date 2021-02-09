/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from 'vs/base/common/platform';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ICommonLocalPtyService, IShellLaunchConfig, ITerminalChildProcess, ITerminalLaunchError } from 'vs/platform/terminal/common/terminal';
import { TerminalProcess } from 'vs/platform/terminal/node/terminalProcess';

export const ILocalPtyMainService = createDecorator<ILocalPtyMainService>('localPtyMainService');

export interface ILocalPtyMainService extends ICommonLocalPtyService { }

let currentLocalPtyId = 0;

export class LocalPtyMainService implements ICommonLocalPtyService {
	declare readonly _serviceBrand: undefined;

	private readonly _localPtys: Map<number, ITerminalChildProcess> = new Map();

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean): Promise<number> {
		console.log('PtyMainService#test', cwd, cols, rows);
		const process = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, windowsEnableConpty, this._logService);
		console.log('created process');
		process.onProcessData((d) => console.log('data: ' + d));
		process.onProcessExit(e => console.log('exit: ' + e));
		const id = ++currentLocalPtyId;
		this._localPtys.set(id, process);
		return id;
	}

	async start(id: number): Promise<ITerminalLaunchError | { remoteTerminalId: number; } | undefined> {
		return this._throwIfNoPty(id).start();
	}

	async shutdown(id: number, immediate: boolean): Promise<void> {
		return this._throwIfNoPty(id).shutdown(immediate);
	}

	async input(id: number, data: string): Promise<void> {
		return this._throwIfNoPty(id).input(data);
	}

	async resize(id: number, cols: number, rows: number): Promise<void> {
		return this._throwIfNoPty(id).resize(cols, rows);
	}

	async acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._throwIfNoPty(id).acknowledgeDataEvent(charCount);
	}

	async getInitialCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getInitialCwd();
	}

	async getCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getCwd();
	}

	async getLatency(id: number): Promise<number> {
		return this._throwIfNoPty(id).getLatency();
	}

	private _throwIfNoPty(id: number): ITerminalChildProcess {
		const pty = this._localPtys.get(id);
		if (!pty) {
			throw new Error(`Could not find pty with id "${id}"`);
		}
		return pty;
	}
}
