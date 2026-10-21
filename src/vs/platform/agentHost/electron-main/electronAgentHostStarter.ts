/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { app, IpcMainEvent, systemPreferences, WebContents } from 'electron';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/electron-main/ipc.mp.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { AiAgentEnvValue, AiAgentEnvVar } from '../../chat/common/aiAgentEnv.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { Schemas } from '../../../base/common/network.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import { AgentHostStartError, IAgentHostConnection, IAgentHostShutdownRequest, IAgentHostStarter, IAgentHostStartRequest, isFatalAgentHostStartError, toFatalAgentHostStartError } from '../common/agent.js';
import { AgentHostExitMarker, AgentHostProcessExitDiagnosticsCollector, IAgentHostProcessMemorySample } from '../common/agentHostProcessExit.js';
import { buildAgentHostTelemetryIdEnv, IAgentHostForwardedTelemetryIds } from '../common/agentHostTelemetryEnv.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar, telemetryLevelToAgentHostValue } from '../common/agentHostTelemetry.js';
import { AgentHostAhpJsonlLoggingSettingId, AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentBinaryArgsSettingId, AgentHostCodexAgentEnabledSettingId, AgentHostCodexAgentSdkRootSettingId, AgentHostCodexAgentCodexHomeSettingId, AgentHostIpcChannels, AgentHostOTelCaptureContentSettingId, AgentHostOTelCaptureIdentitySettingId, AgentHostOTelDbSpanExporterEnabledSettingId, AgentHostOTelEnabledSettingId, AgentHostOTelExporterTypeSettingId, AgentHostOTelOtlpEndpointSettingId, AgentHostOTelOutfileSettingId, AgentHostOTelPolicyIpcChannel, AgentHostOTelPolicyState, AgentHostRestartIpcChannel, AgentHostWillRestartIpcChannel, buildAgentHostOTelEnv, buildAgentSdkEnv, IAgentHostManagementService, IAgentHostOTelSettings, readAgentHostOTelPolicySettings } from '../common/agentService.js';
import { deepClone } from '../../../base/common/objects.js';
import '../common/agentHostStarter.config.contribution.js';
import { AgentHostAhpJsonlLoggingEnvVar } from '../common/ahpJsonlLogger.js';

export class ElectronAgentHostStarter extends Disposable implements IAgentHostStarter {

	private utilityProcess: UtilityProcess | undefined = undefined;
	private _exitSettled: Promise<void> | undefined;
	private _managementService: IAgentHostManagementService | undefined;
	private _systemFullyAwake = true;
	private readonly _windowSenders = new Map<number, WebContents>();
	private readonly _windowSenderCleanup = this._register(new DisposableMap<number>());

	private readonly _onRequestConnection = this._register(new Emitter<IAgentHostStartRequest>());
	readonly onRequestConnection = this._onRequestConnection.event;
	private readonly _onRequestRestart = this._register(new Emitter<void>());
	readonly onRequestRestart = this._onRequestRestart.event;
	private readonly _onWillShutdown = this._register(new Emitter<IAgentHostShutdownRequest>());
	readonly onWillShutdown = this._onWillShutdown.event;

	/**
	 * Enterprise OTel policy forwarded by the renderer (see `AgentHostOTelPolicyIpcChannel`).
	 * The main-process config service lacks the managed-settings (`AccountPolicyService`) policy
	 * layer, so the renderer — which has it — sends the resolved values here before requesting
	 * the connection that lazily spawns the host. Used as the `policySettings` of
	 * `buildAgentHostOTelEnv` in `start()`, falling back to main-process policy when absent.
	 */
	private readonly _otelPolicyState = new AgentHostOTelPolicyState();

	constructor(
		private readonly _telemetryIds: IAgentHostForwardedTelemetryIds,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly _environmentMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly _lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._register(toDisposable(() => {
			if (this.utilityProcess) {
				this._disposeUtilityProcess(this.utilityProcess);
			}
		}));
		this._register(this._lifecycleMainService.onWillShutdown(event => this._onWillShutdown.fire({
			join: promise => event.join('join.agentHost', promise),
		})));

		// Capture the enterprise OTel policy the renderer forwards before it requests a
		// connection (FIFO per sender ensures this lands before the spawn in `start()`).
		const onOTelPolicy = (_e: IpcMainEvent, policy: unknown, ready: unknown) => {
			if (this._otelPolicyState.update(policy, this.utilityProcess !== undefined, ready === true)) {
				this._logService.info('Agent Host enterprise OTel policy changed; restarting the Agent Host');
				this._notifyWindowsWillRestart();
				this._onRequestRestart.fire();
			}
		};
		validatedIpcMain.on(AgentHostOTelPolicyIpcChannel, onOTelPolicy);
		this._register(toDisposable(() => {
			validatedIpcMain.removeListener(AgentHostOTelPolicyIpcChannel, onOTelPolicy);
		}));

		// Listen for new windows to establish a direct MessagePort connection to the agent host
		const onWindowConnection = (e: IpcMainEvent, nonce: string) => { void this._onWindowConnection(e, nonce); };
		validatedIpcMain.on('vscode:createAgentHostMessageChannel', onWindowConnection);
		this._register(toDisposable(() => {
			validatedIpcMain.removeListener('vscode:createAgentHostMessageChannel', onWindowConnection);
		}));

		const onRestart = () => {
			this._notifyWindowsWillRestart();
			this._onRequestRestart.fire();
		};
		validatedIpcMain.on(AgentHostRestartIpcChannel, onRestart);
		this._register(toDisposable(() => {
			validatedIpcMain.removeListener(AgentHostRestartIpcChannel, onRestart);
		}));

		if (isMacintosh) {
			// Unlike Electron's `resume` event, macOS posts the did-wake notification
			// only when the machine fully wakes, not for background (dark) wakes.
			const subscriptions = [
				systemPreferences.subscribeWorkspaceNotification('NSWorkspaceWillSleepNotification', () => this._setSystemFullyAwake(false)),
				systemPreferences.subscribeWorkspaceNotification('NSWorkspaceDidWakeNotification', () => this._setSystemFullyAwake(true)),
			];
			this._register(toDisposable(() => {
				for (const subscription of subscriptions) {
					systemPreferences.unsubscribeWorkspaceNotification(subscription);
				}
			}));
		}
	}

	async start(): Promise<IAgentHostConnection> {
		if (this.utilityProcess) {
			throw new Error('Agent Host utility process is already running.');
		}

		const inspectParams = parseAgentHostDebugPort(this._environmentMainService.args, this._environmentMainService.isBuilt);
		const execArgv = inspectParams.port ? [
			'--nolazy',
			`--inspect${inspectParams.break ? '-brk' : ''}=${inspectParams.port}`
		] : undefined;

		// Resolve user shell environment so spawned tools/terminals inherit
		// PATH and other vars from the user's login shell (macOS/Linux GUI launches).
		const shellEnv = await this._resolveShellEnv();
		if (this._store.isDisposed) {
			throw new Error('Agent Host starter was disposed during startup.');
		}
		if (this.utilityProcess) {
			throw new Error('Agent Host utility process was started concurrently.');
		}

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

		// Translate `chat.agentHost.otel.*` settings into the env vars consumed by
		// the agent host process. Any value already present on `process.env` wins
		// for user settings, while enterprise policy values win over inherited env —
		// see `buildAgentHostOTelEnv` for the precedence.
		//
		// Policy source: prefer the renderer-forwarded policy (its config service
		// includes the managed-settings `AccountPolicyService` layer that the main
		// process cannot see); fall back to the main-process policy for the keys it
		// can resolve (e.g. native MDM via the policy channel).
		const policySettings: IAgentHostOTelSettings = this._otelPolicyState.policy ?? readAgentHostOTelPolicySettings(this._configurationService);
		this._otelPolicyState.didStart();
		const otelEnv = buildAgentHostOTelEnv({
			enabled: this._configurationService.getValue<boolean>(AgentHostOTelEnabledSettingId),
			exporterType: this._configurationService.getValue<string>(AgentHostOTelExporterTypeSettingId),
			otlpEndpoint: this._configurationService.getValue<string>(AgentHostOTelOtlpEndpointSettingId),
			captureContent: this._configurationService.getValue<boolean>(AgentHostOTelCaptureContentSettingId),
			captureIdentity: this._configurationService.getValue<boolean>(AgentHostOTelCaptureIdentitySettingId),
			outfile: this._configurationService.getValue<string>(AgentHostOTelOutfileSettingId),
			dbSpanExporterEnabled: this._configurationService.getValue<boolean>(AgentHostOTelDbSpanExporterEnabledSettingId),
		}, process.env, policySettings, shellEnv);

		const args = [
			'--logsPath', this._environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
			'--user-data-dir', this._environmentMainService.userDataPath,
			'--telemetry-level', telemetryLevelToAgentHostValue(this._telemetryService.telemetryLevel),
		];

		// Forward the host's resolved telemetry identifiers so the agent host
		// reuses the same persisted machineId/sqmId/devDeviceId instead of
		// recomputing them live (which can diverge). See `agentHostTelemetryEnv`.
		const telemetryIdEnv = buildAgentHostTelemetryIdEnv(this._telemetryIds);
		const utilityProcess = new UtilityProcess(this._logService, NullTelemetryService, this._lifecycleMainService);
		this.utilityProcess = utilityProcess;
		const exitDiagnostics = new AgentHostProcessExitDiagnosticsCollector(utilityProcess, pid => this._sampleProcessMemory(pid));

		try {
			if (!utilityProcess.start({
				type: 'agentHost',
				name: 'agent-host',
				entryPoint: 'vs/platform/agentHost/node/agentHostMain',
				execArgv,
				args,
				env: {
					...deepClone(process.env),
					...shellEnv,
					// Announce that everything spawned below this process is driven by
					// VS Code's agent, so `gh` inherits it. Set after the inherited
					// env so it wins.
					[AiAgentEnvVar]: AiAgentEnvValue,
					VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true',
					[AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeMainProcess,
					[AgentHostAhpJsonlLoggingEnvVar]: String(this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId)),
					...sdkEnv,
					...otelEnv,
					...telemetryIdEnv,
				}
			})) {
				throw new Error('Agent Host utility process did not start.');
			}

			const port = utilityProcess.connect();
			const client = new MessagePortClient(port, 'agentHost');
			const managementService = ProxyChannel.toService<IAgentHostManagementService>(client.getChannel(AgentHostIpcChannels.Management));

			const store = new DisposableStore();
			store.add(exitDiagnostics);
			this._managementService = managementService;
			store.add(toDisposable(() => {
				if (this._managementService === managementService) {
					this._managementService = undefined;
				}
			}));
			store.add(client);
			if (!this._systemFullyAwake) {
				this._reportSystemFullyAwake();
			}
			store.add(utilityProcess.onStderr(data => {
				const loggable = data.split('\n').filter(line => !line.includes(AgentHostExitMarker)).join('\n');
				if (!loggable.trim() || this._isExpectedStderr(loggable)) {
					return;
				}
				this._logService.error(`[AgentHost:stderr] ${loggable}`);
			}));

			// The exit is reported after a grace period that collects diagnostics.
			// Hold new window connections until then, so they reach the restarted
			// process rather than the exited one.
			const exitSettled = new DeferredPromise<void>();
			store.add(toDisposable(() => exitSettled.complete()));
			store.add(exitDiagnostics.onDidExit(() => exitSettled.complete()));
			void exitSettled.p.then(() => {
				if (this._exitSettled === exitSettled.p) {
					this._exitSettled = undefined;
				}
			});
			store.add(utilityProcess.onExit(() => {
				this._exitSettled = exitSettled.p;
				this._notifyWindowsWillRestart();
			}));
			store.add(toDisposable(() => this._disposeUtilityProcess(utilityProcess)));

			return {
				client,
				store,
				onDidProcessExit: exitDiagnostics.onDidExit,
				shutdown: () => managementService.shutdown(),
			};
		} catch (error) {
			exitDiagnostics.dispose();
			this._disposeUtilityProcess(utilityProcess);
			if (isFatalAgentHostStartError(error)) {
				throw toFatalAgentHostStartError(error);
			}
			throw error;
		}
	}

	private _sampleProcessMemory(pid: number): IAgentHostProcessMemorySample | undefined {
		const metric = app.getAppMetrics().find(metric => metric.pid === pid);
		return metric ? { workingSetKb: metric.memory.workingSetSize, peakWorkingSetKb: metric.memory.peakWorkingSetSize } : undefined;
	}

	private async _resolveShellEnv(): Promise<typeof process.env> {
		try {
			return await getResolvedShellEnv(this._configurationService, this._logService, this._environmentMainService.args, process.env);
		} catch (error) {
			this._logService.error('AgentHostStarter was unable to resolve shell environment', error);
			return {};
		}
	}

	private _setSystemFullyAwake(fullyAwake: boolean): void {
		if (this._systemFullyAwake === fullyAwake) {
			return;
		}
		this._systemFullyAwake = fullyAwake;
		this._logService.info(`AgentHostStarter: system is ${fullyAwake ? 'fully awake' : 'going to sleep'}`);
		this._reportSystemFullyAwake();
	}

	private _reportSystemFullyAwake(): void {
		void this._managementService?.setSystemFullyAwake(this._systemFullyAwake).catch(error => {
			this._logService.warn(`AgentHostStarter: failed to report system wake state: ${toErrorMessage(error)}`);
		});
	}

	private async _onWindowConnection(e: IpcMainEvent, nonce: string): Promise<void> {
		if (e.sender.isDestroyed()) {
			return;
		}

		this._trackWindowSender(e.sender);

		if (this._exitSettled) {
			await this._exitSettled;
			if (e.sender.isDestroyed()) {
				return;
			}
		}

		let startPromise: Promise<void> | undefined;
		try {
			this._onRequestConnection.fire({
				waitUntil: promise => {
					if (startPromise) {
						throw new Error('Agent Host start request was handled more than once.');
					}
					startPromise = promise;
				},
			});
			if (!startPromise) {
				throw new Error('Agent Host process manager is unavailable.');
			}
			await startPromise;

			const utilityProcess = this.utilityProcess;
			if (!utilityProcess) {
				throw new Error('Agent Host process is not running.');
			}
			const port = utilityProcess.connect();
			if (e.sender.isDestroyed()) {
				port.close();
				return;
			}
			e.sender.postMessage('vscode:createAgentHostMessageChannelResult', nonce, [port]);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this._logService.error(`AgentHostStarter: cannot create window connection: ${message}`);
			if (!e.sender.isDestroyed()) {
				e.sender.send('vscode:createAgentHostMessageChannelResult', {
					nonce,
					error: message,
					fatal: error instanceof AgentHostStartError && error.fatal,
				});
			}
		}
	}

	private _disposeUtilityProcess(utilityProcess: UtilityProcess): void {
		utilityProcess.kill();
		utilityProcess.dispose();
		if (this.utilityProcess === utilityProcess) {
			this.utilityProcess = undefined;
		}
	}

	private _notifyWindowsWillRestart(): void {
		for (const sender of this._windowSenders.values()) {
			if (!sender.isDestroyed()) {
				sender.send(AgentHostWillRestartIpcChannel);
			}
		}
	}

	private _trackWindowSender(sender: WebContents): void {
		if (this._windowSenders.has(sender.id)) {
			return;
		}
		this._windowSenders.set(sender.id, sender);
		const onDestroyed = () => this._windowSenderCleanup.deleteAndDispose(sender.id);
		sender.once('destroyed', onDestroyed);
		this._windowSenderCleanup.set(sender.id, toDisposable(() => {
			sender.removeListener('destroyed', onDestroyed);
			this._windowSenders.delete(sender.id);
		}));
	}

	private static readonly _expectedStderrPatterns = [
		'Most NODE_OPTIONs are not supported in packaged apps',
		'Debugger listening on ws://',
		'For help, see: https://nodejs.org/en/docs/inspector',
		'ExperimentalWarning: SQLite is an experimental feature',
		'[copilot-sdk] CopilotClient.stop runtime shutdown complete.',
	];

	private _isExpectedStderr(data: string): boolean {
		return ElectronAgentHostStarter._expectedStderrPatterns.some(pattern => data.includes(pattern));
	}
}
