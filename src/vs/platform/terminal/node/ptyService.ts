/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { AutoOpenBarrier, ProcessTimeRunOnceScheduler, Promises, Queue } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment, isWindows, OperatingSystem, OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { getSystemShell } from 'vs/base/node/shell';
import { ILogService } from 'vs/platform/log/common/log';
import { RequestStore } from 'vs/platform/terminal/common/requestStore';
import { IProcessDataEvent, IProcessReadyEvent, IPtyService, IRawTerminalInstanceLayoutInfo, IReconnectConstants, IRequestResolveVariablesEvent, IShellLaunchConfig, ITerminalInstanceLayoutInfoById, ITerminalLaunchError, ITerminalsLayoutInfo, ITerminalTabLayoutInfoById, TerminalIcon, IProcessProperty, TitleEventSource, ProcessPropertyType, IProcessPropertyMap, IFixedTerminalDimensions, ProcessCapability } from 'vs/platform/terminal/common/terminal';
import { TerminalDataBufferer } from 'vs/platform/terminal/common/terminalDataBuffering';
import { escapeNonWindowsPath } from 'vs/platform/terminal/common/terminalEnvironment';
import { Terminal as XtermTerminal } from 'xterm-headless';
import type { ISerializeOptions, SerializeAddon as XtermSerializeAddon } from 'xterm-addon-serialize';
import type { Unicode11Addon as XtermUnicode11Addon } from 'xterm-addon-unicode11';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, IPtyHostProcessReplayEvent, ISetTerminalLayoutInfoArgs, ITerminalTabLayoutInfoDto } from 'vs/platform/terminal/common/terminalProcess';
import { getWindowsBuildNumber } from 'vs/platform/terminal/node/terminalEnvironment';
import { TerminalProcess } from 'vs/platform/terminal/node/terminalProcess';
import { localize } from 'vs/nls';
import { ignoreProcessNames } from 'vs/platform/terminal/node/childProcessMonitor';

type WorkspaceId = string;

let SerializeAddon: typeof XtermSerializeAddon;
let Unicode11Addon: typeof XtermUnicode11Addon;

export class PtyService extends Disposable implements IPtyService {
	declare readonly _serviceBrand: undefined;

	private readonly _ptys: Map<number, PersistentTerminalProcess> = new Map();
	private readonly _workspaceLayoutInfos = new Map<WorkspaceId, ISetTerminalLayoutInfoArgs>();
	private readonly _detachInstanceRequestStore: RequestStore<IProcessDetails | undefined, { workspaceId: string, instanceId: number }>;
	private readonly _revivedPtyIdMap: Map<number, { newId: number, state: ISerializedTerminalState }> = new Map();

	private readonly _onHeartbeat = this._register(new Emitter<void>());
	readonly onHeartbeat = this._onHeartbeat.event;

	private readonly _onProcessData = this._register(new Emitter<{ id: number, event: IProcessDataEvent | string }>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReplay = this._register(new Emitter<{ id: number, event: IPtyHostProcessReplayEvent }>());
	readonly onProcessReplay = this._onProcessReplay.event;
	private readonly _onProcessReady = this._register(new Emitter<{ id: number, event: { pid: number, cwd: string, capabilities: ProcessCapability[] } }>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessExit = this._register(new Emitter<{ id: number, event: number | undefined }>());
	readonly onProcessExit = this._onProcessExit.event;
	private readonly _onProcessOrphanQuestion = this._register(new Emitter<{ id: number }>());
	readonly onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
	private readonly _onDidRequestDetach = this._register(new Emitter<{ requestId: number, workspaceId: string, instanceId: number }>());
	readonly onDidRequestDetach = this._onDidRequestDetach.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<{ id: number, property: IProcessProperty<any> }>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;

	constructor(
		private _lastPtyId: number,
		private readonly _logService: ILogService,
		private readonly _reconnectConstants: IReconnectConstants
	) {
		super();

		this._register(toDisposable(() => {
			for (const pty of this._ptys.values()) {
				pty.shutdown(true);
			}
			this._ptys.clear();
		}));

		this._detachInstanceRequestStore = this._register(new RequestStore(undefined, this._logService));
		this._detachInstanceRequestStore.onCreateRequest(this._onDidRequestDetach.fire, this._onDidRequestDetach);
	}

	async refreshIgnoreProcessNames(names: string[]): Promise<void> {
		ignoreProcessNames.length = 0;
		ignoreProcessNames.push(...names);
	}

	onPtyHostExit?: Event<number> | undefined;
	onPtyHostStart?: Event<void> | undefined;
	onPtyHostUnresponsive?: Event<void> | undefined;
	onPtyHostResponsive?: Event<void> | undefined;
	onPtyHostRequestResolveVariables?: Event<IRequestResolveVariablesEvent> | undefined;

	async requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		return this._detachInstanceRequestStore.createRequest({ workspaceId, instanceId });
	}

	async acceptDetachInstanceReply(requestId: number, persistentProcessId: number): Promise<void> {
		let processDetails: IProcessDetails | undefined = undefined;
		const pty = this._ptys.get(persistentProcessId);
		if (pty) {
			processDetails = await this._buildProcessDetails(persistentProcessId, pty);
		}
		this._detachInstanceRequestStore.acceptReply(requestId, processDetails);
	}

	async serializeTerminalState(ids: number[]): Promise<string> {
		const promises: Promise<ISerializedTerminalState>[] = [];
		for (const [persistentProcessId, persistentProcess] of this._ptys.entries()) {
			// Only serialize persistent processes that have had data written or performed a replay
			if (persistentProcess.hasWrittenData && ids.indexOf(persistentProcessId) !== -1) {
				promises.push(Promises.withAsyncBody<ISerializedTerminalState>(async r => {
					r({
						id: persistentProcessId,
						shellLaunchConfig: persistentProcess.shellLaunchConfig,
						processDetails: await this._buildProcessDetails(persistentProcessId, persistentProcess),
						processLaunchOptions: persistentProcess.processLaunchOptions,
						unicodeVersion: persistentProcess.unicodeVersion,
						replayEvent: await persistentProcess.serializeNormalBuffer(),
						timestamp: Date.now()
					});
				}));
			}
		}
		const serialized: ICrossVersionSerializedTerminalState = {
			version: 1,
			state: await Promise.all(promises)
		};
		return JSON.stringify(serialized);
	}

	async reviveTerminalProcesses(state: string) {
		const parsedUnknown = JSON.parse(state);
		if (!('version' in parsedUnknown) || !('state' in parsedUnknown) || !Array.isArray(parsedUnknown.state)) {
			this._logService.warn('Could not revive serialized processes, wrong format', parsedUnknown);
			return;
		}
		const parsedCrossVersion = parsedUnknown as ICrossVersionSerializedTerminalState;
		if (parsedCrossVersion.version !== 1) {
			this._logService.warn(`Could not revive serialized processes, wrong version "${parsedCrossVersion.version}"`, parsedCrossVersion);
			return;
		}
		const parsed = parsedCrossVersion.state as ISerializedTerminalState[];
		for (const state of parsed) {
			const restoreMessage = localize({
				key: 'terminal-session-restore',
				comment: ['date the snapshot was taken', 'time the snapshot was taken']
			}, "Session contents restored from {0} at {1}", new Date(state.timestamp).toLocaleDateString(), new Date(state.timestamp).toLocaleTimeString());
			const newId = await this.createProcess(
				{
					...state.shellLaunchConfig,
					cwd: state.processDetails.cwd,
					color: state.processDetails.color,
					icon: state.processDetails.icon,
					name: state.processDetails.title,
					initialText: state.replayEvent.events[0].data + '\x1b[0m\n\n\r\x1b[1;48;5;252;38;5;234m ' + restoreMessage + ' \x1b[K\x1b[0m\n\r'
				},
				state.processDetails.cwd,
				state.replayEvent.events[0].cols,
				state.replayEvent.events[0].rows,
				state.unicodeVersion,
				state.processLaunchOptions.env,
				state.processLaunchOptions.executableEnv,
				state.processLaunchOptions.windowsEnableConpty,
				true,
				state.processDetails.workspaceId,
				state.processDetails.workspaceName,
				true
			);
			// Don't start the process here as there's no terminal to answer CPR
			this._revivedPtyIdMap.set(state.id, { newId, state });
		}
	}

	async shutdownAll(): Promise<void> {
		this.dispose();
	}

	async createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment,
		executableEnv: IProcessEnvironment,
		windowsEnableConpty: boolean,
		shouldPersist: boolean,
		workspaceId: string,
		workspaceName: string,
		isReviving?: boolean
	): Promise<number> {
		if (shellLaunchConfig.attachPersistentProcess) {
			throw new Error('Attempt to create a process when attach object was provided');
		}
		const id = ++this._lastPtyId;
		const process = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, windowsEnableConpty, this._logService);
		process.onProcessData(event => this._onProcessData.fire({ id, event }));
		const processLaunchOptions: IPersistentTerminalProcessLaunchOptions = {
			env,
			executableEnv,
			windowsEnableConpty
		};
		const persistentProcess = new PersistentTerminalProcess(id, process, workspaceId, workspaceName, shouldPersist, cols, rows, processLaunchOptions, unicodeVersion, this._reconnectConstants, this._logService, isReviving ? shellLaunchConfig.initialText : undefined, shellLaunchConfig.icon, shellLaunchConfig.color, shellLaunchConfig.name, shellLaunchConfig.fixedDimensions);
		process.onDidChangeProperty(property => this._onDidChangeProperty.fire({ id, property }));
		process.onProcessExit(event => {
			persistentProcess.dispose();
			this._ptys.delete(id);
			this._onProcessExit.fire({ id, event });
		});
		persistentProcess.onProcessReplay(event => this._onProcessReplay.fire({ id, event }));
		persistentProcess.onProcessReady(event => this._onProcessReady.fire({ id, event }));
		persistentProcess.onProcessOrphanQuestion(() => this._onProcessOrphanQuestion.fire({ id }));
		persistentProcess.onDidChangeProperty(property => this._onDidChangeProperty.fire({ id, property }));
		this._ptys.set(id, persistentProcess);
		return id;
	}

	async attachToProcess(id: number): Promise<void> {
		try {
			this._throwIfNoPty(id).attach();
			this._logService.trace(`Persistent process reconnection "${id}"`);
		} catch (e) {
			this._logService.trace(`Persistent process reconnection "${id}" failed`, e.message);
		}
	}

	async updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void> {
		this._throwIfNoPty(id).setTitle(title, titleSource);
	}

	async updateIcon(id: number, icon: URI | { light: URI; dark: URI } | { id: string, color?: { id: string } }, color?: string): Promise<void> {
		this._throwIfNoPty(id).setIcon(icon, color);
	}

	async refreshProperty<T extends ProcessPropertyType>(id: number, type: T): Promise<IProcessPropertyMap[T]> {
		return this._throwIfNoPty(id).refreshProperty(type);
	}

	async updateProperty<T extends ProcessPropertyType>(id: number, type: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._throwIfNoPty(id).updateProperty(type, value);
	}

	async detachFromProcess(id: number): Promise<void> {
		return this._throwIfNoPty(id).detach();
	}

	async reduceConnectionGraceTime(): Promise<void> {
		for (const pty of this._ptys.values()) {
			pty.reduceGraceTime();
		}
	}

	async listProcesses(): Promise<IProcessDetails[]> {
		const persistentProcesses = Array.from(this._ptys.entries()).filter(([_, pty]) => pty.shouldPersistTerminal);

		this._logService.info(`Listing ${persistentProcesses.length} persistent terminals, ${this._ptys.size} total terminals`);
		const promises = persistentProcesses.map(async ([id, terminalProcessData]) => this._buildProcessDetails(id, terminalProcessData));
		const allTerminals = await Promise.all(promises);
		return allTerminals.filter(entry => entry.isOrphan);
	}

	async start(id: number): Promise<ITerminalLaunchError | undefined> {
		this._logService.trace('ptyService#start', id);
		const pty = this._ptys.get(id);
		return pty ? pty.start() : { message: `Could not find pty with id "${id}"` };
	}

	async shutdown(id: number, immediate: boolean): Promise<void> {
		// Don't throw if the pty is already shutdown
		this._logService.trace('ptyService#shutDown', id, immediate);
		return this._ptys.get(id)?.shutdown(immediate);
	}
	async input(id: number, data: string): Promise<void> {
		return this._throwIfNoPty(id).input(data);
	}
	async processBinary(id: number, data: string): Promise<void> {
		return this._throwIfNoPty(id).writeBinary(data);
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
	async acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._throwIfNoPty(id).acknowledgeDataEvent(charCount);
	}
	async setUnicodeVersion(id: number, version: '6' | '11'): Promise<void> {
		return this._throwIfNoPty(id).setUnicodeVersion(version);
	}
	async getLatency(id: number): Promise<number> {
		return 0;
	}
	async orphanQuestionReply(id: number): Promise<void> {
		return this._throwIfNoPty(id).orphanQuestionReply();
	}

	async getDefaultSystemShell(osOverride: OperatingSystem = OS): Promise<string> {
		return getSystemShell(osOverride, process.env);
	}

	async getEnvironment(): Promise<IProcessEnvironment> {
		return { ...process.env };
	}

	async getWslPath(original: string): Promise<string> {
		if (!isWindows) {
			return original;
		}
		if (getWindowsBuildNumber() < 17063) {
			return original.replace(/\\/g, '/');
		}
		return new Promise<string>(c => {
			const proc = execFile('bash.exe', ['-c', `wslpath ${escapeNonWindowsPath(original)}`], {}, (error, stdout, stderr) => {
				c(escapeNonWindowsPath(stdout.trim()));
			});
			proc.stdin!.end();
		});
	}

	async setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): Promise<void> {
		this._workspaceLayoutInfos.set(args.workspaceId, args);
	}

	async getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined> {
		const layout = this._workspaceLayoutInfos.get(args.workspaceId);
		this._logService.trace('ptyService#getLayoutInfo', args);
		if (layout) {
			const expandedTabs = await Promise.all(layout.tabs.map(async tab => this._expandTerminalTab(tab)));
			const tabs = expandedTabs.filter(t => t.terminals.length > 0);
			this._logService.trace('ptyService#returnLayoutInfo', tabs);
			return { tabs };
		}
		return undefined;
	}

	private async _expandTerminalTab(tab: ITerminalTabLayoutInfoById): Promise<ITerminalTabLayoutInfoDto> {
		const expandedTerminals = (await Promise.all(tab.terminals.map(t => this._expandTerminalInstance(t))));
		const filtered = expandedTerminals.filter(term => term.terminal !== null) as IRawTerminalInstanceLayoutInfo<IProcessDetails>[];
		return {
			isActive: tab.isActive,
			activePersistentProcessId: tab.activePersistentProcessId,
			terminals: filtered
		};
	}

	private async _expandTerminalInstance(t: ITerminalInstanceLayoutInfoById): Promise<IRawTerminalInstanceLayoutInfo<IProcessDetails | null>> {
		try {
			const revivedPtyId = this._revivedPtyIdMap.get(t.terminal)?.newId;
			const persistentProcessId = revivedPtyId ?? t.terminal;
			const persistentProcess = this._throwIfNoPty(persistentProcessId);
			const processDetails = persistentProcess && await this._buildProcessDetails(t.terminal, persistentProcess, revivedPtyId !== undefined);
			return {
				terminal: { ...processDetails, id: persistentProcessId } ?? null,
				relativeSize: t.relativeSize
			};
		} catch (e) {
			this._logService.trace(`Couldn't get layout info, a terminal was probably disconnected`, e.message);
			// this will be filtered out and not reconnected
			return {
				terminal: null,
				relativeSize: t.relativeSize
			};
		}
	}

	private async _buildProcessDetails(id: number, persistentProcess: PersistentTerminalProcess, wasRevived: boolean = false): Promise<IProcessDetails> {
		// If the process was just revived, don't do the orphan check as it will
		// take some time
		const [cwd, isOrphan] = await Promise.all([persistentProcess.getCwd(), wasRevived ? true : persistentProcess.isOrphaned()]);
		return {
			id,
			title: persistentProcess.title,
			titleSource: persistentProcess.titleSource,
			pid: persistentProcess.pid,
			workspaceId: persistentProcess.workspaceId,
			workspaceName: persistentProcess.workspaceName,
			cwd,
			isOrphan,
			icon: persistentProcess.icon,
			color: persistentProcess.color,
			fixedDimensions: persistentProcess.fixedDimensions
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


interface IPersistentTerminalProcessLaunchOptions {
	env: IProcessEnvironment;
	executableEnv: IProcessEnvironment;
	windowsEnableConpty: boolean;
}

export class PersistentTerminalProcess extends Disposable {

	private readonly _bufferer: TerminalDataBufferer;

	private readonly _pendingCommands = new Map<number, { resolve: (data: any) => void; reject: (err: any) => void; }>();

	private _isStarted: boolean = false;
	private _hasWrittenData: boolean = false;

	private _orphanQuestionBarrier: AutoOpenBarrier | null;
	private _orphanQuestionReplyTime: number;
	private _orphanRequestQueue = new Queue<boolean>();
	private _disconnectRunner1: ProcessTimeRunOnceScheduler;
	private _disconnectRunner2: ProcessTimeRunOnceScheduler;

	private readonly _onProcessReplay = this._register(new Emitter<IPtyHostProcessReplayEvent>());
	readonly onProcessReplay = this._onProcessReplay.event;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onProcessData = this._register(new Emitter<string>());
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessOrphanQuestion = this._register(new Emitter<void>());
	readonly onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<IProcessProperty<any>>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;

	private _inReplay = false;

	private _pid = -1;
	private _cwd = '';
	private _title: string | undefined;
	private _titleSource: TitleEventSource = TitleEventSource.Process;
	private _serializer: ITerminalSerializer;
	private _wasRevived: boolean;
	private _fixedDimensions: IFixedTerminalDimensions | undefined;

	get pid(): number { return this._pid; }
	get shellLaunchConfig(): IShellLaunchConfig { return this._terminalProcess.shellLaunchConfig; }
	get hasWrittenData(): boolean { return this._hasWrittenData; }
	get title(): string { return this._title || this._terminalProcess.currentTitle; }
	get titleSource(): TitleEventSource { return this._titleSource; }
	get icon(): TerminalIcon | undefined { return this._icon; }
	get color(): string | undefined { return this._color; }
	get fixedDimensions(): IFixedTerminalDimensions | undefined { return this._fixedDimensions; }

	setTitle(title: string, titleSource: TitleEventSource): void {
		this._title = title;
		this._titleSource = titleSource;
	}

	setIcon(icon: TerminalIcon, color?: string): void {
		this._icon = icon;
		this._color = color;
	}

	private _setFixedDimensions(fixedDimensions?: IFixedTerminalDimensions): void {
		this._fixedDimensions = fixedDimensions;
	}

	constructor(
		private _persistentProcessId: number,
		private readonly _terminalProcess: TerminalProcess,
		readonly workspaceId: string,
		readonly workspaceName: string,
		readonly shouldPersistTerminal: boolean,
		cols: number,
		rows: number,
		readonly processLaunchOptions: IPersistentTerminalProcessLaunchOptions,
		public unicodeVersion: '6' | '11',
		reconnectConstants: IReconnectConstants,
		private readonly _logService: ILogService,
		reviveBuffer: string | undefined,
		private _icon?: TerminalIcon,
		private _color?: string,
		name?: string,
		fixedDimensions?: IFixedTerminalDimensions
	) {
		super();
		if (name) {
			this.setTitle(name, TitleEventSource.Api);
		}
		this._logService.trace('persistentTerminalProcess#ctor', _persistentProcessId, arguments);
		this._wasRevived = reviveBuffer !== undefined;
		this._serializer = new XtermSerializer(
			cols,
			rows,
			reconnectConstants.scrollback,
			unicodeVersion,
			reviveBuffer
		);
		this._fixedDimensions = fixedDimensions;
		this._orphanQuestionBarrier = null;
		this._orphanQuestionReplyTime = 0;
		this._disconnectRunner1 = this._register(new ProcessTimeRunOnceScheduler(() => {
			this._logService.info(`Persistent process "${this._persistentProcessId}": The reconnection grace time of ${printTime(reconnectConstants.graceTime)} has expired, shutting down pid "${this._pid}"`);
			this.shutdown(true);
		}, reconnectConstants.graceTime));
		this._disconnectRunner2 = this._register(new ProcessTimeRunOnceScheduler(() => {
			this._logService.info(`Persistent process "${this._persistentProcessId}": The short reconnection grace time of ${printTime(reconnectConstants.shortGraceTime)} has expired, shutting down pid ${this._pid}`);
			this.shutdown(true);
		}, reconnectConstants.shortGraceTime));
		this._register(this._terminalProcess.onProcessExit(() => this._bufferer.stopBuffering(this._persistentProcessId)));
		this._register(this._terminalProcess.onProcessReady(e => {
			this._pid = e.pid;
			this._cwd = e.cwd;
			this._onProcessReady.fire(e);
		}));
		this._register(this._terminalProcess.onDidChangeProperty(e => {
			this._onDidChangeProperty.fire(e);
		}));

		// Data buffering to reduce the amount of messages going to the renderer
		this._bufferer = new TerminalDataBufferer((_, data) => this._onProcessData.fire(data));
		this._register(this._bufferer.startBuffering(this._persistentProcessId, this._terminalProcess.onProcessData));

		// Data recording for reconnect
		this._register(this.onProcessData(e => this._serializer.handleData(e)));
	}

	attach(): void {
		this._logService.trace('persistentTerminalProcess#attach', this._persistentProcessId);
		this._disconnectRunner1.cancel();
		this._disconnectRunner2.cancel();
	}

	async detach(): Promise<void> {
		this._logService.trace('persistentTerminalProcess#detach', this._persistentProcessId);
		if (this.shouldPersistTerminal) {
			this._disconnectRunner1.schedule();
		} else {
			this.shutdown(true);
		}
	}

	serializeNormalBuffer(): Promise<IPtyHostProcessReplayEvent> {
		return this._serializer.generateReplayEvent(true);
	}

	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		return this._terminalProcess.refreshProperty(type);
	}

	async updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		if (type === ProcessPropertyType.FixedDimensions) {
			return this._setFixedDimensions(value as IProcessPropertyMap[ProcessPropertyType.FixedDimensions]);
		}
	}

	async start(): Promise<ITerminalLaunchError | undefined> {
		this._logService.trace('persistentTerminalProcess#start', this._persistentProcessId, this._isStarted);
		if (!this._isStarted) {
			const result = await this._terminalProcess.start();
			if (result) {
				// it's a terminal launch error
				return result;
			}
			this._isStarted = true;

			// If the process was revived, trigger a replay on first start. An alternative approach
			// could be to start it on the pty host before attaching but this fails on Windows as
			// conpty's inherit cursor option which is required, ends up sending DSR CPR which
			// causes conhost to hang when no response is received from the terminal (which wouldn't
			// be attached yet). https://github.com/microsoft/terminal/issues/11213
			if (this._wasRevived) {
				this.triggerReplay();
			}
		} else {
			this._onProcessReady.fire({ pid: this._pid, cwd: this._cwd, capabilities: this._terminalProcess.capabilities, requiresWindowsMode: isWindows && getWindowsBuildNumber() < 21376 });
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._terminalProcess.currentTitle });
			this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: this._terminalProcess.shellType });
			this.triggerReplay();
		}
		return undefined;
	}
	shutdown(immediate: boolean): void {
		return this._terminalProcess.shutdown(immediate);
	}
	input(data: string): void {
		this._hasWrittenData = true;
		if (this._inReplay) {
			return;
		}
		return this._terminalProcess.input(data);
	}
	writeBinary(data: string): Promise<void> {
		return this._terminalProcess.processBinary(data);
	}
	resize(cols: number, rows: number): void {
		if (this._inReplay) {
			return;
		}
		this._serializer.handleResize(cols, rows);

		// Buffered events should flush when a resize occurs
		this._bufferer.flushBuffer(this._persistentProcessId);
		return this._terminalProcess.resize(cols, rows);
	}
	setUnicodeVersion(version: '6' | '11'): void {
		this.unicodeVersion = version;
		this._serializer.setUnicodeVersion?.(version);
		// TODO: Pass in unicode version in ctor
	}
	acknowledgeDataEvent(charCount: number): void {
		if (this._inReplay) {
			return;
		}
		return this._terminalProcess.acknowledgeDataEvent(charCount);
	}
	getInitialCwd(): Promise<string> {
		return this._terminalProcess.getInitialCwd();
	}
	getCwd(): Promise<string> {
		return this._terminalProcess.getCwd();
	}
	getLatency(): Promise<number> {
		return this._terminalProcess.getLatency();
	}

	async triggerReplay(): Promise<void> {
		this._hasWrittenData = true;
		const ev = await this._serializer.generateReplayEvent();
		let dataLength = 0;
		for (const e of ev.events) {
			dataLength += e.data.length;
		}
		this._logService.info(`Persistent process "${this._persistentProcessId}": Replaying ${dataLength} chars and ${ev.events.length} size events`);
		this._onProcessReplay.fire(ev);
		this._terminalProcess.clearUnacknowledgedChars();
	}

	sendCommandResult(reqId: number, isError: boolean, serializedPayload: any): void {
		const data = this._pendingCommands.get(reqId);
		if (!data) {
			return;
		}
		this._pendingCommands.delete(reqId);
	}

	orphanQuestionReply(): void {
		this._orphanQuestionReplyTime = Date.now();
		if (this._orphanQuestionBarrier) {
			const barrier = this._orphanQuestionBarrier;
			this._orphanQuestionBarrier = null;
			barrier.open();
		}
	}

	reduceGraceTime(): void {
		if (this._disconnectRunner2.isScheduled()) {
			// we are disconnected and already running the short reconnection timer
			return;
		}
		if (this._disconnectRunner1.isScheduled()) {
			// we are disconnected and running the long reconnection timer
			this._disconnectRunner2.schedule();
		}
	}

	async isOrphaned(): Promise<boolean> {
		return await this._orphanRequestQueue.queue(async () => this._isOrphaned());
	}

	private async _isOrphaned(): Promise<boolean> {
		// The process is already known to be orphaned
		if (this._disconnectRunner1.isScheduled() || this._disconnectRunner2.isScheduled()) {
			return true;
		}

		// Ask whether the renderer(s) whether the process is orphaned and await the reply
		if (!this._orphanQuestionBarrier) {
			// the barrier opens after 4 seconds with or without a reply
			this._orphanQuestionBarrier = new AutoOpenBarrier(4000);
			this._orphanQuestionReplyTime = 0;
			this._onProcessOrphanQuestion.fire();
		}

		await this._orphanQuestionBarrier.wait();
		return (Date.now() - this._orphanQuestionReplyTime > 500);
	}
}

class XtermSerializer implements ITerminalSerializer {
	private _xterm: XtermTerminal;
	private _unicodeAddon?: XtermUnicode11Addon;

	constructor(
		cols: number,
		rows: number,
		scrollback: number,
		unicodeVersion: '6' | '11',
		reviveBuffer: string | undefined
	) {
		this._xterm = new XtermTerminal({ cols, rows, scrollback });
		if (reviveBuffer) {
			this._xterm.writeln(reviveBuffer);
		}
		this.setUnicodeVersion(unicodeVersion);
	}

	handleData(data: string): void {
		this._xterm.write(data);
	}

	handleResize(cols: number, rows: number): void {
		this._xterm.resize(cols, rows);
	}

	async generateReplayEvent(normalBufferOnly?: boolean): Promise<IPtyHostProcessReplayEvent> {
		const serialize = new (await this._getSerializeConstructor());
		this._xterm.loadAddon(serialize);
		const options: ISerializeOptions = { scrollback: this._xterm.getOption('scrollback') };
		if (normalBufferOnly) {
			options.excludeAltBuffer = true;
			options.excludeModes = true;
		}
		const serialized = serialize.serialize(options);
		return {
			events: [
				{
					cols: this._xterm.getOption('cols'),
					rows: this._xterm.getOption('rows'),
					data: serialized
				}
			]
		};
	}

	async setUnicodeVersion(version: '6' | '11'): Promise<void> {
		if (this._xterm.unicode.activeVersion === version) {
			return;
		}
		if (version === '11') {
			this._unicodeAddon = new (await this._getUnicode11Constructor());
			this._xterm.loadAddon(this._unicodeAddon);
		} else {
			this._unicodeAddon?.dispose();
			this._unicodeAddon = undefined;
		}
		this._xterm.unicode.activeVersion = version;
	}

	async _getUnicode11Constructor(): Promise<typeof Unicode11Addon> {
		if (!Unicode11Addon) {
			Unicode11Addon = (await import('xterm-addon-unicode11')).Unicode11Addon;
		}
		return Unicode11Addon;
	}

	async _getSerializeConstructor(): Promise<typeof SerializeAddon> {
		if (!SerializeAddon) {
			SerializeAddon = (await import('xterm-addon-serialize')).SerializeAddon;
		}
		return SerializeAddon;
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

/**
 * Serialized terminal state matching the interface that can be used across versions, the version
 * should be verified before using the state payload.
 */
export interface ICrossVersionSerializedTerminalState {
	version: number;
	state: unknown;
}

export interface ISerializedTerminalState {
	id: number;
	shellLaunchConfig: IShellLaunchConfig;
	processDetails: IProcessDetails;
	processLaunchOptions: IPersistentTerminalProcessLaunchOptions;
	unicodeVersion: '6' | '11';
	replayEvent: IPtyHostProcessReplayEvent;
	timestamp: number;
}

export interface ITerminalSerializer {
	handleData(data: string): void;
	handleResize(cols: number, rows: number): void;
	generateReplayEvent(normalBufferOnly?: boolean): Promise<IPtyHostProcessReplayEvent>;
	setUnicodeVersion?(version: '6' | '11'): void;
}
