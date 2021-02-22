/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { IProcessDataEvent, IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensionsOverride, ITerminalLaunchError } from 'vs/platform/terminal/common/terminal';
import { IPtyHostProcessReplayEvent } from 'vs/platform/terminal/common/terminalProcess';

/**
 * Responsible for establishing and maintaining a connection with an existing terminal process
 * created on the local pty host.
 */
export class LocalPty extends Disposable implements ITerminalChildProcess {
	private _inReplay = false;

	private readonly _onProcessData = this._register(new Emitter<IProcessDataEvent | string>());
	public readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReplay = this._register(new Emitter<IPtyHostProcessReplayEvent>());
	public readonly onProcessReplay = this._onProcessReplay.event;
	private readonly _onProcessExit = this._register(new Emitter<number | undefined>());
	public readonly onProcessExit = this._onProcessExit.event;
	private readonly _onProcessReady = this._register(new Emitter<{ pid: number, cwd: string }>());
	public readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessTitleChanged = this._register(new Emitter<string>());
	public readonly onProcessTitleChanged = this._onProcessTitleChanged.event;
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<ITerminalDimensionsOverride | undefined>());
	public readonly onProcessOverrideDimensions = this._onProcessOverrideDimensions.event;
	private readonly _onProcessResolvedShellLaunchConfig = this._register(new Emitter<IShellLaunchConfig>());
	public readonly onProcessResolvedShellLaunchConfig = this._onProcessResolvedShellLaunchConfig.event;

	constructor(
		readonly id: number,
		@ILocalPtyService private readonly _localPtyService: ILocalPtyService
	) {
		super();
		this._localPtyService.onProcessData(e => e.id === this.id && this._onProcessData.fire(e.event));
		this._localPtyService.onProcessExit(e => e.id === this.id && this._onProcessExit.fire(e.event));
		this._localPtyService.onProcessReady(e => e.id === this.id && this._onProcessReady.fire(e.event));
		this._localPtyService.onProcessTitleChanged(e => e.id === this.id && this._onProcessTitleChanged.fire(e.event));
		this._localPtyService.onProcessOverrideDimensions(e => e.id === this.id && this._onProcessOverrideDimensions.fire(e.event));
		this._localPtyService.onProcessResolvedShellLaunchConfig(e => e.id === this.id && this._onProcessResolvedShellLaunchConfig.fire(e.event));
		this._localPtyService.onProcessReplay(e => {
			if (e.id !== this.id) {
				return;
			}
			try {
				this._inReplay = true;

				for (const innerEvent of e.event.events) {
					if (innerEvent.cols !== 0 || innerEvent.rows !== 0) {
						// never override with 0x0 as that is a marker for an unknown initial size
						this._onProcessOverrideDimensions.fire({ cols: innerEvent.cols, rows: innerEvent.rows, forceExactSize: true });
					}
					this._onProcessData.fire({ data: innerEvent.data, sync: true });
				}
			} finally {
				this._inReplay = false;
			}

			// remove size override
			this._onProcessOverrideDimensions.fire(undefined);

			return;
		});

		if (this._localPtyService.onPtyHostExit) {
			this._localPtyService.onPtyHostExit(() => {
				this._onProcessExit.fire(undefined);
			});
		}
	}

	start(): Promise<ITerminalLaunchError | undefined> {
		return this._localPtyService.start(this.id);
	}
	shutdown(immediate: boolean): void {
		this._localPtyService.shutdown(this.id, immediate);
	}
	input(data: string): void {
		if (this._inReplay) {
			return;
		}
		this._localPtyService.input(this.id, data);
	}
	resize(cols: number, rows: number): void {
		if (this._inReplay) {
			return;
		}
		this._localPtyService.resize(this.id, cols, rows);
	}
	getInitialCwd(): Promise<string> {
		return this._localPtyService.getInitialCwd(this.id);
	}
	getCwd(): Promise<string> {
		return this._localPtyService.getCwd(this.id);
	}
	getLatency(): Promise<number> {
		// TODO: The idea here was to add the result plus the time it took to get the latency
		return this._localPtyService.getLatency(this.id);
	}
	acknowledgeDataEvent(charCount: number): void {
		if (this._inReplay) {
			return;
		}
		this._localPtyService.acknowledgeDataEvent(this.id, charCount);
	}
}
