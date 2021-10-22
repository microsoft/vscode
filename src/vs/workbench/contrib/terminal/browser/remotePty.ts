/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IProcessDataEvent, IProcessReadyEvent, IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensionsOverride, ITerminalLaunchError, IProcessProperty, IProcessPropertyMap, ProcessPropertyType, TerminalShellType, ProcessCapability } from 'vs/platform/terminal/common/terminal';
import { IPtyHostProcessReplayEvent } from 'vs/platform/terminal/common/terminalProcess';
import { RemoteTerminalChannelClient } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class RemotePty extends Disposable implements ITerminalChildProcess {
	private readonly _onProcessData = this._register(new Emitter<string | IProcessDataEvent>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessExit = this._register(new Emitter<number | undefined>());
	readonly onProcessExit = this._onProcessExit.event;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessTitleChanged = this._register(new Emitter<string>());
	readonly onProcessTitleChanged = this._onProcessTitleChanged.event;
	private readonly _onProcessShellTypeChanged = this._register(new Emitter<TerminalShellType | undefined>());
	readonly onProcessShellTypeChanged = this._onProcessShellTypeChanged.event;
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<ITerminalDimensionsOverride | undefined>());
	readonly onProcessOverrideDimensions = this._onProcessOverrideDimensions.event;
	private readonly _onProcessResolvedShellLaunchConfig = this._register(new Emitter<IShellLaunchConfig>());
	readonly onProcessResolvedShellLaunchConfig = this._onProcessResolvedShellLaunchConfig.event;
	private readonly _onDidChangeHasChildProcesses = this._register(new Emitter<boolean>());
	readonly onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<IProcessProperty<any>>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;

	private _startBarrier: Barrier;

	private _inReplay = false;

	private _properties: IProcessPropertyMap = {
		cwd: '',
		initialCwd: '',
		fixedDimensions: { cols: undefined, rows: undefined }
	};

	private _capabilities: ProcessCapability[] = [];
	get capabilities(): ProcessCapability[] { return this._capabilities; }

	get id(): number { return this._id; }

	constructor(
		private _id: number,
		readonly shouldPersist: boolean,
		private readonly _remoteTerminalChannel: RemoteTerminalChannelClient,
		private readonly _remoteAgentService: IRemoteAgentService,
		private readonly _logService: ILogService
	) {
		super();
		this._startBarrier = new Barrier();
	}

	async start(): Promise<ITerminalLaunchError | undefined> {
		// Fetch the environment to check shell permissions
		const env = await this._remoteAgentService.getEnvironment();
		if (!env) {
			// Extension host processes are only allowed in remote extension hosts currently
			throw new Error('Could not fetch remote environment');
		}

		this._logService.trace('Spawning remote agent process', { terminalId: this._id });

		const startResult = await this._remoteTerminalChannel.start(this._id);

		if (typeof startResult !== 'undefined') {
			// An error occurred
			return startResult;
		}

		this._startBarrier.open();
		return undefined;
	}

	async detach(): Promise<void> {
		await this._startBarrier.wait();
		return this._remoteTerminalChannel.detachFromProcess(this.id);
	}

	shutdown(immediate: boolean): void {
		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.shutdown(this._id, immediate);
		});
	}

	input(data: string): void {
		if (this._inReplay) {
			return;
		}

		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.input(this._id, data);
		});
	}

	resize(cols: number, rows: number): void {
		if (this._inReplay) {
			return;
		}
		this._startBarrier.wait().then(_ => {

			this._remoteTerminalChannel.resize(this._id, cols, rows);
		});
	}

	acknowledgeDataEvent(charCount: number): void {
		// Support flow control for server spawned processes
		if (this._inReplay) {
			return;
		}

		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.acknowledgeDataEvent(this._id, charCount);
		});
	}

	async setUnicodeVersion(version: '6' | '11'): Promise<void> {
		return this._remoteTerminalChannel.setUnicodeVersion(this._id, version);
	}

	async getInitialCwd(): Promise<string> {
		return this._properties.initialCwd;
	}

	async getCwd(): Promise<string> {
		return this._properties.cwd || this._properties.initialCwd;
	}

	async refreshProperty<T extends ProcessPropertyType>(type: ProcessPropertyType): Promise<IProcessPropertyMap[T]> {
		return this._remoteTerminalChannel.refreshProperty(this._id, type);
	}

	async updateProperty<T extends ProcessPropertyType>(type: ProcessPropertyType, value: IProcessPropertyMap[T]): Promise<any> {
		return this._remoteTerminalChannel.updateProperty(this._id, type, value);
	}

	handleData(e: string | IProcessDataEvent) {
		this._onProcessData.fire(e);
	}
	processBinary(e: string): Promise<void> {
		return this._remoteTerminalChannel.processBinary(this._id, e);
	}
	handleExit(e: number | undefined) {
		this._onProcessExit.fire(e);
	}
	handleReady(e: IProcessReadyEvent) {
		this._capabilities = e.capabilities;
		this._onProcessReady.fire(e);
	}
	handleTitleChanged(e: string) {
		this._onProcessTitleChanged.fire(e);
	}
	handleShellTypeChanged(e: TerminalShellType | undefined) {
		this._onProcessShellTypeChanged.fire(e);
	}
	handleOverrideDimensions(e: ITerminalDimensionsOverride | undefined) {
		this._onProcessOverrideDimensions.fire(e);
	}
	handleResolvedShellLaunchConfig(e: IShellLaunchConfig) {
		// Revive the cwd URI
		if (e.cwd && typeof e.cwd !== 'string') {
			e.cwd = URI.revive(e.cwd);
		}
		this._onProcessResolvedShellLaunchConfig.fire(e);
	}
	handleDidChangeHasChildProcesses(e: boolean) {
		this._onDidChangeHasChildProcesses.fire(e);
	}
	handleDidChangeProperty(e: IProcessProperty<any>) {
		if (e.type === ProcessPropertyType.Cwd) {
			this._properties.cwd = e.value;
		} else if (e.type === ProcessPropertyType.InitialCwd) {
			this._properties.initialCwd = e.value;
		}
		this._onDidChangeProperty.fire(e);
	}

	async handleReplay(e: IPtyHostProcessReplayEvent) {
		try {
			this._inReplay = true;
			for (const innerEvent of e.events) {
				if (innerEvent.cols !== 0 || innerEvent.rows !== 0) {
					// never override with 0x0 as that is a marker for an unknown initial size
					this._onProcessOverrideDimensions.fire({ cols: innerEvent.cols, rows: innerEvent.rows, forceExactSize: true });
				}
				const e: IProcessDataEvent = { data: innerEvent.data, trackCommit: true };
				this._onProcessData.fire(e);
				await e.writePromise;
			}
		} finally {
			this._inReplay = false;
		}

		// remove size override
		this._onProcessOverrideDimensions.fire(undefined);
	}

	handleOrphanQuestion() {
		this._remoteTerminalChannel.orphanQuestionReply(this._id);
	}

	async getLatency(): Promise<number> {
		return 0;
	}
}
