/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { Client, IIPCOptions } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../environment/common/environment.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
import { ILogService } from '../../log/common/log.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { IAgentHostConnection, IAgentHostStarter } from '../common/agent.js';
import { AgentHostClaudeAgentEnabledSettingId, AgentHostEnableClaudeEnvVar } from '../common/agentService.js';

/**
 * Options for configuring the agent host WebSocket server in the child process.
 * When set, the agent host exposes a WebSocket endpoint for external clients.
 */
export interface IAgentHostWebSocketConfig {
	/** TCP port to listen on. Mutually exclusive with `socketPath`. */
	readonly port?: string;
	/** Unix domain socket / named pipe path. Takes precedence over `port`. */
	readonly socketPath?: string;
	/** Host/IP to bind to. */
	readonly host?: string;
	/** Connection token value. When set, WebSocket clients must present this token. */
	readonly connectionToken?: string;
}

/**
 * Spawns the agent host as a Node child process (fallback when
 * Electron utility process is unavailable, e.g. dev/test).
 */
export class NodeAgentHostStarter extends Disposable implements IAgentHostStarter {

	private _wsConfig: IAgentHostWebSocketConfig | undefined;

	private readonly _onRequestConnection = this._register(new Emitter<void>());
	readonly onRequestConnection = this._onRequestConnection.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	/**
	 * Configures the child process to also start a WebSocket server.
	 * Must be called before {@link start}. Triggers eager process start
	 * via {@link onRequestConnection}.
	 */
	setWebSocketConfig(config: IAgentHostWebSocketConfig): void {
		this._wsConfig = config;
		// Signal the process manager to start immediately rather than
		// waiting for a renderer window to connect.
		this._onRequestConnection.fire();
	}

	async start(): Promise<IAgentHostConnection> {
		// Resolve user shell environment so spawned tools/terminals inherit
		// PATH and other vars from the user's login shell (macOS/Linux).
		const shellEnv = await this._resolveShellEnv();

		const env: Record<string, string> = {
			...shellEnv as Record<string, string>,
			VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true',
		};

		// Gate optional providers via env vars consumed by `agentHostMain.ts`.
		// The Claude agent is opt-in: enabled when either the workbench setting is on
		// or the env var is already set on the parent process (developer override).
		if (this._configurationService.getValue<boolean>(AgentHostClaudeAgentEnabledSettingId)
			|| process.env[AgentHostEnableClaudeEnvVar] === '1') {
			env[AgentHostEnableClaudeEnvVar] = '1';
		}

		// Forward WebSocket server configuration to the child process via env vars
		if (this._wsConfig) {
			if (this._wsConfig.port) {
				env['VSCODE_AGENT_HOST_PORT'] = this._wsConfig.port;
			}
			if (this._wsConfig.socketPath) {
				env['VSCODE_AGENT_HOST_SOCKET_PATH'] = this._wsConfig.socketPath;
			}
			if (this._wsConfig.host) {
				env['VSCODE_AGENT_HOST_HOST'] = this._wsConfig.host;
			}
			if (this._wsConfig.connectionToken) {
				env['VSCODE_AGENT_HOST_CONNECTION_TOKEN'] = this._wsConfig.connectionToken;
			}
		}

		const opts: IIPCOptions = {
			serverName: 'Agent Host',
			args: ['--type=agentHost', '--logsPath', this._environmentService.logsHome.with({ scheme: Schemas.file }).fsPath],
			env,
		};

		const agentHostDebug = parseAgentHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
		if (agentHostDebug) {
			if (agentHostDebug.break && agentHostDebug.port) {
				opts.debugBrk = agentHostDebug.port;
			} else if (!agentHostDebug.break && agentHostDebug.port) {
				opts.debug = agentHostDebug.port;
			}
		}

		const client = new Client(FileAccess.asFileUri('bootstrap-fork').fsPath, opts);

		const store = new DisposableStore();
		store.add(client);

		return {
			client,
			store,
			onDidProcessExit: client.onDidProcessExit
		};
	}

	private async _resolveShellEnv(): Promise<typeof process.env> {
		try {
			return await getResolvedShellEnv(this._configurationService, this._logService, this._environmentService.args, process.env);
		} catch (error) {
			this._logService.error('AgentHostStarter was unable to resolve shell environment', error);
			return {};
		}
	}
}
