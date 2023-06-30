/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { mark } from 'vs/base/common/performance';
import { URI } from 'vs/base/common/uri';
import { IPtyHostProcessReplayEvent, ISerializedCommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IProcessDataEvent, ITerminalChildProcess, ITerminalLaunchError, IProcessProperty, IProcessPropertyMap, ProcessPropertyType, IProcessReadyEvent, ITerminalLogService } from 'vs/platform/terminal/common/terminal';
import { RemoteTerminalChannelClient } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class RemotePty extends Disposable implements ITerminalChildProcess {
	private readonly _startBarrier: Barrier;
	private readonly _properties: IProcessPropertyMap = {
		cwd: '',
		initialCwd: '',
		fixedDimensions: { cols: undefined, rows: undefined },
		title: '',
		shellType: undefined,
		hasChildProcesses: true,
		resolvedShellLaunchConfig: {},
		overrideDimensions: undefined,
		failedShellIntegrationActivation: false,
		usedShellIntegrationInjection: undefined
	};
	private readonly _lastDimensions: { cols: number; rows: number } = { cols: -1, rows: -1 };

	private _inReplay = false;

	private readonly _onProcessData = this._register(new Emitter<string | IProcessDataEvent>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReplayComplete = this._register(new Emitter<void>());
	readonly onProcessReplayComplete = this._onProcessReplayComplete.event;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<IProcessProperty<any>>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;
	private readonly _onProcessExit = this._register(new Emitter<number | undefined>());
	readonly onProcessExit = this._onProcessExit.event;
	private readonly _onRestoreCommands = this._register(new Emitter<ISerializedCommandDetectionCapability>());
	readonly onRestoreCommands = this._onRestoreCommands.event;

	constructor(
		readonly id: number,
		readonly shouldPersist: boolean,
		private readonly _remoteTerminalChannel: RemoteTerminalChannelClient,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ITerminalLogService private readonly _logService: ITerminalLogService
	) {
		super();
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

	async getInitialCwd(): Promise<string> {
		return this._properties.initialCwd;
	}

	async getCwd(): Promise<string> {
		return this._properties.cwd || this._properties.initialCwd;
	}

	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		return this._remoteTerminalChannel.refreshProperty(this.id, type);
	}

	async updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._remoteTerminalChannel.updateProperty(this.id, type, value);
	}

	handleData(e: string | IProcessDataEvent) {
		this._onProcessData.fire(e);
	}
	handleExit(e: number | undefined) {
		this._onProcessExit.fire(e);
	}
	processBinary(e: string): Promise<void> {
		return this._remoteTerminalChannel.processBinary(this.id, e);
	}
	handleReady(e: IProcessReadyEvent) {
		this._onProcessReady.fire(e);
	}
	handleDidChangeProperty({ type, value }: IProcessProperty<any>) {
		switch (type) {
			case ProcessPropertyType.Cwd:
				this._properties.cwd = value;
				break;
			case ProcessPropertyType.InitialCwd:
				this._properties.initialCwd = value;
				break;
			case ProcessPropertyType.ResolvedShellLaunchConfig:
				if (value.cwd && typeof value.cwd !== 'string') {
					value.cwd = URI.revive(value.cwd);
				}
		}
		this._onDidChangeProperty.fire({ type, value });
	}

	async handleReplay(e: IPtyHostProcessReplayEvent) {
		mark(`code/terminal/willHandleReplay/${this.id}`);
		try {
			this._inReplay = true;
			for (const innerEvent of e.events) {
				if (innerEvent.cols !== 0 || innerEvent.rows !== 0) {
					// never override with 0x0 as that is a marker for an unknown initial size
					this._onDidChangeProperty.fire({ type: ProcessPropertyType.OverrideDimensions, value: { cols: innerEvent.cols, rows: innerEvent.rows, forceExactSize: true } });
				}
				const e: IProcessDataEvent = { data: innerEvent.data, trackCommit: true };
				this._onProcessData.fire(e);
				await e.writePromise;
			}
		} finally {
			this._inReplay = false;
		}

		if (e.commands) {
			this._onRestoreCommands.fire(e.commands);
		}

		// remove size override
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.OverrideDimensions, value: undefined });

		mark(`code/terminal/didHandleReplay/${this.id}`);
		this._onProcessReplayComplete.fire();
	}

	handleOrphanQuestion() {
		this._remoteTerminalChannel.orphanQuestionReply(this.id);
	}

	async getLatency(): Promise<number> {
		return 0;
	}
}
