/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ILocalPtyService, IProcessDataEvent, IShellLaunchConfig, ITerminalDimensionsOverride, ITerminalLaunchError } from 'vs/platform/terminal/common/terminal';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { FileAccess } from 'vs/base/common/network';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { Emitter, Event } from 'vs/base/common/event';

export class LocalPtyService extends Disposable implements ILocalPtyService {
	declare readonly _serviceBrand: undefined;

	// ProxyChannel is not used here because events get lost when forwarding across multiple proxies
	private readonly _proxy: ILocalPtyService;

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
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._logService.info('Create pty host process');
		const client = this._register(new Client(
			FileAccess.asFileUri('bootstrap-fork', require).fsPath,
			{
				serverName: 'Pty Host',
				args: ['--type=ptyHost'],
				env: {
					VSCODE_AMD_ENTRYPOINT: 'vs/platform/terminal/node/ptyHost/ptyHostMain',
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true' // transmit console logs from server to client
				}
			}
		));
		this._register(client.onDidProcessExit(e => {
			this._logService.info('ptyHost exit', e);
			// 	// our watcher app should never be completed because it keeps on watching. being in here indicates
			// 	// that the watcher process died and we want to restart it here. we only do it a max number of times
			// 	if (!this.isDisposed) {
			// 		if (this.restartCounter <= FileWatcher.MAX_RESTARTS) {
			// 			this.error('terminated unexpectedly and is restarted again...');
			// 			this.restartCounter++;
			// 			this.startWatching();
			// 		} else {
			// 			this.error('failed to start after retrying for some time, giving up. Please report this as a bug report!');
			// 		}
			// 	}
		}));

		this._proxy = ProxyChannel.toService(client.getChannel('ptyHost'));
		this._register(this._proxy.onProcessData(e => this._onProcessData.fire(e)));
		this._register(this._proxy.onProcessExit(e => this._.onProcessExit.fire(e)));
		this._register(this._proxy.onProcessReady(e => this._onProcessReady.fire(e)));
		this._register(this._proxy.onProcessTitleChanged(e => this._onProcessTitleChanged.fire(e)));
		this._register(this._proxy.onProcessOverrideDimensions(e => this._onProcessOverrideDimensions.fire(e)));
		this._register(this._proxy.onProcessResolvedShellLaunchConfig(e => this._onProcessResolvedShellLaunchConfig.fire(e)));
	}
	createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean): Promise<number> {
		return this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, windowsEnableConpty);
	}
	start(id: number): Promise<ITerminalLaunchError | { remoteTerminalId: number; } | undefined> {
		return this._proxy.start(id);
	}
	shutdown(id: number, immediate: boolean): Promise<void> {
		return this._proxy.shutdown(id, immediate);
	}
	input(id: number, data: string): Promise<void> {
		return this._proxy.input(id, data);
	}
	resize(id: number, cols: number, rows: number): Promise<void> {
		return this._proxy.resize(id, cols, rows);
	}
	acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._proxy.acknowledgeDataEvent(id, charCount);
	}
	getInitialCwd(id: number): Promise<string> {
		return this._proxy.getInitialCwd(id);
	}
	getCwd(id: number): Promise<string> {
		return this._proxy.getCwd(id);
	}
	getLatency(id: number): Promise<number> {
		return this._proxy.getLatency(id);
	}
}
