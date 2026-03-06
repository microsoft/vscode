/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { deepClone } from '../../../base/common/objects.js';
import { IpcMainEvent } from 'electron';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/electron-main/ipc.mp.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { Schemas } from '../../../base/common/network.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import { IAgentHostConnection, IAgentHostStarter } from '../common/agent.js';

export class ElectronAgentHostStarter extends Disposable implements IAgentHostStarter {

	private utilityProcess: UtilityProcess | undefined = undefined;

	private readonly _onRequestConnection = this._register(new Emitter<void>());
	readonly onRequestConnection = this._onRequestConnection.event;
	private readonly _onWillShutdown = this._register(new Emitter<void>());
	readonly onWillShutdown = this._onWillShutdown.event;

	constructor(
		@IEnvironmentMainService private readonly _environmentMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly _lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._lifecycleMainService.onWillShutdown(() => this._onWillShutdown.fire()));

		// Listen for new windows to establish a direct MessagePort connection to the agent host
		const onWindowConnection = (e: IpcMainEvent, nonce: string) => this._onWindowConnection(e, nonce);
		validatedIpcMain.on('vscode:createAgentHostMessageChannel', onWindowConnection);
		this._register(toDisposable(() => {
			validatedIpcMain.removeListener('vscode:createAgentHostMessageChannel', onWindowConnection);
		}));
	}

	start(): IAgentHostConnection {
		this.utilityProcess = new UtilityProcess(this._logService, NullTelemetryService, this._lifecycleMainService);

		const inspectParams = parseAgentHostDebugPort(this._environmentMainService.args, this._environmentMainService.isBuilt);
		const execArgv = inspectParams.port ? [
			'--nolazy',
			`--inspect${inspectParams.break ? '-brk' : ''}=${inspectParams.port}`
		] : undefined;

		this.utilityProcess.start({
			type: 'agentHost',
			name: 'agent-host',
			entryPoint: 'vs/platform/agent/node/agentHostMain',
			execArgv,
			args: ['--logsPath', this._environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath],
			env: {
				...deepClone(process.env),
				VSCODE_ESM_ENTRYPOINT: 'vs/platform/agent/node/agentHostMain',
				VSCODE_PIPE_LOGGING: 'true',
				VSCODE_VERBOSE_LOGGING: 'true',
			}
		});

		const port = this.utilityProcess.connect();
		const client = new MessagePortClient(port, 'agentHost');

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
			onDidProcessExit: this.utilityProcess.onExit,
		};
	}

	private _onWindowConnection(e: IpcMainEvent, nonce: string): void {
		this._onRequestConnection.fire();

		if (!this.utilityProcess) {
			this._logService.error('AgentHostStarter: cannot create window connection, agent host process is not running');
			return;
		}

		const port = this.utilityProcess.connect();

		if (e.sender.isDestroyed()) {
			port.close();
			return;
		}

		e.sender.postMessage('vscode:createAgentHostMessageChannelResult', nonce, [port]);
	}
}
