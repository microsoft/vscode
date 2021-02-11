/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IShellLaunchConfig, ITerminalLaunchError, ITerminalChildProcess, ITerminalDimensionsOverride, IProcessDataEvent } from 'vs/workbench/contrib/terminal/common/terminal';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';

/**
 * Responsible for establishing and maintaining a connection with an existing terminal process
 * created on the local pty host.
 */
export class LocalPty extends Disposable implements ITerminalChildProcess {
	private readonly _onProcessData = this._register(new Emitter<IProcessDataEvent | string>());
	public readonly onProcessData: Event<IProcessDataEvent | string> = this._onProcessData.event;
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

	constructor(
		private readonly _localPtyId: number,
		@ILocalPtyService private readonly _localPtyService: ILocalPtyService
	) {
		super();
		this._localPtyService.onProcessData(e => e.id === this._localPtyId && this._onProcessData.fire(e.event));
		this._localPtyService.onProcessExit(e => e.id === this._localPtyId && this._onProcessExit.fire(e.event));
		this._localPtyService.onProcessReady(e => e.id === this._localPtyId && this._onProcessReady.fire(e.event));
		this._localPtyService.onProcessTitleChanged(e => e.id === this._localPtyId && this._onProcessTitleChanged.fire(e.event));
		this._localPtyService.onProcessOverrideDimensions(e => e.id === this._localPtyId && this._onProcessOverrideDimensions.fire(e.event));
		this._localPtyService.onProcessResolvedShellLaunchConfig(e => e.id === this._localPtyId && this._onProcessResolvedShellLaunchConfig.fire(e.event));
		if (this._localPtyService.onPtyHostExit) {
			this._localPtyService.onPtyHostExit(() => {
				this._onProcessExit.fire(undefined);
			});
		}
	}

	start(): Promise<ITerminalLaunchError | { remoteTerminalId: number; } | undefined> {
		return this._localPtyService.start(this._localPtyId);
	}

	shutdown(immediate: boolean): void {
		this._localPtyService.shutdown(this._localPtyId, immediate);
	}

	input(data: string): void {
		this._localPtyService.input(this._localPtyId, data);
	}

	resize(cols: number, rows: number): void {
		this._localPtyService.resize(this._localPtyId, cols, rows);
	}

	acknowledgeDataEvent(charCount: number): void {
		this._localPtyService.acknowledgeDataEvent(this._localPtyId, charCount);
	}

	getInitialCwd(): Promise<string> {
		return this._localPtyService.getInitialCwd(this._localPtyId);
	}

	getCwd(): Promise<string> {
		return this._localPtyService.getCwd(this._localPtyId);
	}

	getLatency(): Promise<number> {
		return this._localPtyService.getLatency(this._localPtyId);
	}
}
