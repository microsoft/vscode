/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IPtyService, IProcessDataEvent, IShellLaunchConfig, ITerminalDimensionsOverride, ITerminalLaunchError, printTime, LocalReconnectConstants, ITerminalsLayoutInfo, IRawTerminalInstanceLayoutInfo, ITerminalTabLayoutInfoById, ITerminalInstanceLayoutInfoById } from 'vs/platform/terminal/common/terminal';
import { AutoOpenBarrier, Queue, RunOnceScheduler } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { TerminalDataBufferer } from 'vs/platform/terminal/common/terminalDataBuffering';
import { TerminalRecorder } from 'vs/platform/terminal/common/terminalRecorder';
import { TerminalProcess } from 'vs/platform/terminal/node/terminalProcess';
import { IPtyHostProcessEvent, IPtyHostProcessDataEvent, IPtyHostProcessReadyEvent, IPtyHostProcessTitleChangedEvent, IPtyHostProcessExitEvent, IPtyHostProcessOrphanQuestionEvent, ISetTerminalLayoutInfoArgs, ITerminalTabLayoutInfoDto, IPtyHostDescriptionDto, IGetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';
import { ILogService } from 'vs/platform/log/common/log';

let currentPtyId = 0;

type WorkspaceId = string;

export class PtyService extends Disposable implements IPtyService {
	declare readonly _serviceBrand: undefined;

	private readonly _ptys: Map<number, PersistentTerminalProcess> = new Map();

	private readonly _workspaceLayoutInfos = new Map<WorkspaceId, ISetTerminalLayoutInfoArgs>();

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
		private readonly _logService: ILogService
	) {
		super();
	}

	async acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._throwIfNoPty(id).acknowledgeCharCount(charCount);
	}

	// following suit with the remoteTerminalService impl
	async getLatency(id: number): Promise<number> {
		return 0;
	}

	dispose() {
		for (const pty of this._ptys.values()) {
			pty.shutdown(true);
		}
		this._ptys.clear();
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean): Promise<number> {
		const id = ++currentPtyId;
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
			this._ptys.delete(id);
		});
		this._ptys.set(id, persistentTerminalProcess);
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

	public async setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): Promise<void> {
		this._workspaceLayoutInfos.set(args.workspaceId, args);
	}

	public async getTerminalLayoutInfo(args?: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined> {
		if (args) {
			const layout = this._workspaceLayoutInfos.get(args.workspaceId);
			if (layout) {
				const expandedTabs = await Promise.all(layout.tabs.map(async tab => this._expandTerminalTab(tab)));
				const filtered = expandedTabs.filter(t => t.terminals.length > 0);
				this._logService.info(`Terminal layout retrieved: ${JSON.stringify(filtered.map(t => t.terminals.length))}`);

				return {
					tabs: filtered
				};
			}

		}
		return undefined;
	}

	private async _expandTerminalTab(tab: ITerminalTabLayoutInfoById): Promise<ITerminalTabLayoutInfoDto> {
		const expandedTerminals = (await Promise.all(tab.terminals.map(t => this._expandTerminalInstance(t))));
		const filtered = expandedTerminals.filter(term => term.terminal !== null) as IRawTerminalInstanceLayoutInfo<IPtyHostDescriptionDto>[];
		return {
			isActive: tab.isActive,
			activeTerminalProcessId: tab.activeTerminalProcessId,
			terminals: filtered
		};
	}

	private async _expandTerminalInstance(t: ITerminalInstanceLayoutInfoById): Promise<IRawTerminalInstanceLayoutInfo<IPtyHostDescriptionDto | null>> {
		const persistentTerminalProcess = this._ptys.get(t.terminal);
		const termDto = persistentTerminalProcess && await this._terminalToDto(t.terminal, persistentTerminalProcess);
		return {
			terminal: termDto ?? null,
			relativeSize: t.relativeSize
		};
	}

	private async _terminalToDto(id: number, persistentTerminalProcess: PersistentTerminalProcess): Promise<IPtyHostDescriptionDto> {
		const [cwd, isOrphan] = await Promise.all([persistentTerminalProcess.getCwd(), persistentTerminalProcess.isOrphaned()]);
		return {
			id,
			title: persistentTerminalProcess.title,
			pid: persistentTerminalProcess.pid,
			workspaceId: persistentTerminalProcess.workspaceId,
			workspaceName: persistentTerminalProcess.workspaceName,
			cwd,
			isOrphan
		};
	}

	private _throwIfNoPty(id: number): PersistentTerminalProcess {
		const pty = this._ptys.get(id);
		if (!pty) {
			throw new Error(`Could not find pty with id "${id}"`);
		}
		return pty;
	}
}

export class PersistentTerminalProcess extends Disposable {

	private readonly _events: Emitter<IPtyHostProcessEvent>;
	public readonly events: Event<IPtyHostProcessEvent>;

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
			this._logService.info(`The reconnection grace time of ${printTime(LocalReconnectConstants.ReconnectionGraceTime)} has expired, so the terminal process with pid ${this._pid} will be shutdown.`);
			this.shutdown(true);
		}, LocalReconnectConstants.ReconnectionGraceTime));
		this._disconnectRunner2 = this._register(new RunOnceScheduler(() => {
			this._logService.info(`The short reconnection grace time of ${printTime(LocalReconnectConstants.ReconnectionShortGraceTime)} has expired, so the terminal process with pid ${this._pid} will be shutdown.`);
			this.shutdown(true);
		}, LocalReconnectConstants.ReconnectionShortGraceTime));

		this._events = this._register(new Emitter<IPtyHostProcessEvent>({
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
			const ev: IPtyHostProcessDataEvent = {
				type: 'data',
				data: data
			};
			this._events.fire(ev);
		});

		this._register(this._terminalProcess.onProcessReady((e: { pid: number, cwd: string; }) => {
			this._pid = e.pid;
			const ev: IPtyHostProcessReadyEvent = {
				type: 'ready',
				pid: e.pid,
				cwd: e.cwd
			};
			this._events.fire(ev);
		}));

		this._register(this._terminalProcess.onProcessTitleChanged((title) => {
			this._title = title;
			const ev: IPtyHostProcessTitleChangedEvent = {
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

			const ev: IPtyHostProcessExitEvent = {
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
			const ev: IPtyHostProcessOrphanQuestionEvent = {
				type: 'orphan?'
			};
			this._events.fire(ev);
		}

		await this._orphanQuestionBarrier.wait();
		return (Date.now() - this._orphanQuestionReplyTime > 500);
	}
}
