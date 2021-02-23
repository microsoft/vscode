/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { IPtyService, IProcessDataEvent, IShellLaunchConfig, ITerminalDimensionsOverride, ITerminalLaunchError, ITerminalsLayoutInfo, TerminalIpcChannels, IHeartbeatService, HeartbeatConstants } from 'vs/platform/terminal/common/terminal';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { FileAccess } from 'vs/base/common/network';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { Emitter } from 'vs/base/common/event';
import { LogLevelChannelClient } from 'vs/platform/log/common/logIpc';
import { IGetTerminalLayoutInfoArgs, IPtyHostProcessReplayEvent, ISetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';

enum Constants {
	MaxRestarts = 5,
	PtyHostIdMask = 0xFFFF0000,
	RawTerminalIdMask = 0x0000FFFF,
	PtyHostIdShift = 16
}

// Tracks the ID of the pty host, when a pty host gets restarted the new one is incremented in order
// to differentiate the nth terminal from pty host #1 and #2. Since the pty host ID is encoded in
// the regular ID, we can continue to share IPtyService's interface.
let currentPtyHostId = 0;

export class LocalPtyService extends Disposable implements IPtyService {
	declare readonly _serviceBrand: undefined;

	private _client: Client;
	// ProxyChannel is not used here because events get lost when forwarding across multiple proxies
	private _proxy: IPtyService;

	private _restartCount = 0;
	private _isDisposed = false;

	private _heartbeatFirstTimeout?: NodeJS.Timeout;
	private _heartbeatSecondTimeout?: NodeJS.Timeout;

	private readonly _onPtyHostExit = this._register(new Emitter<number>());
	readonly onPtyHostExit = this._onPtyHostExit.event;
	private readonly _onPtyHostStart = this._register(new Emitter<void>());
	readonly onPtyHostStart = this._onPtyHostStart.event;
	private readonly _onPtyHostUnresponsive = this._register(new Emitter<void>());
	readonly onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;

	private readonly _onProcessData = this._register(new Emitter<{ id: number, event: IProcessDataEvent | string }>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessExit = this._register(new Emitter<{ id: number, event: number | undefined }>());
	readonly onProcessExit = this._onProcessExit.event;
	private readonly _onProcessReady = this._register(new Emitter<{ id: number, event: { pid: number, cwd: string } }>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessReplay = this._register(new Emitter<{ id: number, event: IPtyHostProcessReplayEvent }>());
	readonly onProcessReplay = this._onProcessReplay.event;
	private readonly _onProcessTitleChanged = this._register(new Emitter<{ id: number, event: string }>());
	readonly onProcessTitleChanged = this._onProcessTitleChanged.event;
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<{ id: number, event: ITerminalDimensionsOverride | undefined }>());
	readonly onProcessOverrideDimensions = this._onProcessOverrideDimensions.event;
	private readonly _onProcessResolvedShellLaunchConfig = this._register(new Emitter<{ id: number, event: IShellLaunchConfig }>());
	readonly onProcessResolvedShellLaunchConfig = this._onProcessResolvedShellLaunchConfig.event;

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._register(toDisposable(() => this._disposePtyHost()));

		[this._client, this._proxy] = this._startPtyHost();
	}

	private _startPtyHost(): [Client, IPtyService] {
		++currentPtyHostId;
		const client = this._register(new Client(
			FileAccess.asFileUri('bootstrap-fork', require).fsPath,
			{
				serverName: 'Pty Host',
				args: ['--type=ptyHost'],
				env: {
					VSCODE_AMD_ENTRYPOINT: 'vs/platform/terminal/node/ptyHostMain',
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true' // transmit console logs from server to client
				}
			}
		));
		this._onPtyHostStart.fire();

		const heartbeatService = ProxyChannel.toService<IHeartbeatService>(client.getChannel(TerminalIpcChannels.Heartbeat));
		heartbeatService.onBeat(() => this._handleHeartbeat());

		// Handle exit
		this._register(client.onDidProcessExit(e => {
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
		this._register(this._logService.onDidChangeLogLevel(() => {
			LogLevelChannelClient.setLevel(logChannel, this._logService.getLevel());
		}));

		// Create proxy and forward events
		const proxy = ProxyChannel.toService<IPtyService>(client.getChannel(TerminalIpcChannels.PtyHost));
		this._register(proxy.onProcessData(e => this._onProcessData.fire(this._convertEventToCombinedId(e))));
		this._register(proxy.onProcessExit(e => this._onProcessExit.fire(this._convertEventToCombinedId(e))));
		this._register(proxy.onProcessReady(e => this._onProcessReady.fire(this._convertEventToCombinedId(e))));
		this._register(proxy.onProcessTitleChanged(e => this._onProcessTitleChanged.fire(this._convertEventToCombinedId(e))));
		this._register(proxy.onProcessOverrideDimensions(e => this._onProcessOverrideDimensions.fire(this._convertEventToCombinedId(e))));
		this._register(proxy.onProcessResolvedShellLaunchConfig(e => this._onProcessResolvedShellLaunchConfig.fire(this._convertEventToCombinedId(e))));
		this._register(proxy.onProcessReplay(e => this._onProcessReplay.fire(this._convertEventToCombinedId(e))));

		return [client, proxy];
	}

	dispose() {
		this._isDisposed = true;
		super.dispose();
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean, workspaceId: string, workspaceName: string): Promise<number> {
		const timeout = setTimeout(() => this._handleUnresponsiveCreateProcess(), HeartbeatConstants.CreateProcessTimeout);
		const result = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, windowsEnableConpty, workspaceId, workspaceName);
		clearTimeout(timeout);
		console.log('new term combined id', this._getCombinedId(currentPtyHostId, result));
		return this._getCombinedId(currentPtyHostId, result);
	}

	attachToProcess(combinedId: number): Promise<void> {
		return this._proxy.attachToProcess(this._getTerminalIdOrThrow(combinedId));
	}

	start(combinedId: number): Promise<ITerminalLaunchError | undefined> {
		return this._proxy.start(this._getTerminalIdOrThrow(combinedId));
	}
	shutdown(combinedId: number, immediate: boolean): Promise<void> {
		return this._proxy.shutdown(this._getTerminalIdOrThrow(combinedId), immediate);
	}
	input(combinedId: number, data: string): Promise<void> {
		return this._proxy.input(this._getTerminalIdOrThrow(combinedId), data);
	}
	resize(combinedId: number, cols: number, rows: number): Promise<void> {
		return this._proxy.resize(this._getTerminalIdOrThrow(combinedId), cols, rows);
	}
	acknowledgeDataEvent(combinedId: number, charCount: number): Promise<void> {
		return this._proxy.acknowledgeDataEvent(this._getTerminalIdOrThrow(combinedId), charCount);
	}
	getInitialCwd(combinedId: number): Promise<string> {
		return this._proxy.getInitialCwd(this._getTerminalIdOrThrow(combinedId));
	}
	getCwd(combinedId: number): Promise<string> {
		return this._proxy.getCwd(this._getTerminalIdOrThrow(combinedId));
	}
	getLatency(combinedId: number): Promise<number> {
		return this._proxy.getLatency(this._getTerminalIdOrThrow(combinedId));
	}
	setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): void {
		for (const t of args.tabs) {
			if (t.activePersistentTerminalId) {
				t.activePersistentTerminalId = this._getRawTerminalId(t.activePersistentTerminalId);
			}
			for (const instance of t.terminals) {
				instance.terminal = this._getRawTerminalId(instance.terminal);
			}
		}
		return this._proxy.setTerminalLayoutInfo(args);
	}
	async getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined> {
		const result = await this._proxy.getTerminalLayoutInfo(args);
		if (!result) {
			return undefined;
		}
		for (const t of result.tabs) {
			if (t.activePersistentTerminalId) {
				t.activePersistentTerminalId = this._getCombinedId(currentPtyHostId, t.activePersistentTerminalId);
			}
			for (const instance of t.terminals) {
				if (instance.terminal) {
					instance.terminal.id = this._getCombinedId(currentPtyHostId, instance.terminal.id);
				}
			}
		}
		return result;
	}

	async restartPtyHost(): Promise<void> {
		this._disposePtyHost();
		[this._client, this._proxy] = this._startPtyHost();
	}

	private _disposePtyHost(): void {
		if (this._proxy.shutdownAll) {
			this._proxy.shutdownAll();
		}
		this._client.dispose();
	}

	private _getRawTerminalId(combinedId: number): number {
		return combinedId & Constants.RawTerminalIdMask;
	}

	private _getPtyHostId(combinedId: number): number {
		return (combinedId & Constants.PtyHostIdMask) >> Constants.PtyHostIdShift;
	}

	private _getCombinedId(ptyHostId: number, rawTerminalId: number): number {
		return ((ptyHostId << Constants.PtyHostIdShift) | rawTerminalId) >>> 0/*force unsigned*/;
	}

	private _convertEventToCombinedId<T extends { id: number, event: any }>(e: T): T {
		e.id = this._getCombinedId(currentPtyHostId, e.id);
		return e;
	}

	/**
	 * Verifies that the terminal's pty host ID is active and returns the raw terminal ID if so.
	 */
	private _getTerminalIdOrThrow(combinedId: number) {
		if (currentPtyHostId !== this._getPtyHostId(combinedId)) {
			console.log('ids', combinedId);
			throw new Error(`Persistent terminal "${this._getRawTerminalId(combinedId)}": Pty host "${this._getPtyHostId(combinedId)}" is no longer active`);
		}
		return this._getRawTerminalId(combinedId);
	}

	private _handleHeartbeat() {
		this._clearHeartbeatTimeouts();
		this._heartbeatFirstTimeout = setTimeout(() => this._handleHeartbeatFirstTimeout(), HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier);
	}

	private _handleHeartbeatFirstTimeout() {
		this._logService.warn(`No ptyHost heartbeat after ${HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier / 1000} seconds`);
		this._heartbeatFirstTimeout = undefined;
		this._heartbeatSecondTimeout = setTimeout(() => this._handleHeartbeatSecondTimeout(), HeartbeatConstants.BeatInterval * HeartbeatConstants.SecondWaitMultiplier);
	}

	private _handleHeartbeatSecondTimeout() {
		this._logService.error(`No ptyHost heartbeat after ${(HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier + HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier) / 1000} seconds`);
		this._heartbeatSecondTimeout = undefined;
		this._onPtyHostUnresponsive.fire();
	}

	private _handleUnresponsiveCreateProcess() {
		this._clearHeartbeatTimeouts();
		this._logService.error(`No ptyHost response to createProcess after ${HeartbeatConstants.CreateProcessTimeout / 1000} seconds`);
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
}
