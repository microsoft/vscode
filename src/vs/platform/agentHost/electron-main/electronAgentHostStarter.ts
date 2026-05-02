/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { IpcMainEvent } from 'electron';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/electron-main/ipc.mp.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { Schemas } from '../../../base/common/network.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import { IAgentHostConnection, IAgentHostStarter } from '../common/agent.js';
import { AgentHostClaudeAgentEnabledSettingId, AgentHostEnableClaudeEnvVar } from '../common/agentService.js';
import { deepClone } from '../../../base/common/objects.js';

export class ElectronAgentHostStarter extends Disposable implements IAgentHostStarter {

	private utilityProcess: UtilityProcess | undefined = undefined;
	private utilityProcessStarted: DeferredPromise<void> | undefined = undefined;

	private readonly _onRequestConnection = this._register(new Emitter<void>());
	readonly onRequestConnection = this._onRequestConnection.event;
	private readonly _onWillShutdown = this._register(new Emitter<void>());
	readonly onWillShutdown = this._onWillShutdown.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
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

	async start(): Promise<IAgentHostConnection> {
		this.utilityProcess = new UtilityProcess(this._logService, NullTelemetryService, this._lifecycleMainService);
		this.utilityProcessStarted = new DeferredPromise<void>();

		const inspectParams = parseAgentHostDebugPort(this._environmentMainService.args, this._environmentMainService.isBuilt);
		const execArgv = inspectParams.port ? [
			'--nolazy',
			`--inspect${inspectParams.break ? '-brk' : ''}=${inspectParams.port}`
		] : undefined;

		// Resolve user shell environment so spawned tools/terminals inherit
		// PATH and other vars from the user's login shell (macOS/Linux GUI launches).
		const shellEnv = await this._resolveShellEnv();

		// Gate optional providers via env vars consumed by `agentHostMain.ts`.
		// The Claude agent is opt-in: enabled when either the workbench setting is on
		// or the env var is already set on the parent process (developer override).
		const claudeEnabled = this._configurationService.getValue<boolean>(AgentHostClaudeAgentEnabledSettingId)
			|| process.env[AgentHostEnableClaudeEnvVar] === '1';

		this.utilityProcess.start({
			type: 'agentHost',
			name: 'agent-host',
			entryPoint: 'vs/platform/agentHost/node/agentHostMain',
			execArgv,
			args: [
				'--logsPath', this._environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
				'--user-data-dir', this._environmentMainService.userDataPath,
			],
			env: {
				...deepClone(process.env),
				...shellEnv,
				VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
				VSCODE_PIPE_LOGGING: 'true',
				VSCODE_VERBOSE_LOGGING: 'true',
				...(claudeEnabled ? { [AgentHostEnableClaudeEnvVar]: '1' } : {}),
			}
		});

		this.utilityProcessStarted.complete();

		const port = this.utilityProcess.connect();
		const client = new MessagePortClient(port, 'agentHost');

		const store = new DisposableStore();
		store.add(client);
		store.add(this.utilityProcess.onStderr(data => {
			if (this._isExpectedStderr(data)) {
				return;
			}
			this._logService.error(`[AgentHost:stderr] ${data}`);
		}));
		store.add(toDisposable(() => {
			this.utilityProcess?.kill();
			this.utilityProcess?.dispose();
			this.utilityProcess = undefined;
			this.utilityProcessStarted = undefined;
		}));

		return {
			client,
			store,
			onDidProcessExit: this.utilityProcess.onExit,
		};
	}

	private async _resolveShellEnv(): Promise<typeof process.env> {
		try {
			return await getResolvedShellEnv(this._configurationService, this._logService, this._environmentMainService.args, process.env);
		} catch (error) {
			this._logService.error('AgentHostStarter was unable to resolve shell environment', error);
			return {};
		}
	}

	private async _onWindowConnection(e: IpcMainEvent, nonce: string): Promise<void> {
		this._onRequestConnection.fire();

		// Wait for utilityProcess.start() to actually run before calling connect(),
		// otherwise the MessagePort posted via connect() is silently dropped.
		await this.utilityProcessStarted?.p;

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

	private static readonly _expectedStderrPatterns = [
		'Most NODE_OPTIONs are not supported in packaged apps',
		'Debugger listening on ws://',
		'For help, see: https://nodejs.org/en/docs/inspector',
		'ExperimentalWarning: SQLite is an experimental feature',
	];

	private _isExpectedStderr(data: string): boolean {
		return ElectronAgentHostStarter._expectedStderrPatterns.some(pattern => data.includes(pattern));
	}
}
