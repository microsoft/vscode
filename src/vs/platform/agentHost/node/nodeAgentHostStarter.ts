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
import { AgentHostByokModelsEnabledSettingId, AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentBinaryArgsSettingId, AgentHostCodexAgentEnabledSettingId, AgentHostCodexAgentSdkRootSettingId, AgentHostCodexAgentCodexHomeSettingId, AgentHostOTelCaptureContentSettingId, AgentHostOTelDbSpanExporterEnabledSettingId, AgentHostOTelEnabledSettingId, AgentHostOTelExporterTypeSettingId, AgentHostOTelOtlpEndpointSettingId, AgentHostOTelOtlpProtocolSettingId, AgentHostOTelOutfileSettingId, AgentHostOTelResourceAttributesSettingId, AgentHostOTelServiceNameSettingId, buildAgentHostOTelEnv, buildAgentSdkEnv } from '../common/agentService.js';
import '../common/agentHostStarter.config.contribution.js';

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

		// Forward the Claude/Codex SDK overrides + codex home/args from
		// workbench settings to the agent host process. Parent env wins on
		// collision — see `buildAgentSdkEnv` for the precedence rule.
		const sdkEnv = buildAgentSdkEnv({
			codexSdkRoot: this._configurationService.getValue<string>(AgentHostCodexAgentSdkRootSettingId),
			codexHome: this._configurationService.getValue<string>(AgentHostCodexAgentCodexHomeSettingId),
			codexBinaryArgs: this._configurationService.getValue<readonly string[]>(AgentHostCodexAgentBinaryArgsSettingId),
			claudeAgentEnabled: this._configurationService.getValue<boolean>(AgentHostClaudeAgentEnabledSettingId),
			codexAgentEnabled: this._configurationService.getValue<boolean>(AgentHostCodexAgentEnabledSettingId),
			byokModelsEnabled: this._configurationService.getValue<boolean>(AgentHostByokModelsEnabledSettingId),
		}, process.env);
		Object.assign(env, sdkEnv);

		// Translate `chat.agentHost.otel.*` settings into the env vars consumed by
		// the agent host process. Any value already present on `process.env` wins
		// for user settings, while enterprise policy values win over inherited env —
		// see `buildAgentHostOTelEnv`.
		const policyValue = <T>(key: string): T | undefined => this._configurationService.inspect<T>(key).policyValue;
		const otelEnv = buildAgentHostOTelEnv({
			enabled: this._configurationService.getValue<boolean>(AgentHostOTelEnabledSettingId),
			exporterType: this._configurationService.getValue<string>(AgentHostOTelExporterTypeSettingId),
			otlpEndpoint: this._configurationService.getValue<string>(AgentHostOTelOtlpEndpointSettingId),
			captureContent: this._configurationService.getValue<boolean>(AgentHostOTelCaptureContentSettingId),
			outfile: this._configurationService.getValue<string>(AgentHostOTelOutfileSettingId),
			dbSpanExporterEnabled: this._configurationService.getValue<boolean>(AgentHostOTelDbSpanExporterEnabledSettingId),
		}, process.env, {
			enabled: policyValue<boolean>(AgentHostOTelEnabledSettingId),
			exporterType: policyValue<string>(AgentHostOTelExporterTypeSettingId),
			otlpProtocol: policyValue<string>(AgentHostOTelOtlpProtocolSettingId),
			otlpEndpoint: policyValue<string>(AgentHostOTelOtlpEndpointSettingId),
			captureContent: policyValue<boolean>(AgentHostOTelCaptureContentSettingId),
			outfile: policyValue<string>(AgentHostOTelOutfileSettingId),
			serviceName: policyValue<string>(AgentHostOTelServiceNameSettingId),
			resourceAttributes: policyValue<Record<string, string>>(AgentHostOTelResourceAttributesSettingId),
		});
		Object.assign(env, otelEnv);

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

		const args = [
			'--type=agentHost',
			'--logsPath', this._environmentService.logsHome.with({ scheme: Schemas.file }).fsPath,
			'--user-data-dir', this._environmentService.userDataPath,
		];
		if (this._environmentService.disableTelemetry) {
			args.push('--disable-telemetry');
		}

		const opts: IIPCOptions = {
			serverName: 'Agent Host',
			args,
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
