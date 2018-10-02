/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalChildProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { Event, Emitter } from 'vs/base/common/event';
import { ITerminalService, ITerminalProcessExtHostProxy, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class TerminalProcessExtHostProxy implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	private _disposables: IDisposable[] = [];

	private readonly _onProcessData: Emitter<string> = new Emitter<string>();
	public get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessExit: Emitter<number> = new Emitter<number>();
	public get onProcessExit(): Event<number> { return this._onProcessExit.event; }
	private readonly _onProcessIdReady: Emitter<number> = new Emitter<number>();
	public get onProcessIdReady(): Event<number> { return this._onProcessIdReady.event; }
	private readonly _onProcessTitleChanged: Emitter<string> = new Emitter<string>();
	public get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }

	private readonly _onInput: Emitter<string> = new Emitter<string>();
	public get onInput(): Event<string> { return this._onInput.event; }
	private readonly _onResize: Emitter<{ cols: number, rows: number }> = new Emitter<{ cols: number, rows: number }>();
	public get onResize(): Event<{ cols: number, rows: number }> { return this._onResize.event; }
	private readonly _onShutdown: Emitter<boolean> = new Emitter<boolean>();
	public get onShutdown(): Event<boolean> { return this._onShutdown.event; }

	constructor(
		public terminalId: number,
		shellLaunchConfig: IShellLaunchConfig,
		cols: number,
		rows: number,
		@ITerminalService private _terminalService: ITerminalService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		this._extensionService.whenInstalledExtensionsRegistered().then(() => {
			// TODO: MainThreadTerminalService is not ready at this point, fix this
			setTimeout(() => {
				this._terminalService.requestExtHostProcess(this, shellLaunchConfig, cols, rows);
			}, 0);
		});
	}

	public dispose(): void {
		this._disposables.forEach(d => d.dispose());
		this._disposables.length = 0;
	}

	public emitData(data: string): void {
		this._onProcessData.fire(data);
	}

	public emitTitle(title: string): void {
		this._onProcessTitleChanged.fire(title);
	}

	public emitPid(pid: number): void {
		this._onProcessIdReady.fire(pid);
	}

	public emitExit(exitCode: number): void {
		this._onProcessExit.fire(exitCode);
		this.dispose();
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
}