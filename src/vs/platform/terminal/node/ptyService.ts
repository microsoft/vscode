/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile, exec } from 'child_process';
import { AutoOpenBarrier, ProcessTimeRunOnceScheduler, Promises, Queue, timeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IProcessEnvironment, isWindows, OperatingSystem, OS } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { getSystemShell } from '../../../base/node/shell.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { RequestStore } from '../common/requestStore.js';
import { IProcessDataEvent, IProcessReadyEvent, IPtyService, IRawTerminalInstanceLayoutInfo, IReconnectConstants, IShellLaunchConfig, ITerminalInstanceLayoutInfoById, ITerminalLaunchError, ITerminalsLayoutInfo, ITerminalTabLayoutInfoById, TerminalIcon, IProcessProperty, TitleEventSource, ProcessPropertyType, IProcessPropertyMap, IFixedTerminalDimensions, IPersistentTerminalProcessLaunchConfig, ICrossVersionSerializedTerminalState, ISerializedTerminalState, ITerminalProcessOptions, IPtyHostLatencyMeasurement, type IPtyServiceContribution } from '../common/terminal.js';
import { TerminalDataBufferer } from '../common/terminalDataBuffering.js';
import { escapeNonWindowsPath } from '../common/terminalEnvironment.js';
import type { ISerializeOptions, SerializeAddon as XtermSerializeAddon } from '@xterm/addon-serialize';
import type { Unicode11Addon as XtermUnicode11Addon } from '@xterm/addon-unicode11';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, ISetTerminalLayoutInfoArgs, ITerminalTabLayoutInfoDto } from '../common/terminalProcess.js';
import { getWindowsBuildNumber } from './terminalEnvironment.js';
import { TerminalProcess } from './terminalProcess.js';
import { localize } from '../../../nls.js';
import { ignoreProcessNames } from './childProcessMonitor.js';
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { ShellIntegrationAddon } from '../common/xterm/shellIntegrationAddon.js';
import { formatMessageForTerminal } from '../common/terminalStrings.js';
import { IPtyHostProcessReplayEvent } from '../common/capabilities/capabilities.js';
import { IProductService } from '../../product/common/productService.js';
import { join } from 'path';
import { memoize } from '../../../base/common/decorators.js';
import * as performance from '../../../base/common/performance.js';
import pkg from '@xterm/headless';
import { AutoRepliesPtyServiceContribution } from './terminalContrib/autoReplies/autoRepliesContribController.js';

type XtermTerminal = pkg.Terminal;
const { Terminal: XtermTerminal } = pkg;

export function traceRpc(_target: any, key: string, descriptor: any) {
	if (typeof descriptor.value !== 'function') {
		throw new Error('not supported');
	}
	const fnKey = 'value';
	const fn = descriptor.value;
	descriptor[fnKey] = async function (...args: any[]) {
		if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
			this.traceRpcArgs.logService.trace(`[RPC Request] PtyService#${fn.name}(${args.map(e => JSON.stringify(e)).join(', ')})`);
		}
		if (this.traceRpcArgs.simulatedLatency) {
			await timeout(this.traceRpcArgs.simulatedLatency);
		}
		let result: any;
		try {
			result = await fn.apply(this, args);
		} catch (e) {
			this.traceRpcArgs.logService.error(`[RPC Response] PtyService#${fn.name}`, e);
			throw e;
		}
		if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
			this.traceRpcArgs.logService.trace(`[RPC Response] PtyService#${fn.name}`, result);
		}
		return result;
	};
}

type WorkspaceId = string;

let SerializeAddon: typeof XtermSerializeAddon;
let Unicode11Addon: typeof XtermUnicode11Addon;

export class PtyService extends Disposable implements IPtyService {
	declare readonly _serviceBrand: undefined;

	private readonly _ptys: Map<number, PersistentTerminalProcess> = new Map();
	private readonly _workspaceLayoutInfos = new Map<WorkspaceId, ISetTerminalLayoutInfoArgs>();
	private readonly _detachInstanceRequestStore: RequestStore<IProcessDetails | undefined, { workspaceId: string; instanceId: number }>;
	private readonly _revivedPtyIdMap: Map<string, { newId: number; state: ISerializedTerminalState }> = new Map();

	// #region Pty service contribution RPC calls

	private readonly _autoRepliesContribution = new AutoRepliesPtyServiceContribution(this._logService);
	@traceRpc
	async installAutoReply(match: string, reply: string) {
		await this._autoRepliesContribution.installAutoReply(match, reply);
	}
	@traceRpc
	async uninstallAllAutoReplies() {
		await this._autoRepliesContribution.uninstallAllAutoReplies();
	}

	// #endregion

	private readonly _contributions: IPtyServiceContribution[] = [
		this._autoRepliesContribution
	];

	private _lastPtyId: number = 0;

	private readonly _onHeartbeat = this._register(new Emitter<void>());
	readonly onHeartbeat = this._traceEvent('_onHeartbeat', this._onHeartbeat.event);

	private readonly _onProcessData = this._register(new Emitter<{ id: number; event: IProcessDataEvent | string }>());
	readonly onProcessData = this._traceEvent('_onProcessData', this._onProcessData.event);
	private readonly _onProcessReplay = this._register(new Emitter<{ id: number; event: IPtyHostProcessReplayEvent }>());
	readonly onProcessReplay = this._traceEvent('_onProcessReplay', this._onProcessReplay.event);
	private readonly _onProcessReady = this._register(new Emitter<{ id: number; event: IProcessReadyEvent }>());
	readonly onProcessReady = this._traceEvent('_onProcessReady', this._onProcessReady.event);
	private readonly _onProcessExit = this._register(new Emitter<{ id: number; event: number | undefined }>());
	readonly onProcessExit = this._traceEvent('_onProcessExit', this._onProcessExit.event);
	private readonly _onProcessOrphanQuestion = this._register(new Emitter<{ id: number }>());
	readonly onProcessOrphanQuestion = this._traceEvent('_onProcessOrphanQuestion', this._onProcessOrphanQuestion.event);
	private readonly _onDidRequestDetach = this._register(new Emitter<{ requestId: number; workspaceId: string; instanceId: number }>());
	readonly onDidRequestDetach = this._traceEvent('_onDidRequestDetach', this._onDidRequestDetach.event);
	private readonly _onDidChangeProperty = this._register(new Emitter<{ id: number; property: IProcessProperty<any> }>());
	readonly onDidChangeProperty = this._traceEvent('_onDidChangeProperty', this._onDidChangeProperty.event);

	private _traceEvent<T>(name: string, event: Event<T>): Event<T> {
		event(e => {
			if (this._logService.getLevel() === LogLevel.Trace) {
				this._logService.trace(`[RPC Event] PtyService#${name}.fire(${JSON.stringify(e)})`);
			}
		});
		return event;
	}

	@memoize
	get traceRpcArgs(): { logService: ILogService; simulatedLatency: number } {
		return {
			logService: this._logService,
			simulatedLatency: this._simulatedLatency
		};
	}

	constructor(
		private readonly _logService: ILogService,
		private readonly _productService: IProductService,
		private readonly _reconnectConstants: IReconnectConstants,
		private readonly _simulatedLatency: number
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

	@traceRpc
	async refreshIgnoreProcessNames(names: string[]): Promise<void> {
		ignoreProcessNames.length = 0;
		ignoreProcessNames.push(...names);
	}

	@traceRpc
	async requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		return this._detachInstanceRequestStore.createRequest({ workspaceId, instanceId });
	}

	@traceRpc
	async acceptDetachInstanceReply(requestId: number, persistentProcessId: number): Promise<void> {
		let processDetails: IProcessDetails | undefined = undefined;
		const pty = this._ptys.get(persistentProcessId);
		if (pty) {
			processDetails = await this._buildProcessDetails(persistentProcessId, pty);
		}
		this._detachInstanceRequestStore.acceptReply(requestId, processDetails);
	}

	@traceRpc
	async freePortKillProcess(port: string): Promise<{ port: string; processId: string }> {
		const stdout = await new Promise<string>((resolve, reject) => {
			exec(isWindows ? `netstat -ano | findstr "${port}"` : `lsof -nP -iTCP -sTCP:LISTEN | grep ${port}`, {}, (err, stdout) => {
				if (err) {
					return reject('Problem occurred when listing active processes');
				}
				resolve(stdout);
			});
		});
		const processesForPort = stdout.split(/\r?\n/).filter(s => !!s.trim());
		if (processesForPort.length >= 1) {
			const capturePid = /\s+(\d+)(?:\s+|$)/;
			const processId = processesForPort[0].match(capturePid)?.[1];
			if (processId) {
				try {
					process.kill(Number.parseInt(processId));
				} catch { }
			} else {
				throw new Error(`Processes for port ${port} were not found`);
			}
			return { port, processId };
		}
		throw new Error(`Could not kill process with port ${port}`);
	}

	@traceRpc
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
						processLaunchConfig: persistentProcess.processLaunchOptions,
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

	@traceRpc
	async reviveTerminalProcesses(workspaceId: string, state: ISerializedTerminalState[], dateTimeFormatLocale: string) {
		const promises: Promise<void>[] = [];
		for (const terminal of state) {
			promises.push(this._reviveTerminalProcess(workspaceId, terminal));
		}
		await Promise.all(promises);
	}

	private async _reviveTerminalProcess(workspaceId: string, terminal: ISerializedTerminalState): Promise<void> {
		const restoreMessage = localize('terminal-history-restored', "History restored");
		// TODO: We may at some point want to show date information in a hover via a custom sequence:
		//   new Date(terminal.timestamp).toLocaleDateString(dateTimeFormatLocale)
		//   new Date(terminal.timestamp).toLocaleTimeString(dateTimeFormatLocale)
		const newId = await this.createProcess(
			{
				...terminal.shellLaunchConfig,
				cwd: terminal.processDetails.cwd,
				color: terminal.processDetails.color,
				icon: terminal.processDetails.icon,
				name: terminal.processDetails.titleSource === TitleEventSource.Api ? terminal.processDetails.title : undefined,
				initialText: terminal.replayEvent.events[0].data + formatMessageForTerminal(restoreMessage, { loudFormatting: true })
			},
			terminal.processDetails.cwd,
			terminal.replayEvent.events[0].cols,
			terminal.replayEvent.events[0].rows,
			terminal.unicodeVersion,
			terminal.processLaunchConfig.env,
			terminal.processLaunchConfig.executableEnv,
			terminal.processLaunchConfig.options,
			true,
			terminal.processDetails.workspaceId,
			terminal.processDetails.workspaceName,
			true,
			terminal.replayEvent.events[0].data
		);
		// Don't start the process here as there's no terminal to answer CPR
		const oldId = this._getRevivingProcessId(workspaceId, terminal.id);
		this._revivedPtyIdMap.set(oldId, { newId, state: terminal });
		this._logService.info(`Revived process, old id ${oldId} -> new id ${newId}`);
	}

	@traceRpc
	async shutdownAll(): Promise<void> {
		this.dispose();
	}

	@traceRpc
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
		workspaceName: string,
		isReviving?: boolean,
		rawReviveBuffer?: string
	): Promise<number> {
		if (shellLaunchConfig.attachPersistentProcess) {
			throw new Error('Attempt to create a process when attach object was provided');
		}
		const id = ++this._lastPtyId;
		const process = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, options, this._logService, this._productService);
		const processLaunchOptions: IPersistentTerminalProcessLaunchConfig = {
			env,
			executableEnv,
			options
		};
		const persistentProcess = new PersistentTerminalProcess(id, process, workspaceId, workspaceName, shouldPersist, cols, rows, processLaunchOptions, unicodeVersion, this._reconnectConstants, this._logService, isReviving && typeof shellLaunchConfig.initialText === 'string' ? shellLaunchConfig.initialText : undefined, rawReviveBuffer, shellLaunchConfig.icon, shellLaunchConfig.color, shellLaunchConfig.name, shellLaunchConfig.fixedDimensions);
		process.onProcessExit(event => {
			for (const contrib of this._contributions) {
				contrib.handleProcessDispose(id);
			}
			persistentProcess.dispose();
			this._ptys.delete(id);
			this._onProcessExit.fire({ id, event });
		});
		persistentProcess.onProcessData(event => this._onProcessData.fire({ id, event }));
		persistentProcess.onProcessReplay(event => this._onProcessReplay.fire({ id, event }));
		persistentProcess.onProcessReady(event => this._onProcessReady.fire({ id, event }));
		persistentProcess.onProcessOrphanQuestion(() => this._onProcessOrphanQuestion.fire({ id }));
		persistentProcess.onDidChangeProperty(property => this._onDidChangeProperty.fire({ id, property }));
		persistentProcess.onPersistentProcessReady(() => {
			for (const contrib of this._contributions) {
				contrib.handleProcessReady(id, process);
			}
		});
		this._ptys.set(id, persistentProcess);
		return id;
	}

	@traceRpc
	async attachToProcess(id: number): Promise<void> {
		try {
			await this._throwIfNoPty(id).attach();
			this._logService.info(`Persistent process reconnection "${id}"`);
		} catch (e) {
			this._logService.warn(`Persistent process reconnection "${id}" failed`, e.message);
			throw e;
		}
	}

	@traceRpc
	async updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void> {
		this._throwIfNoPty(id).setTitle(title, titleSource);
	}

	@traceRpc
	async updateIcon(id: number, userInitiated: boolean, icon: URI | { light: URI; dark: URI } | { id: string; color?: { id: string } }, color?: string): Promise<void> {
		this._throwIfNoPty(id).setIcon(userInitiated, icon, color);
	}

	@traceRpc
	async clearBuffer(id: number): Promise<void> {
		this._throwIfNoPty(id).clearBuffer();
	}

	@traceRpc
	async refreshProperty<T extends ProcessPropertyType>(id: number, type: T): Promise<IProcessPropertyMap[T]> {
		return this._throwIfNoPty(id).refreshProperty(type);
	}

	@traceRpc
	async updateProperty<T extends ProcessPropertyType>(id: number, type: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._throwIfNoPty(id).updateProperty(type, value);
	}

	@traceRpc
	async detachFromProcess(id: number, forcePersist?: boolean): Promise<void> {
		return this._throwIfNoPty(id).detach(forcePersist);
	}

	@traceRpc
	async reduceConnectionGraceTime(): Promise<void> {
		for (const pty of this._ptys.values()) {
			pty.reduceGraceTime();
		}
	}

	@traceRpc
	async listProcesses(): Promise<IProcessDetails[]> {
		const persistentProcesses = Array.from(this._ptys.entries()).filter(([_, pty]) => pty.shouldPersistTerminal);

		this._logService.info(`Listing ${persistentProcesses.length} persistent terminals, ${this._ptys.size} total terminals`);
		const promises = persistentProcesses.map(async ([id, terminalProcessData]) => this._buildProcessDetails(id, terminalProcessData));
		const allTerminals = await Promise.all(promises);
		return allTerminals.filter(entry => entry.isOrphan);
	}

	@traceRpc
	async getPerformanceMarks(): Promise<performance.PerformanceMark[]> {
		return performance.getMarks();
	}

	@traceRpc
	async start(id: number): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined> {
		const pty = this._ptys.get(id);
		return pty ? pty.start() : { message: `Could not find pty with id "${id}"` };
	}

	@traceRpc
	async shutdown(id: number, immediate: boolean): Promise<void> {
		// Don't throw if the pty is already shutdown
		return this._ptys.get(id)?.shutdown(immediate);
	}
	@traceRpc
	async input(id: number, data: string): Promise<void> {
		const pty = this._throwIfNoPty(id);
		if (pty) {
			for (const contrib of this._contributions) {
				contrib.handleProcessInput(id, data);
			}
			pty.input(data);
		}
	}
	@traceRpc
	async processBinary(id: number, data: string): Promise<void> {
		return this._throwIfNoPty(id).writeBinary(data);
	}
	@traceRpc
	async resize(id: number, cols: number, rows: number): Promise<void> {
		const pty = this._throwIfNoPty(id);
		if (pty) {
			for (const contrib of this._contributions) {
				contrib.handleProcessResize(id, cols, rows);
			}
			pty.resize(cols, rows);
		}
	}
	@traceRpc
	async getInitialCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getInitialCwd();
	}
	@traceRpc
	async getCwd(id: number): Promise<string> {
		return this._throwIfNoPty(id).getCwd();
	}
	@traceRpc
	async acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._throwIfNoPty(id).acknowledgeDataEvent(charCount);
	}
	@traceRpc
	async setUnicodeVersion(id: number, version: '6' | '11'): Promise<void> {
		return this._throwIfNoPty(id).setUnicodeVersion(version);
	}
	@traceRpc
	async getLatency(): Promise<IPtyHostLatencyMeasurement[]> {
		return [];
	}
	@traceRpc
	async orphanQuestionReply(id: number): Promise<void> {
		return this._throwIfNoPty(id).orphanQuestionReply();
	}

	@traceRpc
	async getDefaultSystemShell(osOverride: OperatingSystem = OS): Promise<string> {
		return getSystemShell(osOverride, process.env);
	}

	@traceRpc
	async getEnvironment(): Promise<IProcessEnvironment> {
		return { ...process.env };
	}

	@traceRpc
	async getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix' | unknown): Promise<string> {
		if (direction === 'win-to-unix') {
			if (!isWindows) {
				return original;
			}
			if (getWindowsBuildNumber() < 17063) {
				return original.replace(/\\/g, '/');
			}
			const wslExecutable = this._getWSLExecutablePath();
			if (!wslExecutable) {
				return original;
			}
			return new Promise<string>(c => {
				const proc = execFile(wslExecutable, ['-e', 'wslpath', original], {}, (error, stdout, stderr) => {
					c(error ? original : escapeNonWindowsPath(stdout.trim()));
				});
				proc.stdin!.end();
			});
		}
		if (direction === 'unix-to-win') {
			// The backend is Windows, for example a local Windows workspace with a wsl session in
			// the terminal.
			if (isWindows) {
				if (getWindowsBuildNumber() < 17063) {
					return original;
				}
				const wslExecutable = this._getWSLExecutablePath();
				if (!wslExecutable) {
					return original;
				}
				return new Promise<string>(c => {
					const proc = execFile(wslExecutable, ['-e', 'wslpath', '-w', original], {}, (error, stdout, stderr) => {
						c(error ? original : stdout.trim());
					});
					proc.stdin!.end();
				});
			}
		}
		// Fallback just in case
		return original;
	}

	private _getWSLExecutablePath(): string | undefined {
		const useWSLexe = getWindowsBuildNumber() >= 16299;
		const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		const systemRoot = process.env['SystemRoot'];
		if (systemRoot) {
			return join(systemRoot, is32ProcessOn64Windows ? 'Sysnative' : 'System32', useWSLexe ? 'wsl.exe' : 'bash.exe');
		}
		return undefined;
	}

	@traceRpc
	async getRevivedPtyNewId(workspaceId: string, id: number): Promise<number | undefined> {
		try {
			return this._revivedPtyIdMap.get(this._getRevivingProcessId(workspaceId, id))?.newId;
		} catch (e) {
			this._logService.warn(`Couldn't find terminal ID ${workspaceId}-${id}`, e.message);
		}
		return undefined;
	}

	@traceRpc
	async setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): Promise<void> {
		this._workspaceLayoutInfos.set(args.workspaceId, args);
	}

	@traceRpc
	async getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined> {
		performance.mark('code/willGetTerminalLayoutInfo');
		const layout = this._workspaceLayoutInfos.get(args.workspaceId);
		if (layout) {
			const doneSet: Set<number> = new Set();
			const expandedTabs = await Promise.all(layout.tabs.map(async tab => this._expandTerminalTab(args.workspaceId, tab, doneSet)));
			const tabs = expandedTabs.filter(t => t.terminals.length > 0);
			performance.mark('code/didGetTerminalLayoutInfo');
			return { tabs };
		}
		performance.mark('code/didGetTerminalLayoutInfo');
		return undefined;
	}

	private async _expandTerminalTab(workspaceId: string, tab: ITerminalTabLayoutInfoById, doneSet: Set<number>): Promise<ITerminalTabLayoutInfoDto> {
		const expandedTerminals = (await Promise.all(tab.terminals.map(t => this._expandTerminalInstance(workspaceId, t, doneSet))));
		const filtered = expandedTerminals.filter(term => term.terminal !== null) as IRawTerminalInstanceLayoutInfo<IProcessDetails>[];
		return {
			isActive: tab.isActive,
			activePersistentProcessId: tab.activePersistentProcessId,
			terminals: filtered
		};
	}

	private async _expandTerminalInstance(workspaceId: string, t: ITerminalInstanceLayoutInfoById, doneSet: Set<number>): Promise<IRawTerminalInstanceLayoutInfo<IProcessDetails | null>> {
		try {
			const oldId = this._getRevivingProcessId(workspaceId, t.terminal);
			const revivedPtyId = this._revivedPtyIdMap.get(oldId)?.newId;
			this._logService.info(`Expanding terminal instance, old id ${oldId} -> new id ${revivedPtyId}`);
			this._revivedPtyIdMap.delete(oldId);
			const persistentProcessId = revivedPtyId ?? t.terminal;
			if (doneSet.has(persistentProcessId)) {
				throw new Error(`Terminal ${persistentProcessId} has already been expanded`);
			}
			doneSet.add(persistentProcessId);
			const persistentProcess = this._throwIfNoPty(persistentProcessId);
			const processDetails = persistentProcess && await this._buildProcessDetails(t.terminal, persistentProcess, revivedPtyId !== undefined);
			return {
				terminal: { ...processDetails, id: persistentProcessId },
				relativeSize: t.relativeSize
			};
		} catch (e) {
			this._logService.warn(`Couldn't get layout info, a terminal was probably disconnected`, e.message);
			this._logService.debug('Reattach to wrong terminal debug info - layout info by id', t);
			this._logService.debug('Reattach to wrong terminal debug info - _revivePtyIdMap', Array.from(this._revivedPtyIdMap.values()));
			this._logService.debug('Reattach to wrong terminal debug info - _ptys ids', Array.from(this._ptys.keys()));
			// this will be filtered out and not reconnected
			return {
				terminal: null,
				relativeSize: t.relativeSize
			};
		}
	}

	private _getRevivingProcessId(workspaceId: string, ptyId: number): string {
		return `${workspaceId}-${ptyId}`;
	}

	private async _buildProcessDetails(id: number, persistentProcess: PersistentTerminalProcess, wasRevived: boolean = false): Promise<IProcessDetails> {
		performance.mark(`code/willBuildProcessDetails/${id}`);
		// If the process was just revived, don't do the orphan check as it will
		// take some time
		const [cwd, isOrphan] = await Promise.all([persistentProcess.getCwd(), wasRevived ? true : persistentProcess.isOrphaned()]);
		const result = {
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
			fixedDimensions: persistentProcess.fixedDimensions,
			environmentVariableCollections: persistentProcess.processLaunchOptions.options.environmentVariableCollections,
			reconnectionProperties: persistentProcess.shellLaunchConfig.reconnectionProperties,
			waitOnExit: persistentProcess.shellLaunchConfig.waitOnExit,
			hideFromUser: persistentProcess.shellLaunchConfig.hideFromUser,
			isFeatureTerminal: persistentProcess.shellLaunchConfig.isFeatureTerminal,
			type: persistentProcess.shellLaunchConfig.type,
			hasChildProcesses: persistentProcess.hasChildProcesses,
			shellIntegrationNonce: persistentProcess.processLaunchOptions.options.shellIntegration.nonce,
			tabActions: persistentProcess.shellLaunchConfig.tabActions
		};
		performance.mark(`code/didBuildProcessDetails/${id}`);
		return result;
	}

	private _throwIfNoPty(id: number): PersistentTerminalProcess {
		const pty = this._ptys.get(id);
		if (!pty) {
			throw new ErrorNoTelemetry(`Could not find pty ${id} on pty host`);
		}
		return pty;
	}
}

const enum InteractionState {
	/** The terminal has not been interacted with. */
	None = 'None',
	/** The terminal has only been interacted with by the replay mechanism. */
	ReplayOnly = 'ReplayOnly',
	/** The terminal has been directly interacted with this session. */
	Session = 'Session'
}

class PersistentTerminalProcess extends Disposable {

	private readonly _bufferer: TerminalDataBufferer;

	private readonly _pendingCommands = new Map<number, { resolve: (data: any) => void; reject: (err: any) => void }>();

	private _isStarted: boolean = false;
	private _interactionState: MutationLogger<InteractionState>;

	private _orphanQuestionBarrier: AutoOpenBarrier | null;
	private _orphanQuestionReplyTime: number;
	private _orphanRequestQueue = new Queue<boolean>();
	private _disconnectRunner1: ProcessTimeRunOnceScheduler;
	private _disconnectRunner2: ProcessTimeRunOnceScheduler;

	private readonly _onProcessReplay = this._register(new Emitter<IPtyHostProcessReplayEvent>());
	readonly onProcessReplay = this._onProcessReplay.event;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onPersistentProcessReady = this._register(new Emitter<void>());
	/** Fired when the persistent process has a ready process and has finished its replay. */
	readonly onPersistentProcessReady = this._onPersistentProcessReady.event;
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
	get hasWrittenData(): boolean { return this._interactionState.value !== InteractionState.None; }
	get title(): string { return this._title || this._terminalProcess.currentTitle; }
	get titleSource(): TitleEventSource { return this._titleSource; }
	get icon(): TerminalIcon | undefined { return this._icon; }
	get color(): string | undefined { return this._color; }
	get fixedDimensions(): IFixedTerminalDimensions | undefined { return this._fixedDimensions; }
	get hasChildProcesses(): boolean { return this._terminalProcess.hasChildProcesses; }

	setTitle(title: string, titleSource: TitleEventSource): void {
		if (titleSource === TitleEventSource.Api) {
			this._interactionState.setValue(InteractionState.Session, 'setTitle');
			this._serializer.freeRawReviveBuffer();
		}
		this._title = title;
		this._titleSource = titleSource;
	}

	setIcon(userInitiated: boolean, icon: TerminalIcon, color?: string): void {
		if (!this._icon || 'id' in icon && 'id' in this._icon && icon.id !== this._icon.id ||
			!this.color || color !== this._color) {

			this._serializer.freeRawReviveBuffer();
			if (userInitiated) {
				this._interactionState.setValue(InteractionState.Session, 'setIcon');
			}
		}
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
		readonly processLaunchOptions: IPersistentTerminalProcessLaunchConfig,
		public unicodeVersion: '6' | '11',
		reconnectConstants: IReconnectConstants,
		private readonly _logService: ILogService,
		reviveBuffer: string | undefined,
		rawReviveBuffer: string | undefined,
		private _icon?: TerminalIcon,
		private _color?: string,
		name?: string,
		fixedDimensions?: IFixedTerminalDimensions
	) {
		super();
		this._interactionState = new MutationLogger(`Persistent process "${this._persistentProcessId}" interaction state`, InteractionState.None, this._logService);
		this._wasRevived = reviveBuffer !== undefined;
		this._serializer = new XtermSerializer(
			cols,
			rows,
			reconnectConstants.scrollback,
			unicodeVersion,
			reviveBuffer,
			processLaunchOptions.options.shellIntegration.nonce,
			shouldPersistTerminal ? rawReviveBuffer : undefined,
			this._logService
		);
		if (name) {
			this.setTitle(name, TitleEventSource.Api);
		}
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

	async attach(): Promise<void> {
		if (!this._disconnectRunner1.isScheduled() && !this._disconnectRunner2.isScheduled()) {
			this._logService.warn(`Persistent process "${this._persistentProcessId}": Process had no disconnect runners but was an orphan`);
		}
		this._disconnectRunner1.cancel();
		this._disconnectRunner2.cancel();
	}

	async detach(forcePersist?: boolean): Promise<void> {
		// Keep the process around if it was indicated to persist and it has had some iteraction or
		// was replayed
		if (this.shouldPersistTerminal && (this._interactionState.value !== InteractionState.None || forcePersist)) {
			this._disconnectRunner1.schedule();
		} else {
			this.shutdown(true);
		}
	}

	serializeNormalBuffer(): Promise<IPtyHostProcessReplayEvent> {
		return this._serializer.generateReplayEvent(true, this._interactionState.value !== InteractionState.Session);
	}

	async refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		return this._terminalProcess.refreshProperty(type);
	}

	async updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		if (type === ProcessPropertyType.FixedDimensions) {
			return this._setFixedDimensions(value as IProcessPropertyMap[ProcessPropertyType.FixedDimensions]);
		}
	}

	async start(): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined> {
		if (!this._isStarted) {
			const result = await this._terminalProcess.start();
			if (result && 'message' in result) {
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
			} else {
				this._onPersistentProcessReady.fire();
			}
			return result;
		}

		this._onProcessReady.fire({ pid: this._pid, cwd: this._cwd, windowsPty: this._terminalProcess.getWindowsPty() });
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._terminalProcess.currentTitle });
		this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: this._terminalProcess.shellType });
		this.triggerReplay();
		return undefined;
	}
	shutdown(immediate: boolean): void {
		return this._terminalProcess.shutdown(immediate);
	}
	input(data: string): void {
		this._interactionState.setValue(InteractionState.Session, 'input');
		this._serializer.freeRawReviveBuffer();
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
	async clearBuffer(): Promise<void> {
		this._serializer.clearBuffer();
		this._terminalProcess.clearBuffer();
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

	async triggerReplay(): Promise<void> {
		if (this._interactionState.value === InteractionState.None) {
			this._interactionState.setValue(InteractionState.ReplayOnly, 'triggerReplay');
		}
		const ev = await this._serializer.generateReplayEvent();
		let dataLength = 0;
		for (const e of ev.events) {
			dataLength += e.data.length;
		}
		this._logService.info(`Persistent process "${this._persistentProcessId}": Replaying ${dataLength} chars and ${ev.events.length} size events`);
		this._onProcessReplay.fire(ev);
		this._terminalProcess.clearUnacknowledgedChars();
		this._onPersistentProcessReady.fire();
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

class MutationLogger<T> {
	get value(): T { return this._value; }
	setValue(value: T, reason: string) {
		if (this._value !== value) {
			this._value = value;
			this._log(reason);
		}
	}

	constructor(
		private readonly _name: string,
		private _value: T,
		private readonly _logService: ILogService
	) {
		this._log('initialized');
	}

	private _log(reason: string): void {
		this._logService.debug(`MutationLogger "${this._name}" set to "${this._value}", reason: ${reason}`);
	}
}

class XtermSerializer implements ITerminalSerializer {
	private readonly _xterm: XtermTerminal;
	private readonly _shellIntegrationAddon: ShellIntegrationAddon;
	private _unicodeAddon?: XtermUnicode11Addon;

	constructor(
		cols: number,
		rows: number,
		scrollback: number,
		unicodeVersion: '6' | '11',
		reviveBufferWithRestoreMessage: string | undefined,
		shellIntegrationNonce: string,
		private _rawReviveBuffer: string | undefined,
		logService: ILogService
	) {
		this._xterm = new XtermTerminal({
			cols,
			rows,
			scrollback,
			allowProposedApi: true
		});
		if (reviveBufferWithRestoreMessage) {
			this._xterm.writeln(reviveBufferWithRestoreMessage);
		}
		this.setUnicodeVersion(unicodeVersion);
		this._shellIntegrationAddon = new ShellIntegrationAddon(shellIntegrationNonce, true, undefined, logService);
		this._xterm.loadAddon(this._shellIntegrationAddon);
	}

	freeRawReviveBuffer(): void {
		// Free the memory of the terminal if it will need to be re-serialized
		this._rawReviveBuffer = undefined;
	}

	handleData(data: string): void {
		this._xterm.write(data);
	}

	handleResize(cols: number, rows: number): void {
		this._xterm.resize(cols, rows);
	}

	clearBuffer(): void {
		this._xterm.clear();
	}

	async generateReplayEvent(normalBufferOnly?: boolean, restoreToLastReviveBuffer?: boolean): Promise<IPtyHostProcessReplayEvent> {
		const serialize = new (await this._getSerializeConstructor());
		this._xterm.loadAddon(serialize);
		const options: ISerializeOptions = {
			scrollback: this._xterm.options.scrollback
		};
		if (normalBufferOnly) {
			options.excludeAltBuffer = true;
			options.excludeModes = true;
		}
		let serialized: string;
		if (restoreToLastReviveBuffer && this._rawReviveBuffer) {
			serialized = this._rawReviveBuffer;
		} else {
			serialized = serialize.serialize(options);
		}
		return {
			events: [
				{
					cols: this._xterm.cols,
					rows: this._xterm.rows,
					data: serialized
				}
			],
			commands: this._shellIntegrationAddon.serialize()
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
			Unicode11Addon = (await import('@xterm/addon-unicode11')).Unicode11Addon;
		}
		return Unicode11Addon;
	}

	async _getSerializeConstructor(): Promise<typeof SerializeAddon> {
		if (!SerializeAddon) {
			SerializeAddon = (await import('@xterm/addon-serialize')).SerializeAddon;
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

interface ITerminalSerializer {
	handleData(data: string): void;
	freeRawReviveBuffer(): void;
	handleResize(cols: number, rows: number): void;
	clearBuffer(): void;
	generateReplayEvent(normalBufferOnly?: boolean, restoreToLastReviveBuffer?: boolean): Promise<IPtyHostProcessReplayEvent>;
	setUnicodeVersion?(version: '6' | '11'): void;
}
