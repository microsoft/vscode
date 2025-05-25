/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../log/common/log.js';
import type { IPtyServiceContribution, ITerminalChildProcess } from '../../../common/terminal.js';
import { TerminalAutoResponder } from './terminalAutoResponder.js';

export class AutoRepliesPtyServiceContribution implements IPtyServiceContribution {
	private readonly _autoReplies: Map<string, string> = new Map();
	private readonly _terminalProcesses: Map<number, ITerminalChildProcess> = new Map();
	private readonly _autoResponders: Map<number, Map<string, TerminalAutoResponder>> = new Map();

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
	}

	async installAutoReply(match: string, reply: string) {
		this._autoReplies.set(match, reply);
		// If the auto reply exists on any existing terminals it will be overridden
		for (const persistentProcessId of this._autoResponders.keys()) {
			const process = this._terminalProcesses.get(persistentProcessId);
			if (!process) {
				this._logService.error('Could not find terminal process to install auto reply');
				continue;
			}
			this._processInstallAutoReply(persistentProcessId, process, match, reply);
		}
	}

	async uninstallAllAutoReplies() {
		for (const match of this._autoReplies.keys()) {
			for (const processAutoResponders of this._autoResponders.values()) {
				processAutoResponders.get(match)?.dispose();
				processAutoResponders.delete(match);
			}
		}
	}

	handleProcessReady(persistentProcessId: number, process: ITerminalChildProcess): void {
		this._terminalProcesses.set(persistentProcessId, process);
		this._autoResponders.set(persistentProcessId, new Map());
		for (const [match, reply] of this._autoReplies.entries()) {
			this._processInstallAutoReply(persistentProcessId, process, match, reply);
		}
	}

	handleProcessDispose(persistentProcessId: number): void {
		const processAutoResponders = this._autoResponders.get(persistentProcessId);
		if (processAutoResponders) {
			for (const e of processAutoResponders.values()) {
				e.dispose();
			}
			processAutoResponders.clear();
		}
	}

	handleProcessInput(persistentProcessId: number, data: string) {
		const processAutoResponders = this._autoResponders.get(persistentProcessId);
		if (processAutoResponders) {
			for (const listener of processAutoResponders.values()) {
				listener.handleInput();
			}
		}
	}

	handleProcessResize(persistentProcessId: number, cols: number, rows: number) {
		const processAutoResponders = this._autoResponders.get(persistentProcessId);
		if (processAutoResponders) {
			for (const listener of processAutoResponders.values()) {
				listener.handleResize();
			}
		}
	}

	private _processInstallAutoReply(persistentProcessId: number, terminalProcess: ITerminalChildProcess, match: string, reply: string) {
		const processAutoResponders = this._autoResponders.get(persistentProcessId);
		if (processAutoResponders) {
			processAutoResponders.get(match)?.dispose();
			processAutoResponders.set(match, new TerminalAutoResponder(terminalProcess, match, reply, this._logService));
		}
	}
}
