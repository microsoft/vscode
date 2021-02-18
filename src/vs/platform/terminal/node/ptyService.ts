/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IPtyService, IProcessDataEvent, IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensionsOverride, ITerminalLaunchError } from 'vs/platform/terminal/common/terminal';
import { TerminalProcess } from 'vs/platform/terminal/node/terminalProcess';
import { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';

// TODO: On disconnect/restart, this will overwrite the older terminals
let currentPtyId = 0;

export class PtyService extends Disposable implements IPtyService {
	declare readonly _serviceBrand: undefined;

	private readonly _ptys: Map<number, ITerminalChildProcess> = new Map();

	private readonly _onHeartbeat = this._register(new Emitter<void>());
	readonly onHeartbeat = this._onHeartbeat.event;

	private readonly _onProcessData = this._register(new Emitter<{ id: number, event: IProcessDataEvent | string }>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessExit = this._register(new Emitter<{ id: number, event: number | undefined }>());
	readonly onProcessExit = this._onProcessExit.event;
	private readonly _onProcessReady = this._register(new Emitter<{ id: number, event: { pid: number, cwd: string } }>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessTitleChanged = this._register(new Emitter<{ id: number, event: string }>());
	readonly onProcessTitleChanged = this._onProcessTitleChanged.event;
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<{ id: number, event: ITerminalDimensionsOverride | undefined }>());
	readonly onProcessOverrideDimensions = this._onProcessOverrideDimensions.event;
	private readonly _onProcessResolvedShellLaunchConfig = this._register(new Emitter<{ id: number, event: IShellLaunchConfig }>());
	readonly onProcessResolvedShellLaunchConfig = this._onProcessResolvedShellLaunchConfig.event;

	constructor(
		private readonly _logService: ILogService
	) {
		super();
	}

	dispose() {
		for (const pty of this._ptys.values()) {
			pty.shutdown(true);
		}
		this._ptys.clear();
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean): Promise<number> {
		const id = ++currentPtyId;
		const process = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, windowsEnableConpty, this._logService);
		process.onProcessData(event => this._onProcessData.fire({ id, event }));
		process.onProcessExit(event => this._onProcessExit.fire({ id, event }));
		process.onProcessReady(event => this._onProcessReady.fire({ id, event }));
		process.onProcessTitleChanged(event => this._onProcessTitleChanged.fire({ id, event }));
		if (process.onProcessOverrideDimensions) {
			process.onProcessOverrideDimensions(event => this._onProcessOverrideDimensions.fire({ id, event }));
		}
		if (process.onProcessResolvedShellLaunchConfig) {
			process.onProcessResolvedShellLaunchConfig(event => this._onProcessResolvedShellLaunchConfig.fire({ id, event }));
		}
		this._ptys.set(id, process);
		return id;
	}

	async shutdownAll(): Promise<void> {
		this.dispose();
	}

	async start(id: number): Promise<ITerminalLaunchError | { remoteTerminalId: number; } | undefined> {
		return this._throwIfNoPty(id).start();
	}

	async shutdown(id: number, immediate: boolean): Promise<void> {
		return this._throwIfNoPty(id).shutdown(immediate);
	}

	async input(id: number, data: string): Promise<void> {
		return this._throwIfNoPty(id).input(data);
	}

	async resize(id: number, cols: number, rows: number): Promise<void> {
		return this._throwIfNoPty(id).resize(cols, rows);
	}

	async acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._throwIfNoPty(id).acknowledgeDataEvent(charCount);
	}

	async getInitialCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getInitialCwd();
	}

	async getCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getCwd();
	}

	async getLatency(id: number): Promise<number> {
		return this._throwIfNoPty(id).getLatency();
	}

	private _throwIfNoPty(id: number): ITerminalChildProcess {
		const pty = this._ptys.get(id);
		if (!pty) {
			throw new Error(`Could not find pty with id "${id}"`);
		}
		return pty;
	}
}
