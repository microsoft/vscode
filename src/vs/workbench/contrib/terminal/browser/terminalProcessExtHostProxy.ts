/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensions, ITerminalDimensionsOverride, ITerminalLaunchError, TerminalShellType } from 'vs/platform/terminal/common/terminal';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalProcessExtHostProxy } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalProcessExtHostProxy extends Disposable implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	readonly id = 0;
	readonly shouldPersist = false;

	private readonly _onProcessData = this._register(new Emitter<string>());
	public readonly onProcessData: Event<string> = this._onProcessData.event;
	private readonly _onProcessExit = this._register(new Emitter<number | undefined>());
	public readonly onProcessExit: Event<number | undefined> = this._onProcessExit.event;
	private readonly _onProcessReady = this._register(new Emitter<{ pid: number, cwd: string }>());
	public get onProcessReady(): Event<{ pid: number, cwd: string }> { return this._onProcessReady.event; }
	private readonly _onProcessTitleChanged = this._register(new Emitter<string>());
	public readonly onProcessTitleChanged: Event<string> = this._onProcessTitleChanged.event;
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<ITerminalDimensionsOverride | undefined>());
	public get onProcessOverrideDimensions(): Event<ITerminalDimensionsOverride | undefined> { return this._onProcessOverrideDimensions.event; }
	private readonly _onProcessResolvedShellLaunchConfig = this._register(new Emitter<IShellLaunchConfig>());
	public get onProcessResolvedShellLaunchConfig(): Event<IShellLaunchConfig> { return this._onProcessResolvedShellLaunchConfig.event; }

	private readonly _onStart = this._register(new Emitter<void>());
	public readonly onStart: Event<void> = this._onStart.event;
	private readonly _onInput = this._register(new Emitter<string>());
	public readonly onInput: Event<string> = this._onInput.event;
	private readonly _onBinary = this._register(new Emitter<string>());
	public readonly onBinary: Event<string> = this._onBinary.event;
	private readonly _onResize: Emitter<{ cols: number, rows: number }> = this._register(new Emitter<{ cols: number, rows: number }>());
	public readonly onResize: Event<{ cols: number, rows: number }> = this._onResize.event;
	private readonly _onAcknowledgeDataEvent = this._register(new Emitter<number>());
	public readonly onAcknowledgeDataEvent: Event<number> = this._onAcknowledgeDataEvent.event;
	private readonly _onShutdown = this._register(new Emitter<boolean>());
	public readonly onShutdown: Event<boolean> = this._onShutdown.event;
	private readonly _onRequestInitialCwd = this._register(new Emitter<void>());
	public readonly onRequestInitialCwd: Event<void> = this._onRequestInitialCwd.event;
	private readonly _onRequestCwd = this._register(new Emitter<void>());
	public readonly onRequestCwd: Event<void> = this._onRequestCwd.event;
	private readonly _onRequestLatency = this._register(new Emitter<void>());
	public readonly onRequestLatency: Event<void> = this._onRequestLatency.event;
	private readonly _onProcessShellTypeChanged = this._register(new Emitter<TerminalShellType>());
	public readonly onProcessShellTypeChanged = this._onProcessShellTypeChanged.event;


	private _pendingInitialCwdRequests: ((value: string | PromiseLike<string>) => void)[] = [];
	private _pendingCwdRequests: ((value: string | PromiseLike<string>) => void)[] = [];
	private _pendingLatencyRequests: ((value: number | PromiseLike<number>) => void)[] = [];

	constructor(
		public instanceId: number,
		private _cols: number,
		private _rows: number,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}

	public emitData(data: string): void {
		this._onProcessData.fire(data);
	}

	public emitTitle(title: string): void {
		this._onProcessTitleChanged.fire(title);
	}

	public emitReady(pid: number, cwd: string): void {
		this._onProcessReady.fire({ pid, cwd });
	}

	public emitExit(exitCode: number | undefined): void {
		this._onProcessExit.fire(exitCode);
		this.dispose();
	}

	public emitOverrideDimensions(dimensions: ITerminalDimensions | undefined): void {
		this._onProcessOverrideDimensions.fire(dimensions);
	}

	public emitResolvedShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig): void {
		this._onProcessResolvedShellLaunchConfig.fire(shellLaunchConfig);
	}

	public emitInitialCwd(initialCwd: string): void {
		while (this._pendingInitialCwdRequests.length > 0) {
			this._pendingInitialCwdRequests.pop()!(initialCwd);
		}
	}

	public emitCwd(cwd: string): void {
		while (this._pendingCwdRequests.length > 0) {
			this._pendingCwdRequests.pop()!(cwd);
		}
	}

	public emitLatency(latency: number): void {
		while (this._pendingLatencyRequests.length > 0) {
			this._pendingLatencyRequests.pop()!(latency);
		}
	}

	public async start(): Promise<ITerminalLaunchError | undefined> {
		return this._terminalService.requestStartExtensionTerminal(this, this._cols, this._rows);
	}

	public shutdown(immediate: boolean): void {
		this._onShutdown.fire(immediate);
	}

	public input(data: string): void {
		this._onInput.fire(data);
	}

	public resize(cols: number, rows: number): void {
		this._onResize.fire({ cols, rows });
	}

	public acknowledgeDataEvent(): void {
		// Flow control is disabled for extension terminals
	}

	public async processBinary(data: string): Promise<void> {
		// Disabled for extension terminals
		this._onBinary.fire(data);
	}

	public getInitialCwd(): Promise<string> {
		return new Promise<string>(resolve => {
			this._onRequestInitialCwd.fire();
			this._pendingInitialCwdRequests.push(resolve);
		});
	}

	public getCwd(): Promise<string> {
		return new Promise<string>(resolve => {
			this._onRequestCwd.fire();
			this._pendingCwdRequests.push(resolve);
		});
	}

	public getLatency(): Promise<number> {
		return new Promise<number>(resolve => {
			this._onRequestLatency.fire();
			this._pendingLatencyRequests.push(resolve);
		});
	}
}
