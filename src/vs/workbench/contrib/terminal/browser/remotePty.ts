/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from '../../../../base/common/async.js';
import { IProcessPropertyMap, ITerminalChildProcess, ITerminalLaunchError, ITerminalLogService, ProcessPropertyType } from '../../../../platform/terminal/common/terminal.js';
import { BasePty } from '../common/basePty.js';
import { RemoteTerminalChannelClient } from '../common/remote/remoteTerminalChannel.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';

export class RemotePty extends BasePty implements ITerminalChildProcess {
	private readonly _startBarrier: Barrier;

	constructor(
		id: number,
		shouldPersist: boolean,
		private readonly _remoteTerminalChannel: RemoteTerminalChannelClient,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ITerminalLogService private readonly _logService: ITerminalLogService
	) {
		super(id, shouldPersist);
		this._startBarrier = new Barrier();
	}

	async start(): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined> {
		// Fetch the environment to check shell permissions
		const env = await this._remoteAgentService.getEnvironment();
		if (!env) {
			// Extension host processes are only allowed in remote extension hosts currently
			throw new Error('Could not fetch remote environment');
		}

		this._logService.trace('Spawning remote agent process', { terminalId: this.id });

		const startResult = await this._remoteTerminalChannel.start(this.id);

		if (startResult && 'message' in startResult) {
			// An error occurred
			return startResult;
		}

		this._startBarrier.open();
		return startResult;
	}

	async detach(forcePersist?: boolean): Promise<void> {
		await this._startBarrier.wait();
		return this._remoteTerminalChannel.detachFromProcess(this.id, forcePersist);
	}

	shutdown(immediate: boolean): void {
		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.shutdown(this.id, immediate);
		});
	}

	input(data: string): void {
		if (this._inReplay) {
			return;
		}

		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.input(this.id, data);
		});
	}

	sendSignal(signal: string): void {
		if (this._inReplay) {
			return;
		}

		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.sendSignal(this.id, signal);
		});
	}

	processBinary(e: string): Promise<void> {
		return this._remoteTerminalChannel.processBinary(this.id, e);
	}

	resize(cols: number, rows: number): void {
		if (this._inReplay || this._lastDimensions.cols === cols && this._lastDimensions.rows === rows) {
			return;
		}
		this._startBarrier.wait().then(_ => {
			this._lastDimensions.cols = cols;
			this._lastDimensions.rows = rows;
			this._remoteTerminalChannel.resize(this.id, cols, rows);
		});
	}

	async clearBuffer(): Promise<void> {
		await this._remoteTerminalChannel.clearBuffer(this.id);
	}

	freePortKillProcess(port: string): Promise<{ port: string; processId: string }> {
		if (!this._remoteTerminalChannel.freePortKillProcess) {
			throw new Error('freePortKillProcess does not exist on the local pty service');
		}
		return this._remoteTerminalChannel.freePortKillProcess(port);
	}

	acknowledgeDataEvent(charCount: number): void {
		// Support flow control for server spawned processes
		if (this._inReplay) {
			return;
		}

		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.acknowledgeDataEvent(this.id, charCount);
		});
	}

	async setUnicodeVersion(version: '6' | '11'): Promise<void> {
		return this._remoteTerminalChannel.setUnicodeVersion(this.id, version);
	}

	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		return this._remoteTerminalChannel.refreshProperty(this.id, type);
	}

	async updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._remoteTerminalChannel.updateProperty(this.id, type, value);
	}

	handleOrphanQuestion() {
		this._remoteTerminalChannel.orphanQuestionReply(this.id);
	}
}
