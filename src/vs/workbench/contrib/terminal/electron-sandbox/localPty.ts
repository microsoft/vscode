/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IProcessDataEvent, ITerminalChildProcess, ITerminalLaunchError, IProcessProperty, IProcessPropertyMap, ProcessPropertyType, IProcessReadyEvent, IPtyService } from 'vs/platform/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
import { IPtyHostProcessReplayEvent, ISerializedCommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { mark } from 'vs/base/common/performance';

/**
 * Responsible for establishing and maintaining a connection with an existing terminal process
 * created on the local pty host.
 */
export class LocalPty extends Disposable implements ITerminalChildProcess {
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

	private readonly _onProcessData = this._register(new Emitter<IProcessDataEvent | string>());
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
		private readonly _proxy: IPtyService
	) {
		super();
	}

	start(): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined> {
		return this._proxy.start(this.id);
	}
	detach(forcePersist?: boolean): Promise<void> {
		return this._proxy.detachFromProcess(this.id, forcePersist);
	}
	shutdown(immediate: boolean): void {
		this._proxy.shutdown(this.id, immediate);
	}
	async processBinary(data: string): Promise<void> {
		if (this._inReplay) {
			return;
		}
		return this._proxy.processBinary(this.id, data);
	}
	input(data: string): void {
		if (this._inReplay) {
			return;
		}
		this._proxy.input(this.id, data);
	}
	resize(cols: number, rows: number): void {
		if (this._inReplay || this._lastDimensions.cols === cols && this._lastDimensions.rows === rows) {
			return;
		}
		this._lastDimensions.cols = cols;
		this._lastDimensions.rows = rows;
		this._proxy.resize(this.id, cols, rows);
	}
	async clearBuffer(): Promise<void> {
		this._proxy.clearBuffer?.(this.id);
	}
	freePortKillProcess(port: string): Promise<{ port: string; processId: string }> {
		if (!this._proxy.freePortKillProcess) {
			throw new Error('freePortKillProcess does not exist on the local pty service');
		}
		return this._proxy.freePortKillProcess(port);
	}
	async getInitialCwd(): Promise<string> {
		return this._properties.initialCwd;
	}
	async getCwd(): Promise<string> {
		return this._properties.cwd || this._properties.initialCwd;
	}
	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		return this._proxy.refreshProperty(this.id, type);
	}
	async updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._proxy.updateProperty(this.id, type, value);
	}
	acknowledgeDataEvent(charCount: number): void {
		if (this._inReplay) {
			return;
		}
		this._proxy.acknowledgeDataEvent(this.id, charCount);
	}
	setUnicodeVersion(version: '6' | '11'): Promise<void> {
		return this._proxy.setUnicodeVersion(this.id, version);
	}

	handleData(e: string | IProcessDataEvent) {
		this._onProcessData.fire(e);
	}
	handleExit(e: number | undefined) {
		this._onProcessExit.fire(e);
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
		this._proxy.orphanQuestionReply(this.id);
	}
}
