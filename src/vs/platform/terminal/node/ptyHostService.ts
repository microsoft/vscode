/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { IProcessEnvironment, isWindows, OperatingSystem } from 'vs/base/common/platform';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client, IIPCOptions } from 'vs/base/parts/ipc/node/ipc.cp';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { parsePtyHostPort } from 'vs/platform/environment/common/environmentService';
import { resolveShellEnv } from 'vs/platform/environment/node/shellEnv';
import { ILogService } from 'vs/platform/log/common/log';
import { LogLevelChannelClient } from 'vs/platform/log/common/logIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { RequestStore } from 'vs/platform/terminal/common/requestStore';
import { HeartbeatConstants, IHeartbeatService, IProcessDataEvent, IPtyService, IReconnectConstants, IRequestResolveVariablesEvent, IShellLaunchConfig, ITerminalDimensionsOverride, ITerminalLaunchError, ITerminalProfile, ITerminalsLayoutInfo, TerminalIcon, TerminalIpcChannels, IProcessProperty, TerminalShellType, TitleEventSource, ProcessPropertyType, ProcessCapability, IProcessPropertyMap, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { registerTerminalPlatformConfiguration } from 'vs/platform/terminal/common/terminalPlatformConfiguration';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, IPtyHostProcessReplayEvent, ISetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';
import { detectAvailableProfiles } from 'vs/platform/terminal/node/terminalProfiles';

enum Constants {
	MaxRestarts = 5
}

/**
 * Tracks the last terminal ID from the pty host so we can give it to the new pty host if it's
 * restarted and avoid ID conflicts.
 */
let lastPtyId = 0;

/**
 * This service implements IPtyService by launching a pty host process, forwarding messages to and
 * from the pty host process and manages the connection.
 */
export class PtyHostService extends Disposable implements IPtyService {
	declare readonly _serviceBrand: undefined;

	private _client: Client;
	// ProxyChannel is not used here because events get lost when forwarding across multiple proxies
	private _proxy: IPtyService;

	private readonly _shellEnv: Promise<typeof process.env>;
	private readonly _resolveVariablesRequestStore: RequestStore<string[], { workspaceId: string, originalText: string[] }>;
	private _restartCount = 0;
	private _isResponsive = true;
	private _isDisposed = false;
	private _heartbeatFirstTimeout?: NodeJS.Timeout;
	private _heartbeatSecondTimeout?: NodeJS.Timeout;

	private readonly _onPtyHostExit = this._register(new Emitter<number>());
	readonly onPtyHostExit = this._onPtyHostExit.event;
	private readonly _onPtyHostStart = this._register(new Emitter<void>());
	readonly onPtyHostStart = this._onPtyHostStart.event;
	private readonly _onPtyHostUnresponsive = this._register(new Emitter<void>());
	readonly onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
	private readonly _onPtyHostResponsive = this._register(new Emitter<void>());
	readonly onPtyHostResponsive = this._onPtyHostResponsive.event;
	private readonly _onPtyHostRequestResolveVariables = this._register(new Emitter<IRequestResolveVariablesEvent>());
	readonly onPtyHostRequestResolveVariables = this._onPtyHostRequestResolveVariables.event;

	private readonly _onProcessData = this._register(new Emitter<{ id: number, event: IProcessDataEvent | string }>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessExit = this._register(new Emitter<{ id: number, event: number | undefined }>());
	readonly onProcessExit = this._onProcessExit.event;
	private readonly _onProcessReady = this._register(new Emitter<{ id: number, event: { pid: number, cwd: string, capabilities: ProcessCapability[] } }>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessReplay = this._register(new Emitter<{ id: number, event: IPtyHostProcessReplayEvent }>());
	readonly onProcessReplay = this._onProcessReplay.event;
	private readonly _onProcessTitleChanged = this._register(new Emitter<{ id: number, event: string }>());
	readonly onProcessTitleChanged = this._onProcessTitleChanged.event;
	private readonly _onProcessShellTypeChanged = this._register(new Emitter<{ id: number, event: TerminalShellType }>());
	readonly onProcessShellTypeChanged = this._onProcessShellTypeChanged.event;
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<{ id: number, event: ITerminalDimensionsOverride | undefined }>());
	readonly onProcessOverrideDimensions = this._onProcessOverrideDimensions.event;
	private readonly _onProcessResolvedShellLaunchConfig = this._register(new Emitter<{ id: number, event: IShellLaunchConfig }>());
	readonly onProcessResolvedShellLaunchConfig = this._onProcessResolvedShellLaunchConfig.event;
	private readonly _onProcessOrphanQuestion = this._register(new Emitter<{ id: number }>());
	readonly onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
	private readonly _onDidRequestDetach = this._register(new Emitter<{ requestId: number, workspaceId: string, instanceId: number }>());
	readonly onDidRequestDetach = this._onDidRequestDetach.event;
	private readonly _onProcessDidChangeHasChildProcesses = this._register(new Emitter<{ id: number, event: boolean }>());
	readonly onProcessDidChangeHasChildProcesses = this._onProcessDidChangeHasChildProcesses.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<{ id: number, property: IProcessProperty<any> }>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;

	constructor(
		private readonly _reconnectConstants: IReconnectConstants,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		// Platform configuration is required on the process running the pty host (shared process or
		// remote server).
		registerTerminalPlatformConfiguration();

		this._shellEnv = this._resolveShellEnv();

		this._register(toDisposable(() => this._disposePtyHost()));

		this._resolveVariablesRequestStore = this._register(new RequestStore(undefined, this._logService));
		this._resolveVariablesRequestStore.onCreateRequest(this._onPtyHostRequestResolveVariables.fire, this._onPtyHostRequestResolveVariables);

		[this._client, this._proxy] = this._startPtyHost();

		this._register(this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalSettingId.IgnoreProcessNames)) {
				await this._refreshIgnoreProcessNames();
			}
		}));
	}

	async initialize(): Promise<void> {
		await this._refreshIgnoreProcessNames();
	}

	private get _ignoreProcessNames(): string[] {
		return this._configurationService.getValue<string[]>(TerminalSettingId.IgnoreProcessNames);
	}

	private async _refreshIgnoreProcessNames(): Promise<void> {
		return this._proxy.refreshIgnoreProcessNames?.(this._ignoreProcessNames);
	}

	private async _resolveShellEnv(): Promise<typeof process.env> {
		if (isWindows) {
			return process.env;
		}

		try {
			return await resolveShellEnv(this._logService, { _: [] }, process.env);
		} catch (error) {
			this._logService.error('ptyHost was unable to resolve shell environment', error);

			return {};
		}
	}

	private _startPtyHost(): [Client, IPtyService] {
		const opts: IIPCOptions = {
			serverName: 'Pty Host',
			args: ['--type=ptyHost'],
			env: {
				VSCODE_LAST_PTY_ID: lastPtyId,
				VSCODE_AMD_ENTRYPOINT: 'vs/platform/terminal/node/ptyHostMain',
				VSCODE_PIPE_LOGGING: 'true',
				VSCODE_VERBOSE_LOGGING: 'true', // transmit console logs from server to client,
				VSCODE_RECONNECT_GRACE_TIME: this._reconnectConstants.graceTime,
				VSCODE_RECONNECT_SHORT_GRACE_TIME: this._reconnectConstants.shortGraceTime,
				VSCODE_RECONNECT_SCROLLBACK: this._reconnectConstants.scrollback
			}
		};

		const ptyHostDebug = parsePtyHostPort(this._environmentService.args, this._environmentService.isBuilt);
		if (ptyHostDebug) {
			if (ptyHostDebug.break && ptyHostDebug.port) {
				opts.debugBrk = ptyHostDebug.port;
			} else if (!ptyHostDebug.break && ptyHostDebug.port) {
				opts.debug = ptyHostDebug.port;
			}
		}

		const client = new Client(FileAccess.asFileUri('bootstrap-fork', require).fsPath, opts);
		this._onPtyHostStart.fire();

		// Setup heartbeat service and trigger a heartbeat immediately to reset the timeouts
		const heartbeatService = ProxyChannel.toService<IHeartbeatService>(client.getChannel(TerminalIpcChannels.Heartbeat));
		heartbeatService.onBeat(() => this._handleHeartbeat());
		this._handleHeartbeat();

		// Handle exit
		this._register(client.onDidProcessExit(e => {
			/* __GDPR__
				"ptyHost/exit" : {}
			*/
			this._telemetryService.publicLog('ptyHost/exit');
			this._onPtyHostExit.fire(e.code);
			if (!this._isDisposed) {
				if (this._restartCount <= Constants.MaxRestarts) {
					this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}`);
					this._restartCount++;
					this.restartPtyHost();
				} else {
					this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}, giving up`);
				}
			}
		}));

		// Setup logging
		const logChannel = client.getChannel(TerminalIpcChannels.Log);
		LogLevelChannelClient.setLevel(logChannel, this._logService.getLevel());
		this._register(this._logService.onDidChangeLogLevel(() => {
			LogLevelChannelClient.setLevel(logChannel, this._logService.getLevel());
		}));

		// Create proxy and forward events
		const proxy = ProxyChannel.toService<IPtyService>(client.getChannel(TerminalIpcChannels.PtyHost));
		this._register(proxy.onProcessData(e => this._onProcessData.fire(e)));
		this._register(proxy.onProcessExit(e => this._onProcessExit.fire(e)));
		this._register(proxy.onProcessReady(e => this._onProcessReady.fire(e)));
		this._register(proxy.onProcessTitleChanged(e => this._onProcessTitleChanged.fire(e)));
		this._register(proxy.onProcessShellTypeChanged(e => this._onProcessShellTypeChanged.fire(e)));
		this._register(proxy.onProcessOverrideDimensions(e => this._onProcessOverrideDimensions.fire(e)));
		this._register(proxy.onProcessResolvedShellLaunchConfig(e => this._onProcessResolvedShellLaunchConfig.fire(e)));
		this._register(proxy.onProcessDidChangeHasChildProcesses(e => this._onProcessDidChangeHasChildProcesses.fire(e)));
		this._register(proxy.onDidChangeProperty(e => this._onDidChangeProperty.fire(e)));
		this._register(proxy.onProcessReplay(e => this._onProcessReplay.fire(e)));
		this._register(proxy.onProcessOrphanQuestion(e => this._onProcessOrphanQuestion.fire(e)));
		this._register(proxy.onDidRequestDetach(e => this._onDidRequestDetach.fire(e)));

		return [client, proxy];
	}

	override dispose() {
		this._isDisposed = true;
		super.dispose();
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, unicodeVersion: '6' | '11', env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean, shouldPersist: boolean, workspaceId: string, workspaceName: string): Promise<number> {
		const timeout = setTimeout(() => this._handleUnresponsiveCreateProcess(), HeartbeatConstants.CreateProcessTimeout);
		const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, windowsEnableConpty, shouldPersist, workspaceId, workspaceName);
		clearTimeout(timeout);
		lastPtyId = Math.max(lastPtyId, id);
		return id;
	}
	updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void> {
		return this._proxy.updateTitle(id, title, titleSource);
	}
	updateIcon(id: number, icon: TerminalIcon, color?: string): Promise<void> {
		return this._proxy.updateIcon(id, icon, color);
	}
	attachToProcess(id: number): Promise<void> {
		return this._proxy.attachToProcess(id);
	}
	detachFromProcess(id: number): Promise<void> {
		return this._proxy.detachFromProcess(id);
	}
	listProcesses(): Promise<IProcessDetails[]> {
		return this._proxy.listProcesses();
	}
	reduceConnectionGraceTime(): Promise<void> {
		return this._proxy.reduceConnectionGraceTime();
	}
	start(id: number): Promise<ITerminalLaunchError | undefined> {
		return this._proxy.start(id);
	}
	shutdown(id: number, immediate: boolean): Promise<void> {
		return this._proxy.shutdown(id, immediate);
	}
	input(id: number, data: string): Promise<void> {
		return this._proxy.input(id, data);
	}
	processBinary(id: number, data: string): Promise<void> {
		return this._proxy.processBinary(id, data);
	}
	resize(id: number, cols: number, rows: number): Promise<void> {
		return this._proxy.resize(id, cols, rows);
	}
	acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._proxy.acknowledgeDataEvent(id, charCount);
	}
	setUnicodeVersion(id: number, version: '6' | '11'): Promise<void> {
		return this._proxy.setUnicodeVersion(id, version);
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
	orphanQuestionReply(id: number): Promise<void> {
		return this._proxy.orphanQuestionReply(id);
	}

	getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string> {
		return this._proxy.getDefaultSystemShell(osOverride);
	}
	async getProfiles(workspaceId: string, profiles: unknown, defaultProfile: unknown, includeDetectedProfiles: boolean = false): Promise<ITerminalProfile[]> {
		const shellEnv = await this._shellEnv;
		return detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, this._configurationService, shellEnv, undefined, this._logService, this._resolveVariables.bind(this, workspaceId));
	}
	getEnvironment(): Promise<IProcessEnvironment> {
		return this._proxy.getEnvironment();
	}
	getWslPath(original: string): Promise<string> {
		return this._proxy.getWslPath(original);
	}

	setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): Promise<void> {
		return this._proxy.setTerminalLayoutInfo(args);
	}
	async getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined> {
		return await this._proxy.getTerminalLayoutInfo(args);
	}

	async requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		return this._proxy.requestDetachInstance(workspaceId, instanceId);
	}

	async acceptDetachInstanceReply(requestId: number, persistentProcessId: number): Promise<void> {
		return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
	}

	async serializeTerminalState(ids: number[]): Promise<string> {
		return this._proxy.serializeTerminalState(ids);
	}

	async reviveTerminalProcesses(state: string) {
		return this._proxy.reviveTerminalProcesses(state);
	}

	async refreshProperty<T extends ProcessPropertyType>(id: number, property: ProcessPropertyType): Promise<IProcessPropertyMap[T]> {
		return this._proxy.refreshProperty(id, property);

	}
	async updateProperty<T extends ProcessPropertyType>(id: number, property: ProcessPropertyType, value: any): Promise<void> {
		return this._proxy.updateProperty(id, property, value);
	}

	async restartPtyHost(): Promise<void> {
		/* __GDPR__
			"ptyHost/restart" : {}
		*/
		this._telemetryService.publicLog('ptyHost/restart');
		this._isResponsive = true;
		this._disposePtyHost();
		[this._client, this._proxy] = this._startPtyHost();
	}

	private _disposePtyHost(): void {
		this._proxy.shutdownAll?.();
		this._client.dispose();
	}

	private _handleHeartbeat() {
		this._clearHeartbeatTimeouts();
		this._heartbeatFirstTimeout = setTimeout(() => this._handleHeartbeatFirstTimeout(), HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier);
		if (!this._isResponsive) {
			/* __GDPR__
				"ptyHost/responsive" : {}
			*/
			this._telemetryService.publicLog('ptyHost/responsive');
			this._isResponsive = true;
		}
		this._onPtyHostResponsive.fire();
	}

	private _handleHeartbeatFirstTimeout() {
		this._logService.warn(`No ptyHost heartbeat after ${HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier / 1000} seconds`);
		this._heartbeatFirstTimeout = undefined;
		this._heartbeatSecondTimeout = setTimeout(() => this._handleHeartbeatSecondTimeout(), HeartbeatConstants.BeatInterval * HeartbeatConstants.SecondWaitMultiplier);
	}

	private _handleHeartbeatSecondTimeout() {
		this._logService.error(`No ptyHost heartbeat after ${(HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier + HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier) / 1000} seconds`);
		this._heartbeatSecondTimeout = undefined;
		if (this._isResponsive) {
			/* __GDPR__
				"ptyHost/responsive" : {}
			*/
			this._telemetryService.publicLog('ptyHost/unresponsive');
			this._isResponsive = false;
		}
		this._onPtyHostUnresponsive.fire();
	}

	private _handleUnresponsiveCreateProcess() {
		this._clearHeartbeatTimeouts();
		this._logService.error(`No ptyHost response to createProcess after ${HeartbeatConstants.CreateProcessTimeout / 1000} seconds`);
		/* __GDPR__
			"ptyHost/responsive" : {}
		*/
		this._telemetryService.publicLog('ptyHost/responsive');
		this._onPtyHostUnresponsive.fire();
	}

	private _clearHeartbeatTimeouts() {
		if (this._heartbeatFirstTimeout) {
			clearTimeout(this._heartbeatFirstTimeout);
			this._heartbeatFirstTimeout = undefined;
		}
		if (this._heartbeatSecondTimeout) {
			clearTimeout(this._heartbeatSecondTimeout);
			this._heartbeatSecondTimeout = undefined;
		}
	}

	private _resolveVariables(workspaceId: string, text: string[]): Promise<string[]> {
		return this._resolveVariablesRequestStore.createRequest({ workspaceId, originalText: text });
	}
	async acceptPtyHostResolvedVariables(requestId: number, resolved: string[]) {
		this._resolveVariablesRequestStore.acceptReply(requestId, resolved);
	}
}
