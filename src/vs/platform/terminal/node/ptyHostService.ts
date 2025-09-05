/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IProcessEnvironment, OS, OperatingSystem, isWindows } from '../../../base/common/platform.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService, ILoggerService, LogLevel } from '../../log/common/log.js';
import { RemoteLoggerChannelClient } from '../../log/common/logIpc.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { IPtyHostProcessReplayEvent } from '../common/capabilities/capabilities.js';
import { RequestStore } from '../common/requestStore.js';
import { HeartbeatConstants, IHeartbeatService, ITerminalLaunchResult, IProcessDataEvent, IProcessProperty, IProcessPropertyMap, IProcessReadyEvent, IPtyHostLatencyMeasurement, IPtyHostService, IPtyService, IRequestResolveVariablesEvent, ISerializedTerminalState, IShellLaunchConfig, ITerminalLaunchError, ITerminalProcessOptions, ITerminalProfile, ITerminalsLayoutInfo, ProcessPropertyType, TerminalIcon, TerminalIpcChannels, TerminalSettingId, TitleEventSource } from '../common/terminal.js';
import { registerTerminalPlatformConfiguration } from '../common/terminalPlatformConfiguration.js';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, ISetTerminalLayoutInfoArgs } from '../common/terminalProcess.js';
import { IPtyHostConnection, IPtyHostStarter } from './ptyHost.js';
import { detectAvailableProfiles } from './terminalProfiles.js';
import * as performance from '../../../base/common/performance.js';
import { getSystemShell } from '../../../base/node/shell.js';
import { StopWatch } from '../../../base/common/stopwatch.js';

enum Constants {
	MaxRestarts = 5
}

/**
 * This service implements IPtyService by launching a pty host process, forwarding messages to and
 * from the pty host process and manages the connection.
 */
export class PtyHostService extends Disposable implements IPtyHostService {
	declare readonly _serviceBrand: undefined;

	private __connection?: IPtyHostConnection;
	// ProxyChannel is not used here because events get lost when forwarding across multiple proxies
	private __proxy?: IPtyService;

	private get _connection(): IPtyHostConnection {
		this._ensurePtyHost();
		return this.__connection!;
	}
	private get _proxy(): IPtyService {
		this._ensurePtyHost();
		return this.__proxy!;
	}
	/**
	 * Get the proxy if it exists, otherwise undefined. This is used when calls are not needed to be
	 * passed through to the pty host if it has not yet been spawned.
	 */
	private get _optionalProxy(): IPtyService | undefined {
		return this.__proxy;
	}

	private _ensurePtyHost() {
		if (!this.__connection) {
			this._startPtyHost();
		}
	}

	private readonly _resolveVariablesRequestStore: RequestStore<string[], { workspaceId: string; originalText: string[] }>;
	private _wasQuitRequested = false;
	private _restartCount = 0;
	private _isResponsive = true;
	private _heartbeatFirstTimeout?: Timeout;
	private _heartbeatSecondTimeout?: Timeout;

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

	private readonly _onProcessData = this._register(new Emitter<{ id: number; event: IProcessDataEvent | string }>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReady = this._register(new Emitter<{ id: number; event: IProcessReadyEvent }>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessReplay = this._register(new Emitter<{ id: number; event: IPtyHostProcessReplayEvent }>());
	readonly onProcessReplay = this._onProcessReplay.event;
	private readonly _onProcessOrphanQuestion = this._register(new Emitter<{ id: number }>());
	readonly onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
	private readonly _onDidRequestDetach = this._register(new Emitter<{ requestId: number; workspaceId: string; instanceId: number }>());
	readonly onDidRequestDetach = this._onDidRequestDetach.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<{ id: number; property: IProcessProperty<any> }>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;
	private readonly _onProcessExit = this._register(new Emitter<{ id: number; event: number | undefined }>());
	readonly onProcessExit = this._onProcessExit.event;

	constructor(
		private readonly _ptyHostStarter: IPtyHostStarter,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
	) {
		super();

		// Platform configuration is required on the process running the pty host (shared process or
		// remote server).
		registerTerminalPlatformConfiguration();

		this._register(this._ptyHostStarter);
		this._register(toDisposable(() => this._disposePtyHost()));

		this._resolveVariablesRequestStore = this._register(new RequestStore(undefined, this._logService));
		this._register(this._resolveVariablesRequestStore.onCreateRequest(this._onPtyHostRequestResolveVariables.fire, this._onPtyHostRequestResolveVariables));

		// Start the pty host when a window requests a connection, if the starter has that capability.
		if (this._ptyHostStarter.onRequestConnection) {
			this._register(Event.once(this._ptyHostStarter.onRequestConnection)(() => this._ensurePtyHost()));
		}

		if (this._ptyHostStarter.onWillShutdown) {
			this._register(this._ptyHostStarter.onWillShutdown(() => this._wasQuitRequested = true));
		}
	}

	private get _ignoreProcessNames(): string[] {
		return this._configurationService.getValue<string[]>(TerminalSettingId.IgnoreProcessNames);
	}

	private async _refreshIgnoreProcessNames(): Promise<void> {
		return this._optionalProxy?.refreshIgnoreProcessNames?.(this._ignoreProcessNames);
	}

	private async _resolveShellEnv(): Promise<typeof process.env> {
		if (isWindows) {
			return process.env;
		}

		try {
			return await getResolvedShellEnv(this._configurationService, this._logService, { _: [] }, process.env);
		} catch (error) {
			this._logService.error('ptyHost was unable to resolve shell environment', error);

			return {};
		}
	}

	private _startPtyHost(): [IPtyHostConnection, IPtyService] {
		const connection = this._ptyHostStarter.start();
		const client = connection.client;

		// Log a full stack trace which will tell the exact reason the pty host is starting up
		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace('PtyHostService#_startPtyHost', new Error().stack?.replace(/^Error/, ''));
		}

		// Setup heartbeat service and trigger a heartbeat immediately to reset the timeouts
		const heartbeatService = ProxyChannel.toService<IHeartbeatService>(client.getChannel(TerminalIpcChannels.Heartbeat));
		heartbeatService.onBeat(() => this._handleHeartbeat());
		this._handleHeartbeat(true);

		// Handle exit
		this._register(connection.onDidProcessExit(e => {
			this._onPtyHostExit.fire(e.code);
			if (!this._wasQuitRequested && !this._store.isDisposed) {
				if (this._restartCount <= Constants.MaxRestarts) {
					this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}`);
					this._restartCount++;
					this.restartPtyHost();
				} else {
					this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}, giving up`);
				}
			}
		}));

		// Create proxy and forward events
		const proxy = ProxyChannel.toService<IPtyService>(client.getChannel(TerminalIpcChannels.PtyHost));
		this._register(proxy.onProcessData(e => this._onProcessData.fire(e)));
		this._register(proxy.onProcessReady(e => this._onProcessReady.fire(e)));
		this._register(proxy.onProcessExit(e => this._onProcessExit.fire(e)));
		this._register(proxy.onDidChangeProperty(e => this._onDidChangeProperty.fire(e)));
		this._register(proxy.onProcessReplay(e => this._onProcessReplay.fire(e)));
		this._register(proxy.onProcessOrphanQuestion(e => this._onProcessOrphanQuestion.fire(e)));
		this._register(proxy.onDidRequestDetach(e => this._onDidRequestDetach.fire(e)));

		this._register(new RemoteLoggerChannelClient(this._loggerService, client.getChannel(TerminalIpcChannels.Logger)));

		this.__connection = connection;
		this.__proxy = proxy;

		this._onPtyHostStart.fire();

		this._register(this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalSettingId.IgnoreProcessNames)) {
				await this._refreshIgnoreProcessNames();
			}
		}));
		this._refreshIgnoreProcessNames();

		return [connection, proxy];
	}

	async createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment,
		executableEnv: IProcessEnvironment,
		options: ITerminalProcessOptions,
		shouldPersist: boolean,
		workspaceId: string,
		workspaceName: string
	): Promise<number> {
		const timeout = setTimeout(() => this._handleUnresponsiveCreateProcess(), HeartbeatConstants.CreateProcessTimeout);
		const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName);
		clearTimeout(timeout);
		return id;
	}
	updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void> {
		return this._proxy.updateTitle(id, title, titleSource);
	}
	updateIcon(id: number, userInitiated: boolean, icon: TerminalIcon, color?: string): Promise<void> {
		return this._proxy.updateIcon(id, userInitiated, icon, color);
	}
	attachToProcess(id: number): Promise<void> {
		return this._proxy.attachToProcess(id);
	}
	detachFromProcess(id: number, forcePersist?: boolean): Promise<void> {
		return this._proxy.detachFromProcess(id, forcePersist);
	}
	shutdownAll(): Promise<void> {
		return this._proxy.shutdownAll();
	}
	listProcesses(): Promise<IProcessDetails[]> {
		return this._proxy.listProcesses();
	}
	async getPerformanceMarks(): Promise<performance.PerformanceMark[]> {
		return this._optionalProxy?.getPerformanceMarks() ?? [];
	}
	async reduceConnectionGraceTime(): Promise<void> {
		return this._optionalProxy?.reduceConnectionGraceTime();
	}
	start(id: number): Promise<ITerminalLaunchError | ITerminalLaunchResult | undefined> {
		return this._proxy.start(id);
	}
	shutdown(id: number, immediate: boolean): Promise<void> {
		return this._proxy.shutdown(id, immediate);
	}
	input(id: number, data: string): Promise<void> {
		return this._proxy.input(id, data);
	}
	sendSignal(id: number, signal: string): Promise<void> {
		return this._proxy.sendSignal(id, signal);
	}
	processBinary(id: number, data: string): Promise<void> {
		return this._proxy.processBinary(id, data);
	}
	resize(id: number, cols: number, rows: number): Promise<void> {
		return this._proxy.resize(id, cols, rows);
	}
	clearBuffer(id: number): Promise<void> {
		return this._proxy.clearBuffer(id);
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
	async getLatency(): Promise<IPtyHostLatencyMeasurement[]> {
		const sw = new StopWatch();
		const results = await this._proxy.getLatency();
		sw.stop();
		return [
			{
				label: 'ptyhostservice<->ptyhost',
				latency: sw.elapsed()
			},
			...results
		];
	}
	orphanQuestionReply(id: number): Promise<void> {
		return this._proxy.orphanQuestionReply(id);
	}

	installAutoReply(match: string, reply: string): Promise<void> {
		return this._proxy.installAutoReply(match, reply);
	}
	uninstallAllAutoReplies(): Promise<void> {
		return this._proxy.uninstallAllAutoReplies();
	}

	getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string> {
		return this._optionalProxy?.getDefaultSystemShell(osOverride) ?? getSystemShell(osOverride ?? OS, process.env);
	}
	async getProfiles(workspaceId: string, profiles: unknown, defaultProfile: unknown, includeDetectedProfiles: boolean = false): Promise<ITerminalProfile[]> {
		const shellEnv = await this._resolveShellEnv();
		return detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, this._configurationService, shellEnv, undefined, this._logService, this._resolveVariables.bind(this, workspaceId));
	}
	async getEnvironment(): Promise<IProcessEnvironment> {
		// If the pty host is yet to be launched, just return the environment of this process as it
		// is essentially the same when used to evaluate terminal profiles.
		if (!this.__proxy) {
			return { ...process.env };
		}
		return this._proxy.getEnvironment();
	}
	getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string> {
		return this._proxy.getWslPath(original, direction);
	}

	getRevivedPtyNewId(workspaceId: string, id: number): Promise<number | undefined> {
		return this._proxy.getRevivedPtyNewId(workspaceId, id);
	}

	setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): Promise<void> {
		return this._proxy.setTerminalLayoutInfo(args);
	}
	async getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined> {
		// This is optional as we want reconnect requests to go through only if the pty host exists.
		// Revive is handled specially as reviveTerminalProcesses is guaranteed to be called before
		// the request for layout info.
		return this._optionalProxy?.getTerminalLayoutInfo(args);
	}

	async requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		return this._proxy.requestDetachInstance(workspaceId, instanceId);
	}

	async acceptDetachInstanceReply(requestId: number, persistentProcessId: number): Promise<void> {
		return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
	}

	async freePortKillProcess(port: string): Promise<{ port: string; processId: string }> {
		if (!this._proxy.freePortKillProcess) {
			throw new Error('freePortKillProcess does not exist on the pty proxy');
		}
		return this._proxy.freePortKillProcess(port);
	}

	async serializeTerminalState(ids: number[]): Promise<string> {
		return this._proxy.serializeTerminalState(ids);
	}

	async reviveTerminalProcesses(workspaceId: string, state: ISerializedTerminalState[], dateTimeFormatLocate: string) {
		return this._proxy.reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate);
	}

	async refreshProperty<T extends ProcessPropertyType>(id: number, property: T): Promise<IProcessPropertyMap[T]> {
		return this._proxy.refreshProperty(id, property);

	}
	async updateProperty<T extends ProcessPropertyType>(id: number, property: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._proxy.updateProperty(id, property, value);
	}

	async restartPtyHost(): Promise<void> {
		this._disposePtyHost();
		this._isResponsive = true;
		this._startPtyHost();
	}

	private _disposePtyHost(): void {
		this._proxy.shutdownAll();
		this._connection.store.dispose();
	}

	private _handleHeartbeat(isConnecting?: boolean) {
		this._clearHeartbeatTimeouts();
		this._heartbeatFirstTimeout = setTimeout(() => this._handleHeartbeatFirstTimeout(), isConnecting ? HeartbeatConstants.ConnectingBeatInterval : (HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier));
		if (!this._isResponsive) {
			this._isResponsive = true;
			this._onPtyHostResponsive.fire();
		}
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
			this._isResponsive = false;
			this._onPtyHostUnresponsive.fire();
		}
	}

	private _handleUnresponsiveCreateProcess() {
		this._clearHeartbeatTimeouts();
		this._logService.error(`No ptyHost response to createProcess after ${HeartbeatConstants.CreateProcessTimeout / 1000} seconds`);
		if (this._isResponsive) {
			this._isResponsive = false;
			this._onPtyHostUnresponsive.fire();
		}
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
