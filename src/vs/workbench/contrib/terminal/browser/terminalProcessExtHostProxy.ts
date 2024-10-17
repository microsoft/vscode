/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IProcessReadyEvent, IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensions, ITerminalLaunchError, IProcessProperty, ProcessPropertyType, IProcessPropertyMap } from '../../../../platform/terminal/common/terminal.js';
import { ITerminalService } from './terminal.js';
import { ITerminalProcessExtHostProxy } from '../common/terminal.js';

export class TerminalProcessExtHostProxy extends Disposable implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	readonly id = 0;
	readonly shouldPersist = false;

	private readonly _onProcessData = this._register(new Emitter<string>());
	readonly onProcessData: Event<string> = this._onProcessData.event;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	get onProcessReady(): Event<IProcessReadyEvent> { return this._onProcessReady.event; }

	private readonly _onStart = this._register(new Emitter<void>());
	readonly onStart: Event<void> = this._onStart.event;
	private readonly _onInput = this._register(new Emitter<string>());
	readonly onInput: Event<string> = this._onInput.event;
	private readonly _onBinary = this._register(new Emitter<string>());
	readonly onBinary: Event<string> = this._onBinary.event;
	private readonly _onResize: Emitter<{ cols: number; rows: number }> = this._register(new Emitter<{ cols: number; rows: number }>());
	readonly onResize: Event<{ cols: number; rows: number }> = this._onResize.event;
	private readonly _onAcknowledgeDataEvent = this._register(new Emitter<number>());
	readonly onAcknowledgeDataEvent: Event<number> = this._onAcknowledgeDataEvent.event;
	private readonly _onShutdown = this._register(new Emitter<boolean>());
	readonly onShutdown: Event<boolean> = this._onShutdown.event;
	private readonly _onRequestInitialCwd = this._register(new Emitter<void>());
	readonly onRequestInitialCwd: Event<void> = this._onRequestInitialCwd.event;
	private readonly _onRequestCwd = this._register(new Emitter<void>());
	readonly onRequestCwd: Event<void> = this._onRequestCwd.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<IProcessProperty<any>>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;
	private readonly _onProcessExit = this._register(new Emitter<number | undefined>());
	readonly onProcessExit: Event<number | undefined> = this._onProcessExit.event;

	private _pendingInitialCwdRequests: ((value: string | PromiseLike<string>) => void)[] = [];
	private _pendingCwdRequests: ((value: string | PromiseLike<string>) => void)[] = [];

	constructor(
		public instanceId: number,
		private _cols: number,
		private _rows: number,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}

	emitData(data: string): void {
		this._onProcessData.fire(data);
	}

	emitTitle(title: string): void {
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: title });
	}

	emitReady(pid: number, cwd: string): void {
		this._onProcessReady.fire({ pid, cwd, windowsPty: undefined });
	}

	emitProcessProperty({ type, value }: IProcessProperty<any>): void {
		switch (type) {
			case ProcessPropertyType.Cwd:
				this.emitCwd(value);
				break;
			case ProcessPropertyType.InitialCwd:
				this.emitInitialCwd(value);
				break;
			case ProcessPropertyType.Title:
				this.emitTitle(value);
				break;
			case ProcessPropertyType.OverrideDimensions:
				this.emitOverrideDimensions(value);
				break;
			case ProcessPropertyType.ResolvedShellLaunchConfig:
				this.emitResolvedShellLaunchConfig(value);
				break;
		}
	}

	emitExit(exitCode: number | undefined): void {
		this._onProcessExit.fire(exitCode);
		this.dispose();
	}

	emitOverrideDimensions(dimensions: ITerminalDimensions | undefined): void {
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.OverrideDimensions, value: dimensions });
	}

	emitResolvedShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig): void {
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.ResolvedShellLaunchConfig, value: shellLaunchConfig });
	}

	emitInitialCwd(initialCwd: string): void {
		while (this._pendingInitialCwdRequests.length > 0) {
			this._pendingInitialCwdRequests.pop()!(initialCwd);
		}
	}

	emitCwd(cwd: string): void {
		while (this._pendingCwdRequests.length > 0) {
			this._pendingCwdRequests.pop()!(cwd);
		}
	}

	async start(): Promise<ITerminalLaunchError | undefined> {
		return this._terminalService.requestStartExtensionTerminal(this, this._cols, this._rows);
	}

	shutdown(immediate: boolean): void {
		this._onShutdown.fire(immediate);
	}

	input(data: string): void {
		this._onInput.fire(data);
	}

	resize(cols: number, rows: number): void {
		this._onResize.fire({ cols, rows });
	}

	clearBuffer(): void | Promise<void> {
		// no-op
	}

	acknowledgeDataEvent(): void {
		// Flow control is disabled for extension terminals
	}

	async setUnicodeVersion(version: '6' | '11'): Promise<void> {
		// No-op
	}

	async processBinary(data: string): Promise<void> {
		// Disabled for extension terminals
		this._onBinary.fire(data);
	}

	getInitialCwd(): Promise<string> {
		return new Promise<string>(resolve => {
			this._onRequestInitialCwd.fire();
			this._pendingInitialCwdRequests.push(resolve);
		});
	}

	getCwd(): Promise<string> {
		return new Promise<string>(resolve => {
			this._onRequestCwd.fire();
			this._pendingCwdRequests.push(resolve);
		});
	}

	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<any> {
		// throws if called in extHostTerminalService
	}

	async updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		// throws if called in extHostTerminalService
	}
}
