/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue, RunOnceScheduler } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ProtocolConstants } from 'vs/base/parts/ipc/common/ipc.net';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { AutoOpenBarrier } from 'vs/platform/terminal/common/autoOpenBarrier';
import { IRemoteTerminalProcessDataEvent, IRemoteTerminalProcessEvent, IRemoteTerminalProcessExitEvent, IRemoteTerminalProcessOrphanQuestionEvent, IRemoteTerminalProcessReadyEvent, IRemoteTerminalProcessTitleChangedEvent } from 'vs/platform/terminal/common/terminalProcess';
import { ICommonLocalPtyService, IProcessDataEvent, IShellLaunchConfig, ITerminalDimensionsOverride, ITerminalLaunchError, printTime } from 'vs/platform/terminal/common/terminal';
import { TerminalDataBufferer } from 'vs/platform/terminal/common/terminalDataBuffering';
import { TerminalRecorder } from 'vs/platform/terminal/common/terminalRecorder';
import { TerminalProcess } from 'vs/platform/terminal/node/terminalProcess';

export const ILocalPtyMainService = createDecorator<ILocalPtyMainService>('localPtyMainService');

export interface ILocalPtyMainService extends ICommonLocalPtyService { }

let currentLocalPtyId = 0;

export class LocalPtyMainService extends Disposable implements ICommonLocalPtyService {
	declare readonly _serviceBrand: undefined;

	private readonly _localPtys: Map<number, PersistentTerminalProcess> = new Map();

	private readonly _onProcessData = this._register(new Emitter<{ id: number, event: IProcessDataEvent | string }>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessExit = this._register(new Emitter<{ id: number, event: number | undefined }>());
	readonly onProcessExit = this._onProcessExit.event;
	private readonly _onProcessReady = this._register(new Emitter<{ id: number, event: { pid: number, cwd: string } }>());
	readonly onProcessReady = this._onProcessReady.event;
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
	}

	acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getLatency(id: number): Promise<number> {
		throw new Error('Method not implemented.');
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean): Promise<number> {
		const id = ++currentLocalPtyId;
		const process = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, windowsEnableConpty, this._logService);
		process.onProcessData(event => this._onProcessData.fire({ id, event }));
		process.onProcessExit(event => this._onProcessExit.fire({ id, event }));
		process.onProcessReady(event => this._onProcessReady.fire({ id, event }));
		process.onProcessTitleChanged(event => this._onProcessTitleChanged.fire({ id, event }));
		if (process.onProcessOverrideDimensions) {
			process.onProcessOverrideDimensions(event => this._onProcessOverrideDimensions.fire({ id, event }));
		}
		if (process.onProcessResolvedShellLaunchConfig) {
			process.onProcessResolvedShellLaunchConfig(event => this._onProcessResolvedShellLaunchConfig.fire({ id, event }));
		}
		const persistentTerminalProcess = new PersistentTerminalProcess(id, process, '', '', true, cols, rows, '', this._logService, () => {
			persistentTerminalProcess.dispose();
			this._localPtys.delete(id);
		});
		this._localPtys.set(id, persistentTerminalProcess);
		return id;
	}

	async start(id: number): Promise<ITerminalLaunchError | { remoteTerminalId: number; } | undefined> {
		return this._throwIfNoPty(id).start();
	}

	async shutdown(id: number, immediate: boolean): Promise<void> {
		return this._throwIfNoPty(id).shutdown(immediate);
	}

	async input(id: number, data: string): Promise<void> {
		return this._throwIfNoPty(id).input(data);
	}

	async resize(id: number, cols: number, rows: number): Promise<void> {
		return this._throwIfNoPty(id).resize(cols, rows);
	}

	async getInitialCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getInitialCwd();
	}

	async getCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getCwd();
	}

	private _throwIfNoPty(id: number): PersistentTerminalProcess {
		const pty = this._localPtys.get(id);
		if (!pty) {
			throw new Error(`Could not find pty with id "${id}"`);
		}
		return pty;
	}
}

export class PersistentTerminalProcess extends Disposable {

	private readonly _events: Emitter<IRemoteTerminalProcessEvent>;
	public readonly events: Event<IRemoteTerminalProcessEvent>;

	private readonly _bufferer: TerminalDataBufferer;

	private readonly _pendingCommands = new Map<number, { resolve: (data: any) => void; reject: (err: any) => void; }>();

	private readonly _recorder: TerminalRecorder;
	private _seenFirstListener: boolean;

	private _orphanQuestionBarrier: AutoOpenBarrier | null;
	private _orphanQuestionReplyTime: number;
	private _orphanRequestQueue = new Queue<boolean>();
	private _disconnectRunner1: RunOnceScheduler;
	private _disconnectRunner2: RunOnceScheduler;

	private _title = '';
	private _pid = -1;

	public get pid(): number {
		return this._pid;
	}

	public get title(): string {
		return this._title;
	}

	constructor(
		private readonly _id: number,
		private readonly _terminalProcess: TerminalProcess,
		public readonly workspaceId: string,
		public readonly workspaceName: string,
		public readonly shouldPersistTerminal: boolean,
		cols: number, rows: number,
		ipcHandlePath: string,
		private readonly _logService: ILogService,
		private readonly _onExit: () => void,
	) {
		super();

		this._recorder = new TerminalRecorder(cols, rows);
		this._seenFirstListener = false;

		this._orphanQuestionBarrier = null;
		this._orphanQuestionReplyTime = 0;
		this._disconnectRunner1 = this._register(new RunOnceScheduler(() => {
			this._logService.info(`The reconnection grace time of ${printTime(ProtocolConstants.ReconnectionGraceTime)} has expired, so the terminal process with pid ${this._pid} will be shutdown.`);
			this.shutdown(true);
		}, ProtocolConstants.ReconnectionGraceTime));
		this._disconnectRunner2 = this._register(new RunOnceScheduler(() => {
			this._logService.info(`The short reconnection grace time of ${printTime(ProtocolConstants.ReconnectionShortGraceTime)} has expired, so the terminal process with pid ${this._pid} will be shutdown.`);
			this.shutdown(true);
		}, ProtocolConstants.ReconnectionShortGraceTime));

		this._events = this._register(new Emitter<IRemoteTerminalProcessEvent>({
			onListenerDidAdd: () => {
				this._disconnectRunner1.cancel();
				this._disconnectRunner2.cancel();
				if (this._seenFirstListener) {
					// only replay events to subsequent (reconnected) listeners
					this._triggerReplay();
				}
				this._seenFirstListener = true;
			},
			onLastListenerRemove: () => {
				if (this.shouldPersistTerminal) {
					this._disconnectRunner1.schedule();
				} else {
					this.shutdown(true);
				}
			}
		}));
		this.events = this._events.event;

		this._bufferer = new TerminalDataBufferer((id, data) => {
			const ev: IRemoteTerminalProcessDataEvent = {
				type: 'data',
				data: data
			};
			this._events.fire(ev);
		});

		this._register(this._terminalProcess.onProcessReady((e: { pid: number, cwd: string; }) => {
			this._pid = e.pid;
			const ev: IRemoteTerminalProcessReadyEvent = {
				type: 'ready',
				pid: e.pid,
				cwd: e.cwd
			};
			this._events.fire(ev);
		}));

		this._register(this._terminalProcess.onProcessTitleChanged((title) => {
			this._title = title;
			const ev: IRemoteTerminalProcessTitleChangedEvent = {
				type: 'titleChanged',
				title: title
			};
			this._events.fire(ev);
		}));

		// Buffer data events to reduce the amount of messages going to the renderer
		this._register(this._bufferer.startBuffering(this._id, this._terminalProcess.onProcessData));
		this._register(this._terminalProcess.onProcessData(e => {
			this._recorder.recordData(e);
		}));
		this._register(this._terminalProcess.onProcessExit(exitCode => {
			this._bufferer.stopBuffering(this._id);

			const ev: IRemoteTerminalProcessExitEvent = {
				type: 'exit',
				exitCode: exitCode
			};
			this._events.fire(ev);

			// Remove process reference
			this._onExit();
		}));
	}

	public start(): Promise<ITerminalLaunchError | undefined> {
		return this._terminalProcess.start();
	}

	public shutdown(immediate: boolean): void {
		return this._terminalProcess.shutdown(immediate);
	}

	public input(data: string): void {
		return this._terminalProcess.input(data);
	}

	public acknowledgeCharCount(charCount: number): void {
		return this._terminalProcess.acknowledgeDataEvent(charCount);
	}

	public resize(cols: number, rows: number): void {
		this._recorder.recordResize(cols, rows);
		return this._terminalProcess.resize(cols, rows);
	}

	public getInitialCwd(): Promise<string> {
		return this._terminalProcess.getInitialCwd();
	}

	public getCwd(): Promise<string> {
		return this._terminalProcess.getCwd();
	}

	private _triggerReplay(): void {
		const ev = this._recorder.generateReplayEvent();
		let dataLength = 0;
		for (const e of ev.events) {
			dataLength += e.data.length;
		}

		this._logService.info(`Replaying ${dataLength} chars and ${ev.events.length} size events.`);
		this._events.fire(ev);
		this._terminalProcess.clearUnacknowledgedChars();
	}

	public sendCommandResult(reqId: number, isError: boolean, serializedPayload: any): void {
		const data = this._pendingCommands.get(reqId);
		if (!data) {
			return;
		}
		this._pendingCommands.delete(reqId);
	}

	public async orphanQuestionReply(): Promise<void> {
		this._orphanQuestionReplyTime = Date.now();
		if (this._orphanQuestionBarrier) {
			const barrier = this._orphanQuestionBarrier;
			this._orphanQuestionBarrier = null;
			barrier.open();
		}
	}

	public reduceGraceTime(): void {
		if (this._disconnectRunner2.isScheduled()) {
			// we are disconnected and already running the short reconnection timer
			return;
		}
		if (this._disconnectRunner1.isScheduled()) {
			// we are disconnected and running the long reconnection timer
			this._disconnectRunner2.schedule();
		}
	}

	public async isOrphaned(): Promise<boolean> {
		return await this._orphanRequestQueue.queue(async () => this._isOrphaned());
	}

	private async _isOrphaned(): Promise<boolean> {
		if (this._disconnectRunner1.isScheduled() || this._disconnectRunner2.isScheduled()) {
			return true;
		}

		if (!this._orphanQuestionBarrier) {
			// the barrier opens after 4 seconds with or without a reply
			this._orphanQuestionBarrier = new AutoOpenBarrier(4000);
			this._orphanQuestionReplyTime = 0;
			const ev: IRemoteTerminalProcessOrphanQuestionEvent = {
				type: 'orphan?'
			};
			this._events.fire(ev);
		}

		await this._orphanQuestionBarrier.wait();
		return (Date.now() - this._orphanQuestionReplyTime > 500);
	}
}
