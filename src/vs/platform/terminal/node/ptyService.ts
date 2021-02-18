/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IPtyService, IProcessDataEvent, IShellLaunchConfig, ITerminalDimensionsOverride, ITerminalLaunchError, LocalReconnectConstants, ITerminalsLayoutInfo, IRawTerminalInstanceLayoutInfo, ITerminalTabLayoutInfoById, ITerminalInstanceLayoutInfoById } from 'vs/platform/terminal/common/terminal';
import { AutoOpenBarrier, Queue, RunOnceScheduler } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { TerminalRecorder } from 'vs/platform/terminal/common/terminalRecorder';
import { TerminalProcess } from 'vs/platform/terminal/node/terminalProcess';
import { ISetTerminalLayoutInfoArgs, ITerminalTabLayoutInfoDto, IPtyHostDescriptionDto, IGetTerminalLayoutInfoArgs, IPtyHostProcessReplayEvent, IOrphanQuestionReplyArgs } from 'vs/platform/terminal/common/terminalProcess';
import { ILogService } from 'vs/platform/log/common/log';
import { createRandomIPCHandle } from 'vs/base/parts/ipc/node/ipc.net';

// TODO: On disconnect/restart, this will overwrite the older terminals
let currentPtyId = 0;
type WorkspaceId = string;
export class PtyService extends Disposable implements IPtyService {
	declare readonly _serviceBrand: undefined;

	private readonly _ptys: Map<number, PersistentTerminalProcess> = new Map();

	private readonly _workspaceLayoutInfos = new Map<WorkspaceId, ISetTerminalLayoutInfoArgs>();

	private readonly _onHeartbeat = this._register(new Emitter<void>());
	readonly onHeartbeat = this._onHeartbeat.event;

	private readonly _onProcessData = this._register(new Emitter<{ id: number, event: IProcessDataEvent | string }>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReplay = this._register(new Emitter<{ id: number, event: IPtyHostProcessReplayEvent }>());
	readonly onProcessReplay = this._onProcessReplay.event;
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

	onPtyHostExit?: Event<number> | undefined;
	onPtyHostStart?: Event<void> | undefined;

	orphanQuestionReply(args: IOrphanQuestionReplyArgs): Promise<void> {
		return this._throwIfNoPty(args.id).orphanQuestionReply();
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

	async fetchPersistentTerminalProcess(id: number): Promise<number> {
		await this._throwIfNoPty(id);
		this._logService.info('fetched process to reconnect', id);
		return id;
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, executableEnv: IProcessEnvironment, windowsEnableConpty: boolean, workspaceId: string, workspaceName: string): Promise<number> {
		const id = ++currentPtyId;
		const process = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, windowsEnableConpty, this._logService);
		process.onProcessData(event => this._onProcessData.fire({ id, event }));
		process.onProcessExit(event => this._onProcessExit.fire({ id, event }));
		if (process.onProcessOverrideDimensions) {
			process.onProcessOverrideDimensions(event => this._onProcessOverrideDimensions.fire({ id, event }));
		}
		if (process.onProcessResolvedShellLaunchConfig) {
			process.onProcessResolvedShellLaunchConfig(event => this._onProcessResolvedShellLaunchConfig.fire({ id, event }));
		}
		const ipcHandlePath = createRandomIPCHandle();
		env.VSCODE_IPC_HOOK_CLI = ipcHandlePath;
		const persistentTerminalProcess = new PersistentTerminalProcess(id, process, workspaceId, workspaceName, true, cols, rows, ipcHandlePath, this._logService, () => {
			persistentTerminalProcess.dispose();
			this._ptys.delete(id);
		}, shellLaunchConfig.attachPersistentTerminal);
		persistentTerminalProcess.onProcessReplay(event => this._onProcessReplay.fire({ id, event }));
		persistentTerminalProcess.onProcessReady(event => this._onProcessReady.fire({ id, event }));
		persistentTerminalProcess.onProcessTitleChanged(event => this._onProcessTitleChanged.fire({ id, event }));
		this._ptys.set(id, persistentTerminalProcess);
		return id;
	}

	async start(id: number): Promise<ITerminalLaunchError | { persistentTerminalId: number; } | undefined> {
		return this._throwIfNoPty(id).start();
	}

	async shutdownAll(): Promise<void> {
		this.dispose();
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

	async triggerReplay(id: number): Promise<void> {
		return this._throwIfNoPty(id).triggerReplay();
	}

	async getCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getCwd();
	}

	public async setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): Promise<void> {
		this._workspaceLayoutInfos.set(args.workspaceId, args);
	}

	public async getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined> {
		if (args) {
			const layout = this._workspaceLayoutInfos.get(args.workspaceId);
			if (layout) {
				const expandedTabs = await Promise.all(layout.tabs.map(async tab => this._expandTerminalTab(tab)));
				const filtered = expandedTabs.filter(t => t.terminals.length > 0);
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
		const persistentTerminalProcess = this._throwIfNoPty(t.terminal);
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

	// private _orphanQuestionReply(args: IOrphanQuestionReplyArgs): void {
	// 	const persistentTerminalProcess = this._throwIfNoPty(args.id);
	// 	persistentTerminalProcess.orphanQuestionReply();
	// }
}

export class PersistentTerminalProcess extends Disposable {

	// private readonly _bufferer: TerminalDataBufferer;

	private readonly _pendingCommands = new Map<number, { resolve: (data: any) => void; reject: (err: any) => void; }>();

	private readonly _recorder: TerminalRecorder;
	private _isStarted: boolean = false;

	private _orphanQuestionBarrier: AutoOpenBarrier | null;
	private _orphanQuestionReplyTime: number;
	private _orphanRequestQueue = new Queue<boolean>();
	private _disconnectRunner1: RunOnceScheduler;
	private _disconnectRunner2: RunOnceScheduler;
	private readonly _onProcessReplay = this._register(new Emitter<IPtyHostProcessReplayEvent>());
	public get onProcessReplay(): Event<IPtyHostProcessReplayEvent> { return this._onProcessReplay.event; }
	private readonly _onProcessReady = this._register(new Emitter<{ pid: number, cwd: string }>());
	public get onProcessReady(): Event<{ pid: number, cwd: string }> { return this._onProcessReady.event; }
	private readonly _onProcessTitleChanged = this._register(new Emitter<string>());
	public get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<ITerminalDimensionsOverride | undefined>());
	public readonly onProcessOverrideDimensions: Event<ITerminalDimensionsOverride | undefined> = this._onProcessOverrideDimensions.event;
	public readonly _onProcessData = this._register(new Emitter<IProcessDataEvent>());
	public readonly onProcessData: Event<IProcessDataEvent> = this._onProcessData.event;
	public readonly _onOrphanQuestionReply = this._register(new Emitter<IOrphanQuestionReplyArgs>());
	public readonly onOrphanQuestionReply: Event<IOrphanQuestionReplyArgs> = this._onOrphanQuestionReply.event;

	private _inReplay = false;

	private _title = '';
	private _pid = -1;

	public get pid(): number {
		return this._pid;
	}

	public get title(): string {
		return this._title;
	}

	constructor(
		private readonly _persistentTerminalId: number,
		private readonly _terminalProcess: TerminalProcess,
		public readonly workspaceId: string,
		public readonly workspaceName: string,
		public readonly shouldPersistTerminal: boolean,
		cols: number, rows: number,
		ipcHandlePath: string,
		private readonly _logService: ILogService,
		private readonly _onExit: () => void,
		private readonly _attachPersistentTerminal?: any
	) {
		super();
		this._recorder = new TerminalRecorder(cols, rows);

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

		// TODO: Bring back bufferer
		// this._bufferer = new TerminalDataBufferer((id, data) => {
		// 	const ev: IPtyHostProcessDataEvent = {
		// 		type: 'data',
		// 		data: data
		// 	};
		// 	this._events.fire(ev);
		// });

		this._register(this._terminalProcess.onProcessReady(e => this.triggerReplay()));

		this._register(this.onOrphanQuestionReply((event: IOrphanQuestionReplyArgs) => {
			this.orphanQuestionReply();
		}));

		this._register(this._terminalProcess.onProcessReady(e => this._onProcessReady.fire(e)));
		this._register(this._terminalProcess.onProcessTitleChanged(e => this._onProcessTitleChanged.fire(e)));

		// Buffer data events to reduce the amount of messages going to the renderer
		// this._register(this._bufferer.startBuffering(this._persistentTerminalId, this._terminalProcess.onProcessData));
		this._register(this._terminalProcess.onProcessData(e => {
			this._recorder.recordData(e);
		}));
		this._register(this._terminalProcess.onProcessExit(exitCode => {
			// this._bufferer.stopBuffering(this._persistentTerminalId);

			// const ev: IPtyHostProcessExitEvent = {
			// 	type: 'exit',
			// 	exitCode: exitCode
			// };
			// this._events.fire(ev);

			// Remove process reference
			// TODO: Use an event
			this._onExit();
		}));
	}
	acknowledgeDataEvent(charCount: number): void {
		return this._terminalProcess.acknowledgeDataEvent(charCount);
	}
	getLatency(): Promise<number> {
		throw new Error('Method not implemented.');
	}

	public async start(): Promise<ITerminalLaunchError | { persistentTerminalId: number } | undefined> {
		if (!this._isStarted) {
			await this._terminalProcess.start();
			this._isStarted = true;
		} else {
			if (!this._attachPersistentTerminal) {
				this._onProcessReady.fire({ pid: -1, cwd: await this._terminalProcess.getCwd() });
			} else {
				this._onProcessReady.fire({ pid: this._attachPersistentTerminal.pid, cwd: await this._terminalProcess.getCwd() });
			}
			this._onProcessTitleChanged.fire(this._terminalProcess.currentTitle);
		}
		// TODO: Pass back launch error
		return { persistentTerminalId: this._persistentTerminalId };
	}

	public shutdown(immediate: boolean): void {
		return this._terminalProcess.shutdown(immediate);
	}

	public input(data: string): void {
		if (this._inReplay) {
			return;
		}
		return this._terminalProcess.input(data);
	}

	public acknowledgeCharCount(charCount: number): void {
		if (this._inReplay) {
			return;
		}
		return this._terminalProcess.acknowledgeDataEvent(charCount);
	}

	public resize(cols: number, rows: number): void {
		if (this._inReplay) {
			return;
		}
		this._recorder.recordResize(cols, rows);
		return this._terminalProcess.resize(cols, rows);
	}

	public getInitialCwd(): Promise<string> {
		return this._terminalProcess.getInitialCwd();
	}

	public getCwd(): Promise<string> {
		return this._terminalProcess.getCwd();
	}

	public triggerReplay(): void {
		const ev = this._recorder.generateReplayEvent();
		let dataLength = 0;
		for (const e of ev.events) {
			dataLength += e.data.length;
		}

		this._logService.info(`Replaying ${dataLength} chars and ${ev.events.length} size events.`);
		this._onProcessReplay.fire(ev);
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
			// TODO: Fire?
			// const ev: IPtyHostProcessOrphanQuestionEvent = {
			// 	type: 'orphan?'
			// };
			// this._events.fire(ev);
		}

		await this._orphanQuestionBarrier.wait();
		return (Date.now() - this._orphanQuestionReplyTime > 500);
	}
}

function printTime(ms: number): string {
	let h = 0;
	let m = 0;
	let s = 0;
	if (ms >= 1000) {
		s = Math.floor(ms / 1000);
		ms -= s * 1000;
	}
	if (s >= 60) {
		m = Math.floor(s / 60);
		s -= m * 60;
	}
	if (m >= 60) {
		h = Math.floor(m / 60);
		m -= h * 60;
	}
	const _h = h ? `${h}h` : ``;
	const _m = m ? `${m}m` : ``;
	const _s = s ? `${s}s` : ``;
	const _ms = ms ? `${ms}ms` : ``;
	return `${_h}${_m}${_s}${_ms}`;
}
