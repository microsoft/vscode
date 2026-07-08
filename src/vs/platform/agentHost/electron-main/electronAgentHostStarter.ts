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
import { buildAgentHostTelemetryIdEnv, IAgentHostForwardedTelemetryIds } from '../common/agentHostTelemetryEnv.js';
import { AgentHostByokModelsEnabledSettingId, AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentBinaryArgsSettingId, AgentHostCodexAgentEnabledSettingId, AgentHostCodexAgentSdkRootSettingId, AgentHostCodexAgentCodexHomeSettingId, AgentHostOTelCaptureContentSettingId, AgentHostOTelDbSpanExporterEnabledSettingId, AgentHostOTelEnabledSettingId, AgentHostOTelExporterTypeSettingId, AgentHostOTelOtlpEndpointSettingId, AgentHostOTelOtlpProtocolSettingId, AgentHostOTelOutfileSettingId, AgentHostOTelResourceAttributesSettingId, AgentHostOTelServiceNameSettingId, AgentHostOTelPolicyIpcChannel, buildAgentHostOTelEnv, buildAgentSdkEnv, IAgentHostOTelSettings, sanitizeAgentHostOTelPolicySettings } from '../common/agentService.js';
import { deepClone } from '../../../base/common/objects.js';
import '../common/agentHost.config.contribution.js';
import '../common/agentHostStarter.config.contribution.js';

export class ElectronAgentHostStarter extends Disposable implements IAgentHostStarter {

	private utilityProcess: UtilityProcess | undefined = undefined;
	private utilityProcessStarted: DeferredPromise<void> | undefined = undefined;

	private readonly _onRequestConnection = this._register(new Emitter<void>());
	readonly onRequestConnection = this._onRequestConnection.event;
	private readonly _onWillShutdown = this._register(new Emitter<void>());
	readonly onWillShutdown = this._onWillShutdown.event;

	/**
	 * Enterprise OTel policy forwarded by the renderer (see `AgentHostOTelPolicyIpcChannel`).
	 * The main-process config service lacks the managed-settings (`AccountPolicyService`) policy
	 * layer, so the renderer — which has it — sends the resolved values here before requesting
	 * the connection that lazily spawns the host. Used as the `policySettings` of
	 * `buildAgentHostOTelEnv` in `start()`, falling back to main-process policy when absent.
	 */
	private _otelPolicyFromRenderer: IAgentHostOTelSettings | undefined = undefined;

	constructor(
		private readonly _telemetryIds: IAgentHostForwardedTelemetryIds,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly _environmentMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly _lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._lifecycleMainService.onWillShutdown(() => this._onWillShutdown.fire()));

		// Capture the enterprise OTel policy the renderer forwards before it requests a
		// connection (FIFO per sender ensures this lands before the spawn in `start()`).
		const onOTelPolicy = (_e: IpcMainEvent, policy: unknown) => {
			this._otelPolicyFromRenderer = sanitizeAgentHostOTelPolicySettings(policy);
		};
		validatedIpcMain.on(AgentHostOTelPolicyIpcChannel, onOTelPolicy);
		this._register(toDisposable(() => {
			validatedIpcMain.removeListener(AgentHostOTelPolicyIpcChannel, onOTelPolicy);
		}));

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

		// Translate `chat.agentHost.otel.*` settings into the env vars consumed by
		// the agent host process. Any value already present on `process.env` wins
		// for user settings, while enterprise policy values win over inherited env —
		// see `buildAgentHostOTelEnv` for the precedence.
		//
		// Policy source: prefer the renderer-forwarded policy (its config service
		// includes the managed-settings `AccountPolicyService` layer that the main
		// process cannot see); fall back to the main-process policy for the keys it
		// can resolve (e.g. native MDM via the policy channel).
		const policyValue = <T>(key: string): T | undefined => this._configurationService.inspect<T>(key).policyValue;
		const policySettings: IAgentHostOTelSettings = this._otelPolicyFromRenderer ?? {
			enabled: policyValue<boolean>(AgentHostOTelEnabledSettingId),
			exporterType: policyValue<string>(AgentHostOTelExporterTypeSettingId),
			otlpProtocol: policyValue<string>(AgentHostOTelOtlpProtocolSettingId),
			otlpEndpoint: policyValue<string>(AgentHostOTelOtlpEndpointSettingId),
			captureContent: policyValue<boolean>(AgentHostOTelCaptureContentSettingId),
			outfile: policyValue<string>(AgentHostOTelOutfileSettingId),
			serviceName: policyValue<string>(AgentHostOTelServiceNameSettingId),
			resourceAttributes: policyValue<Record<string, string>>(AgentHostOTelResourceAttributesSettingId),
		};
		const otelEnv = buildAgentHostOTelEnv({
			enabled: this._configurationService.getValue<boolean>(AgentHostOTelEnabledSettingId),
			exporterType: this._configurationService.getValue<string>(AgentHostOTelExporterTypeSettingId),
			otlpEndpoint: this._configurationService.getValue<string>(AgentHostOTelOtlpEndpointSettingId),
			captureContent: this._configurationService.getValue<boolean>(AgentHostOTelCaptureContentSettingId),
			outfile: this._configurationService.getValue<string>(AgentHostOTelOutfileSettingId),
			dbSpanExporterEnabled: this._configurationService.getValue<boolean>(AgentHostOTelDbSpanExporterEnabledSettingId),
		}, process.env, policySettings);

		const args = [
			'--logsPath', this._environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
			'--user-data-dir', this._environmentMainService.userDataPath,
		];
		if (this._environmentMainService.disableTelemetry) {
			args.push('--disable-telemetry');
		}

		// Forward the host's resolved telemetry identifiers so the agent host
		// reuses the same persisted machineId/sqmId/devDeviceId instead of
		// recomputing them live (which can diverge). See `agentHostTelemetryEnv`.
		const telemetryIdEnv = buildAgentHostTelemetryIdEnv(this._telemetryIds);

		this.utilityProcess.start({
			type: 'agentHost',
			name: 'agent-host',
			entryPoint: 'vs/platform/agentHost/node/agentHostMain',
			execArgv,
			args,
			env: {
				...deepClone(process.env),
				...shellEnv,
				VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
				VSCODE_PIPE_LOGGING: 'true',
				VSCODE_VERBOSE_LOGGING: 'true',
				...sdkEnv,
				...otelEnv,
				...telemetryIdEnv,
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
