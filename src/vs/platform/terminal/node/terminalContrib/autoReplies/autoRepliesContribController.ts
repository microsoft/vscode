/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../log/common/log.js';
import type { IPtyServiceContribution, ITerminalChildProcess } from '../../../common/terminal.js';
import { TerminalAutoResponder } from './terminalAutoResponder.js';

export class AutoRepliesPtyServiceContribution implements IPtyServiceContribution {
	// Replies are shared by the pty host, but each workbench contribution owns its configuration.
	// For a shared prompt, the most recently installed owner's reply takes precedence.
	private readonly _autoReplies: Map<string, Map<string, string>> = new Map();
	private readonly _terminalProcesses: Map<number, ITerminalChildProcess> = new Map();
	private readonly _autoResponders: Map<number, Map<string, TerminalAutoResponder>> = new Map();

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
	}

	async installAutoReply(match: string, reply: string, ownerId: string) {
		let owners = this._autoReplies.get(match);
		if (!owners) {
			owners = new Map();
			this._autoReplies.set(match, owners);
		}
		// Move this owner to the end to preserve the last installed reply's precedence.
		owners.delete(ownerId);
		owners.set(ownerId, reply);
		this._installAutoReplyOnProcesses(match, reply);
	}

	async uninstallAllAutoReplies(ownerId: string) {
		for (const [match, owners] of this._autoReplies) {
			const previousReply = Array.from(owners.values()).at(-1);
			if (!owners.delete(ownerId)) {
				continue;
			}
			const reply = Array.from(owners.values()).at(-1);
			if (reply !== undefined) {
				if (reply !== previousReply) {
					this._installAutoReplyOnProcesses(match, reply);
				}
			} else {
				this._autoReplies.delete(match);
				for (const processAutoResponders of this._autoResponders.values()) {
					processAutoResponders.get(match)?.dispose();
					processAutoResponders.delete(match);
				}
			}
		}
	}

	handleProcessReady(persistentProcessId: number, process: ITerminalChildProcess): void {
		// Ready fires again when a persistent process is reattached, dispose the old responders
		const existingAutoResponders = this._autoResponders.get(persistentProcessId);
		if (existingAutoResponders) {
			for (const e of existingAutoResponders.values()) {
				e.dispose();
			}
		}
		this._terminalProcesses.set(persistentProcessId, process);
		this._autoResponders.set(persistentProcessId, new Map());
		for (const [match, owners] of this._autoReplies) {
			this._processInstallAutoReply(persistentProcessId, process, match, Array.from(owners.values()).at(-1)!);
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
		this._autoResponders.delete(persistentProcessId);
		this._terminalProcesses.delete(persistentProcessId);
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

	private _installAutoReplyOnProcesses(match: string, reply: string): void {
		for (const persistentProcessId of this._autoResponders.keys()) {
			const process = this._terminalProcesses.get(persistentProcessId);
			if (!process) {
				this._logService.error('Could not find terminal process to install auto reply');
				continue;
			}
			this._processInstallAutoReply(persistentProcessId, process, match, reply);
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
