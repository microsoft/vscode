/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { IProcessEnvironment, isWindows } from '../../../base/common/platform.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client, IIPCOptions } from '../../../base/parts/ipc/node/ipc.cp.js';
import { AiAgentEnvValue, AiAgentEnvVar } from '../../chat/common/aiAgentEnv.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../environment/common/environment.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
import { ILogService } from '../../log/common/log.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentHostConnection, IAgentHostStarter } from '../common/agent.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar, telemetryLevelToAgentHostValue } from '../common/agentHostTelemetry.js';
import { AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentBinaryArgsSettingId, AgentHostCodexAgentEnabledSettingId, AgentHostCodexAgentSdkRootSettingId, AgentHostCodexAgentCodexHomeSettingId, AgentHostIpcChannels, AgentHostOTelCaptureContentSettingId, AgentHostOTelCaptureIdentitySettingId, AgentHostOTelDbSpanExporterEnabledSettingId, AgentHostOTelEnabledSettingId, AgentHostOTelExporterTypeSettingId, AgentHostOTelOtlpEndpointSettingId, AgentHostOTelOutfileSettingId, buildAgentHostOTelEnv, buildAgentSdkEnv, IAgentHostManagementService, readAgentHostOTelPolicySettings } from '../common/agentService.js';

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

/** Retains deletion markers so the IPC client's inherited environment cannot restore removed variables. */
function mergeAgentHostEnvironments(...environments: (Readonly<Record<string, string | null | undefined>> | undefined)[]): IProcessEnvironment {
	const result: IProcessEnvironment = {};
	const keys = new Map<string, string>();
	for (const environment of environments) {
		for (const [key, value] of Object.entries(environment ?? {})) {
			const normalizedKey = isWindows ? key.toUpperCase() : key;
			const actualKey = keys.get(normalizedKey) ?? key;
			keys.set(normalizedKey, actualKey);
			result[actualKey] = value ?? undefined;
		}
	}
	return result;
}

/**
 * Spawns the agent host as a Node child process (fallback when
 * Electron utility process is unavailable, e.g. dev/test).
 */
export class NodeAgentHostStarter extends Disposable implements IAgentHostStarter {

	private _wsConfig: IAgentHostWebSocketConfig | undefined;
	private _environment: IProcessEnvironment | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
	}

	/**
	 * Configures the child process to also start a WebSocket server.
	 * Must be called before {@link start}.
	 */
	setWebSocketConfig(config: IAgentHostWebSocketConfig): void {
		this._wsConfig = config;
	}

	/** Applies resolver overrides to subsequent launches without changing the server's environment. */
	setEnvironment(environment: Readonly<Record<string, string | null>>, debugEnvironment?: Readonly<Record<string, string | null>>): void {
		this._environment = mergeAgentHostEnvironments(debugEnvironment, environment);
	}

	async start(): Promise<IAgentHostConnection> {
		// Resolve user shell environment so spawned tools/terminals inherit
		// PATH and other vars from the user's login shell (macOS/Linux).
		const shellEnv = await this._resolveShellEnv();

		const env: IProcessEnvironment = {
			// Announce that everything spawned below this process is driven by
			// VS Code's agent, so `gh` inherits it. Set after the inherited
			// env so it wins.
			[AiAgentEnvVar]: AiAgentEnvValue,
			VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true',
			[AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeCLI,
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
		}, process.env);
		Object.assign(env, sdkEnv);

		// Translate `chat.agentHost.otel.*` settings into the env vars consumed by
		// the agent host process. Any value already present on `process.env` wins
		// for user settings, while enterprise policy values win over inherited env —
		// see `buildAgentHostOTelEnv`.
		const otelEnv = buildAgentHostOTelEnv({
			enabled: this._configurationService.getValue<boolean>(AgentHostOTelEnabledSettingId),
			exporterType: this._configurationService.getValue<string>(AgentHostOTelExporterTypeSettingId),
			otlpEndpoint: this._configurationService.getValue<string>(AgentHostOTelOtlpEndpointSettingId),
			captureContent: this._configurationService.getValue<boolean>(AgentHostOTelCaptureContentSettingId),
			captureIdentity: this._configurationService.getValue<boolean>(AgentHostOTelCaptureIdentitySettingId),
			outfile: this._configurationService.getValue<string>(AgentHostOTelOutfileSettingId),
			dbSpanExporterEnabled: this._configurationService.getValue<boolean>(AgentHostOTelDbSpanExporterEnabledSettingId),
		}, process.env, readAgentHostOTelPolicySettings(this._configurationService), shellEnv);
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
			'--telemetry-level', telemetryLevelToAgentHostValue(this._telemetryService.telemetryLevel),
		];

		const opts: IIPCOptions = {
			serverName: 'Agent Host',
			args,
			env: mergeAgentHostEnvironments(process.env, shellEnv, this._environment, env),
		};

		const agentHostDebug = parseAgentHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
		if (agentHostDebug) {
			if (agentHostDebug.break && agentHostDebug.port) {
				opts.debugBrk = agentHostDebug.port;
			} else if (!agentHostDebug.break && agentHostDebug.port) {
				opts.debug = agentHostDebug.port;
			}
		}

		await this._removeStaleSocket();

		const store = new DisposableStore();
		const client = store.add(this._createClient(opts));

		return {
			client,
			store,
			onDidProcessExit: client.onDidProcessExit,
			shutdown: () => ProxyChannel.toService<IAgentHostManagementService>(client.getChannel(AgentHostIpcChannels.Management)).shutdown(),
		};
	}

	protected _createClient(options: IIPCOptions): Client {
		return new Client(FileAccess.asFileUri('bootstrap-fork').fsPath, options);
	}

	/**
	 * Unix domain sockets outlive the process that bound them, so an agent host
	 * that crashed leaves its socket file behind and the replacement's `listen`
	 * fails with `EADDRINUSE` — which would burn the whole crash-restart budget
	 * without ever recovering. Windows named pipes are refcounted by the OS and
	 * disappear with the process, so they need no cleanup.
	 */
	private async _removeStaleSocket(): Promise<void> {
		const socketPath = this._wsConfig?.socketPath;
		if (!socketPath || process.platform === 'win32') {
			return;
		}

		try {
			await fs.promises.unlink(socketPath);
		} catch (error) {
			// Nothing to clean up in the common case; a genuinely undeletable
			// path surfaces as a bind failure from the child instead.
			if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
				this._logService.warn(`AgentHostStarter could not remove stale socket at ${socketPath}`, error);
			}
		}
	}

	protected async _resolveShellEnv(): Promise<typeof process.env> {
		try {
			return await getResolvedShellEnv(this._configurationService, this._logService, this._environmentService.args, process.env);
		} catch (error) {
			this._logService.error('AgentHostStarter was unable to resolve shell environment', error);
			return {};
		}
	}
}
