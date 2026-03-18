/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { Client, IIPCOptions } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../environment/common/environment.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
import { IAgentHostConnection, IAgentHostStarter } from '../common/agent.js';

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
		@IEnvironmentService private readonly _environmentService: INativeEnvironmentService
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

	start(): IAgentHostConnection {
		const env: Record<string, string> = {
			VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true',
		};

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
}
