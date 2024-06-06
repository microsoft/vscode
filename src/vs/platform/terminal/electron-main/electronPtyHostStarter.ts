/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { parsePtyHostDebugPort } from 'vs/platform/environment/node/environmentService';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IReconnectConstants, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IPtyHostConnection, IPtyHostStarter } from 'vs/platform/terminal/node/ptyHost';
import { UtilityProcess } from 'vs/platform/utilityProcess/electron-main/utilityProcess';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/electron-main/ipc.mp';
import { IpcMainEvent } from 'electron';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { deepClone } from 'vs/base/common/objects';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Schemas } from 'vs/base/common/network';

export class ElectronPtyHostStarter extends Disposable implements IPtyHostStarter {

	private utilityProcess: UtilityProcess | undefined = undefined;

	private readonly _onRequestConnection = new Emitter<void>();
	readonly onRequestConnection = this._onRequestConnection.event;
	private readonly _onWillShutdown = new Emitter<void>();
	readonly onWillShutdown = this._onWillShutdown.event;

	constructor(
		private readonly _reconnectConstants: IReconnectConstants,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly _environmentMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly _lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._register(this._lifecycleMainService.onWillShutdown(() => this._onWillShutdown.fire()));
		// Listen for new windows to establish connection directly to pty host
		validatedIpcMain.on('vscode:createPtyHostMessageChannel', (e, nonce) => this._onWindowConnection(e, nonce));
		this._register(toDisposable(() => {
			validatedIpcMain.removeHandler('vscode:createPtyHostMessageChannel');
		}));
	}

	start(): IPtyHostConnection {
		this.utilityProcess = new UtilityProcess(this._logService, NullTelemetryService, this._lifecycleMainService);

		const inspectParams = parsePtyHostDebugPort(this._environmentMainService.args, this._environmentMainService.isBuilt);
		const execArgv = inspectParams.port ? [
			'--nolazy',
			`--inspect${inspectParams.break ? '-brk' : ''}=${inspectParams.port}`
		] : undefined;

		this.utilityProcess.start({
			type: 'ptyHost',
			entryPoint: 'vs/platform/terminal/node/ptyHostMain',
			execArgv,
			args: ['--logsPath', this._environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath],
			env: this._createPtyHostConfiguration()
		});

		const port = this.utilityProcess.connect();
		const client = new MessagePortClient(port, 'ptyHost');

		const store = new DisposableStore();
		store.add(client);
		store.add(toDisposable(() => {
			this.utilityProcess?.kill();
			this.utilityProcess?.dispose();
			this.utilityProcess = undefined;
		}));

		return {
			client,
			store,
			onDidProcessExit: this.utilityProcess.onExit
		};
	}

	private _createPtyHostConfiguration() {
		this._environmentMainService.unsetSnapExportedVariables();
		const config: { [key: string]: string } = {
			...deepClone(process.env),
			VSCODE_AMD_ENTRYPOINT: 'vs/platform/terminal/node/ptyHostMain',
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true', // transmit console logs from server to client,
			VSCODE_RECONNECT_GRACE_TIME: String(this._reconnectConstants.graceTime),
			VSCODE_RECONNECT_SHORT_GRACE_TIME: String(this._reconnectConstants.shortGraceTime),
			VSCODE_RECONNECT_SCROLLBACK: String(this._reconnectConstants.scrollback),
		};
		const simulatedLatency = this._configurationService.getValue(TerminalSettingId.DeveloperPtyHostLatency);
		if (simulatedLatency && typeof simulatedLatency === 'number') {
			config.VSCODE_LATENCY = String(simulatedLatency);
		}
		const startupDelay = this._configurationService.getValue(TerminalSettingId.DeveloperPtyHostStartupDelay);
		if (startupDelay && typeof startupDelay === 'number') {
			config.VSCODE_STARTUP_DELAY = String(startupDelay);
		}
		this._environmentMainService.restoreSnapExportedVariables();
		return config;
	}

	private _onWindowConnection(e: IpcMainEvent, nonce: string) {
		this._onRequestConnection.fire();

		const port = this.utilityProcess!.connect();

		// Check back if the requesting window meanwhile closed
		// Since shared process is delayed on startup there is
		// a chance that the window close before the shared process
		// was ready for a connection.

		if (e.sender.isDestroyed()) {
			port.close();
			return;
		}

		e.sender.postMessage('vscode:createPtyHostMessageChannelResult', nonce, [port]);
	}
}
