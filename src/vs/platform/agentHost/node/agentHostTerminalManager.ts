/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import * as platform from '../../../base/common/platform.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ActionType } from '../common/state/protocol/actions.js';
import type { ICreateTerminalParams } from '../common/state/protocol/commands.js';
import { ITerminalClaim, ITerminalContentPart, ITerminalInfo, ITerminalState, TerminalClaimKind } from '../common/state/protocol/state.js';
import { isTerminalAction } from '../common/state/sessionActions.js';
import { getShellIntegrationInjection } from '../../terminal/node/terminalEnvironment.js';
import { Osc633Event, Osc633EventType, Osc633Parser } from './osc633Parser.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';
import * as fs from 'fs';
import { dirname } from '../../../base/common/path.js';
import { DeferredPromise, raceCancellablePromises, timeout } from '../../../base/common/async.js';

const WAIT_FOR_PROMPT_TIMEOUT = 10_000;

export const IAgentHostTerminalManager = createDecorator<IAgentHostTerminalManager>('agentHostTerminalManager');

export interface ICommandFinishedEvent {
	commandId: string;
	exitCode: number | undefined;
	command: string;
	output: string;
}

/**
 * Service interface for terminal management in the agent host.
 */
export interface IAgentHostTerminalManager {
	readonly _serviceBrand: undefined;
	createTerminal(params: ICreateTerminalParams, options?: { shell?: string }): Promise<void>;
	writeInput(uri: string, data: string): void;
	onData(uri: string, cb: (data: string) => void): IDisposable;
	onExit(uri: string, cb: (exitCode: number) => void): IDisposable;
	onClaimChanged(uri: string, cb: (claim: ITerminalClaim) => void): IDisposable;
	onCommandFinished(uri: string, cb: (event: ICommandFinishedEvent) => void): IDisposable;
	getContent(uri: string): string | undefined;
	getClaim(uri: string): ITerminalClaim | undefined;
	hasTerminal(uri: string): boolean;
	getExitCode(uri: string): number | undefined;
	supportsCommandDetection(uri: string): boolean;
	disposeTerminal(uri: string): void;
	getTerminalInfos(): ITerminalInfo[];
	getTerminalState(uri: string): ITerminalState | undefined;
}

// node-pty is loaded dynamically to avoid bundling issues in non-node environments
let nodePtyModule: typeof import('node-pty') | undefined;
async function getNodePty(): Promise<typeof import('node-pty')> {
	if (!nodePtyModule) {
		nodePtyModule = await import('node-pty');
	}
	return nodePtyModule;
}

/** Per-terminal command detection tracking state. */
interface ICommandTracker {
	readonly parser: Osc633Parser;
	readonly nonce: string;
	commandCounter: number;
	detectionAvailableEmitted: boolean;
	pendingCommandLine?: string;
	activeCommandId?: string;
	activeCommandTimestamp?: number;
}

/** Represents a single managed terminal with its PTY process. */
interface IManagedTerminal {
	readonly uri: string;
	readonly store: DisposableStore;
	readonly pty: import('node-pty').IPty;
	readonly onDataEmitter: Emitter<string>;
	readonly onExitEmitter: Emitter<number>;
	readonly onClaimChangedEmitter: Emitter<ITerminalClaim>;
	readonly onCommandFinishedEmitter: Emitter<ICommandFinishedEvent>;
	title: string;
	cwd: string;
	cols: number;
	rows: number;
	content: ITerminalContentPart[];
	contentSize: number;
	claim: ITerminalClaim;
	exitCode?: number;
	commandTracker?: ICommandTracker;
}

/**
 * Manages terminal processes for the agent host. Each terminal is backed by
 * a node-pty instance and identified by a protocol URI.
 *
 * Listens to the {@link AgentHostStateManager} for client-dispatched terminal
 * actions (input, resize, claim changes) and dispatches server-originated
 * PTY output back through the state manager.
 */
export class AgentHostTerminalManager extends Disposable implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	private readonly _terminals = new Map<string, IManagedTerminal>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		// React to client-dispatched terminal actions flowing through the state manager
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			const action = envelope.action;
			if (!isTerminalAction(action)) {
				return;
			}
			switch (action.type) {
				case ActionType.TerminalInput:
					this._writeInput(action.terminal, action.data);
					break;
				case ActionType.TerminalResized:
					this._resize(action.terminal, action.cols, action.rows);
					break;
				case ActionType.TerminalClaimed:
					this._setClaim(action.terminal, action.claim);
					break;
				case ActionType.TerminalTitleChanged:
					this._setTitle(action.terminal, action.title);
					break;
				case ActionType.TerminalCleared:
					this._clearContent(action.terminal);
					break;
			}
		}));
	}

	/** Get metadata for all active terminals (for root state). */
	getTerminalInfos(): ITerminalInfo[] {
		return [...this._terminals.values()].map(t => ({
			resource: t.uri,
			title: t.title,
			claim: t.claim,
			exitCode: t.exitCode,
		}));
	}

	/** Get the full state for a terminal (for subscribe snapshots). */
	getTerminalState(uri: string): ITerminalState | undefined {
		const terminal = this._terminals.get(uri);
		if (!terminal) {
			return undefined;
		}
		return {
			title: terminal.title,
			cwd: terminal.cwd,
			cols: terminal.cols,
			rows: terminal.rows,
			content: terminal.content,
			exitCode: terminal.exitCode,
			claim: terminal.claim,
			supportsCommandDetection: terminal.commandTracker?.detectionAvailableEmitted,
		};
	}

	/**
	 * Create a new terminal backed by node-pty.
	 * Spawns the user's default shell.
	 */
	async createTerminal(params: ICreateTerminalParams, options?: { shell?: string }): Promise<void> {
		const uri = params.terminal;
		if (this._terminals.has(uri)) {
			throw new Error(`Terminal already exists: ${uri}`);
		}

		const nodePty = await getNodePty();

		const cwd = params.cwd ?? process.cwd();
		const cols = params.cols ?? 80;
		const rows = params.rows ?? 24;

		const shell = options?.shell ?? this._getDefaultShell();
		const name = platform.isWindows ? 'cmd' : 'xterm-256color';

		this._logService.info(`[TerminalManager] Creating terminal ${uri}: shell=${shell}, cwd=${cwd}, cols=${cols}, rows=${rows}`);

		// Shell integration — inject scripts so the shell emits OSC 633 sequences
		const nonce = generateUuid();
		const env: Record<string, string> = { ...process.env as Record<string, string> };
		let shellArgs: string[] = [];

		const injection = await getShellIntegrationInjection(
			{ executable: shell, args: [], forceShellIntegration: true },
			{
				shellIntegration: { enabled: true, suggestEnabled: false, nonce },
				windowsUseConptyDll: false,
				environmentVariableCollections: undefined,
				workspaceFolder: undefined,
				isScreenReaderOptimized: false,
			},
			undefined,
			this._logService,
			this._productService,
		);

		let commandTracker: ICommandTracker | undefined;

		if (injection.type === 'injection') {
			this._logService.info(`[TerminalManager] Shell integration injected for ${uri}`);
			if (injection.envMixin) {
				for (const [key, value] of Object.entries(injection.envMixin)) {
					if (value !== undefined) {
						env[key] = value;
					}
				}
			}
			if (injection.newArgs) {
				shellArgs = injection.newArgs;
			}
			if (injection.filesToCopy) {
				for (const f of injection.filesToCopy) {
					try {
						await fs.promises.mkdir(dirname(f.dest), { recursive: true });
						await fs.promises.copyFile(f.source, f.dest);
					} catch {
						// Swallow — another process may be using the same temp dir
					}
				}
			}
			commandTracker = {
				parser: new Osc633Parser(),
				nonce,
				commandCounter: 0,
				detectionAvailableEmitted: false,
			};
		} else {
			this._logService.info(`[TerminalManager] Shell integration not available for ${uri}: ${injection.reason}`);
		}

		const ptyProcess = nodePty.spawn(shell, shellArgs, {
			name,
			cwd,
			env,
			cols,
			rows,
		});

		const store = new DisposableStore();
		const claim: ITerminalClaim = params.claim ?? { kind: TerminalClaimKind.Client, clientId: '' };

		const onDataEmitter = store.add(new Emitter<string>());
		const onExitEmitter = store.add(new Emitter<number>());
		const onClaimChangedEmitter = store.add(new Emitter<ITerminalClaim>());
		const onCommandFinishedEmitter = store.add(new Emitter<ICommandFinishedEvent>());

		const managed: IManagedTerminal = {
			uri,
			store,
			pty: ptyProcess,
			onDataEmitter,
			onExitEmitter,
			onClaimChangedEmitter,
			onCommandFinishedEmitter,
			title: params.name ?? shell,
			cwd,
			cols,
			rows,
			content: [],
			contentSize: 0,
			claim,
			commandTracker,
		};

		this._terminals.set(uri, managed);

		// Wire PTY events → protocol events
		store.add(toDisposable(() => {
			try { ptyProcess.kill(); } catch { /* already dead */ }
		}));

		const onFirstData = new DeferredPromise<void>();
		const dataListener = ptyProcess.onData(rawData => {
			this._handlePtyData(managed, rawData);
			onFirstData.complete();
		});
		store.add(toDisposable(() => dataListener.dispose()));

		const exitListener = ptyProcess.onExit(e => {
			managed.exitCode = e.exitCode;
			managed.onExitEmitter.fire(e.exitCode);
			onFirstData.complete();
			this._stateManager.dispatchServerAction({
				type: ActionType.TerminalExited,
				terminal: uri,
				exitCode: e.exitCode,
			});
			this._broadcastTerminalList();
		});
		store.add(toDisposable(() => exitListener.dispose()));

		// Poll for title changes (non-Windows)
		if (!platform.isWindows) {
			const titleInterval = setInterval(() => {
				const newTitle = ptyProcess.process;
				if (newTitle && newTitle !== managed.title) {
					managed.title = newTitle;
					this._stateManager.dispatchServerAction({
						type: ActionType.TerminalTitleChanged,
						terminal: uri,
						title: newTitle,
					});
					this._broadcastTerminalList();
				}
			}, 200);
			store.add(toDisposable(() => clearInterval(titleInterval)));
		}

		await raceCancellablePromises([onFirstData.p, timeout(WAIT_FOR_PROMPT_TIMEOUT)]);

		this._broadcastTerminalList();
	}

	/** Send input data to a terminal's PTY process (from client-dispatched actions). */
	private _writeInput(uri: string, data: string): void {
		this.writeInput(uri, data);
	}

	/** Send input data to a terminal's PTY process. */
	writeInput(uri: string, data: string): void {
		const terminal = this._terminals.get(uri);
		if (terminal && terminal.exitCode === undefined) {
			terminal.pty.write(data);
		}
	}

	/** Register a callback for PTY data events on a terminal. */
	onData(uri: string, cb: (data: string) => void): IDisposable {
		const terminal = this._terminals.get(uri);
		if (!terminal) {
			return toDisposable(() => { });
		}
		return terminal.onDataEmitter.event(cb);
	}

	/** Register a callback for PTY exit events on a terminal. */
	onExit(uri: string, cb: (exitCode: number) => void): IDisposable {
		const terminal = this._terminals.get(uri);
		if (!terminal) {
			return toDisposable(() => { });
		}
		return terminal.onExitEmitter.event(cb);
	}

	/** Register a callback for terminal claim changes. */
	onClaimChanged(uri: string, cb: (claim: ITerminalClaim) => void): IDisposable {
		const terminal = this._terminals.get(uri);
		if (!terminal) {
			return toDisposable(() => { });
		}
		return terminal.onClaimChangedEmitter.event(cb);
	}

	/** Register a callback for command completion events (requires shell integration). */
	onCommandFinished(uri: string, cb: (event: ICommandFinishedEvent) => void): IDisposable {
		const terminal = this._terminals.get(uri);
		if (!terminal) {
			return toDisposable(() => { });
		}
		return terminal.onCommandFinishedEmitter.event(cb);
	}

	/** Get accumulated scrollback content for a terminal as raw text. */
	getContent(uri: string): string | undefined {
		const terminal = this._terminals.get(uri);
		if (!terminal) {
			return undefined;
		}
		return terminal.content.map(p => p.type === 'command' ? p.output : p.value).join('');
	}

	/** Get the current claim for a terminal. */
	getClaim(uri: string): ITerminalClaim | undefined {
		return this._terminals.get(uri)?.claim;
	}

	/** Check whether a terminal exists. */
	hasTerminal(uri: string): boolean {
		return this._terminals.has(uri);
	}

	/** Whether the terminal has shell integration active for command detection. */
	supportsCommandDetection(uri: string): boolean {
		const terminal = this._terminals.get(uri);
		return terminal?.commandTracker?.detectionAvailableEmitted ?? false;
	}

	/** Get the exit code for a terminal, or undefined if still running. */
	getExitCode(uri: string): number | undefined {
		return this._terminals.get(uri)?.exitCode;
	}

	/** Resize a terminal. */
	private _resize(uri: string, cols: number, rows: number): void {
		const terminal = this._terminals.get(uri);
		if (terminal && terminal.exitCode === undefined) {
			terminal.cols = cols;
			terminal.rows = rows;
			terminal.pty.resize(cols, rows);
		}
	}

	/** Update a terminal's claim. */
	private _setClaim(uri: string, claim: ITerminalClaim): void {
		const terminal = this._terminals.get(uri);
		if (terminal) {
			terminal.claim = claim;
			terminal.onClaimChangedEmitter.fire(claim);
			this._broadcastTerminalList();
		}
	}

	/** Update a terminal's title. */
	private _setTitle(uri: string, title: string): void {
		const terminal = this._terminals.get(uri);
		if (terminal) {
			terminal.title = title;
			this._broadcastTerminalList();
		}
	}

	/** Clear a terminal's scrollback buffer. */
	private _clearContent(uri: string): void {
		const terminal = this._terminals.get(uri);
		if (terminal) {
			terminal.content = [];
			terminal.contentSize = 0;
		}
	}

	/** Process raw PTY output: parse OSC 633 sequences, dispatch actions, track content. */
	private _handlePtyData(managed: IManagedTerminal, rawData: string): void {
		const tracker = managed.commandTracker;
		let cleanedData: string;

		if (tracker) {
			const parseResult = tracker.parser.parse(rawData);
			cleanedData = parseResult.cleanedData;

			for (const event of parseResult.events) {
				this._handleOsc633Event(managed, tracker, event);
			}
		} else {
			cleanedData = rawData;
		}

		// Append to structured content
		if (cleanedData.length > 0) {
			this._appendToContent(managed, cleanedData);
		}

		// Trim content if too large
		this._trimContent(managed);

		// Fire data event and dispatch to protocol (cleaned, without OSC 633)
		if (cleanedData.length > 0) {
			managed.onDataEmitter.fire(cleanedData);
			this._stateManager.dispatchServerAction({
				type: ActionType.TerminalData,
				terminal: managed.uri,
				data: cleanedData,
			});
		}
	}

	/** Handle a parsed OSC 633 event by dispatching the appropriate protocol actions. */
	private _handleOsc633Event(managed: IManagedTerminal, tracker: ICommandTracker, event: Osc633Event): void {
		// Emit TerminalCommandDetectionAvailable on first sequence
		if (!tracker.detectionAvailableEmitted) {
			tracker.detectionAvailableEmitted = true;
			this._stateManager.dispatchServerAction({
				type: ActionType.TerminalCommandDetectionAvailable,
				terminal: managed.uri,
			});
		}

		switch (event.type) {
			case Osc633EventType.CommandLine: {
				// Only trust command lines with a valid nonce
				if (event.nonce === tracker.nonce) {
					tracker.pendingCommandLine = event.commandLine;
				}
				break;
			}

			case Osc633EventType.CommandExecuted: {
				const commandId = `cmd-${++tracker.commandCounter}`;
				const commandLine = tracker.pendingCommandLine ?? '';
				const timestamp = Date.now();
				tracker.pendingCommandLine = undefined;
				tracker.activeCommandId = commandId;
				tracker.activeCommandTimestamp = timestamp;

				// Push a new command content part
				managed.content.push({
					type: 'command',
					commandId,
					commandLine,
					output: '',
					timestamp,
					isComplete: false,
				});

				this._stateManager.dispatchServerAction({
					type: ActionType.TerminalCommandExecuted,
					terminal: managed.uri,
					commandId,
					commandLine,
					timestamp,
				});
				break;
			}

			case Osc633EventType.CommandFinished: {
				const finishedCommandId = tracker.activeCommandId;
				if (!finishedCommandId) {
					break;
				}
				const durationMs = tracker.activeCommandTimestamp !== undefined
					? Date.now() - tracker.activeCommandTimestamp
					: undefined;

				// Mark the command content part as complete and collect output
				let commandLine = '';
				let commandOutput = '';
				for (const part of managed.content) {
					if (part.type === 'command' && part.commandId === finishedCommandId) {
						part.isComplete = true;
						part.exitCode = event.exitCode;
						part.durationMs = durationMs;
						commandLine = part.commandLine;
						commandOutput = part.output;
						break;
					}
				}

				tracker.activeCommandId = undefined;
				tracker.activeCommandTimestamp = undefined;

				managed.onCommandFinishedEmitter.fire({
					commandId: finishedCommandId,
					exitCode: event.exitCode,
					command: commandLine,
					output: commandOutput,
				});

				this._stateManager.dispatchServerAction({
					type: ActionType.TerminalCommandFinished,
					terminal: managed.uri,
					commandId: finishedCommandId,
					exitCode: event.exitCode,
					durationMs,
				});
				break;
			}

			case Osc633EventType.Property: {
				if (event.key === 'Cwd') {
					managed.cwd = event.value;
					this._stateManager.dispatchServerAction({
						type: ActionType.TerminalCwdChanged,
						terminal: managed.uri,
						cwd: event.value,
					});
				}
				break;
			}
		}
	}

	/** Append cleaned data to the terminal's structured content array. */
	private _appendToContent(managed: IManagedTerminal, data: string): void {
		const tail = managed.content.length > 0 ? managed.content[managed.content.length - 1] : undefined;

		if (tail && tail.type === 'command' && !tail.isComplete) {
			// Active command — append to its output
			tail.output += data;
			managed.contentSize += data.length;
		} else if (tail && tail.type === 'unclassified') {
			// Extend the existing unclassified part
			tail.value += data;
			managed.contentSize += data.length;
		} else {
			// Start a new unclassified part
			managed.content.push({ type: 'unclassified', value: data });
			managed.contentSize += data.length;
		}
	}

	private _getContentPartSize(part: ITerminalContentPart): number {
		return part.type === 'command' ? part.output.length : part.value.length;
	}

	/** Trim content parts to stay within the rolling buffer limit. */
	private _trimContent(managed: IManagedTerminal): void {
		const maxSize = 100_000;
		const targetSize = 80_000;
		if (managed.contentSize <= maxSize) {
			return;
		}
		// Drop whole parts from the front while possible
		while (managed.contentSize > targetSize && managed.content.length > 1) {
			const removed = managed.content.shift()!;
			managed.contentSize -= this._getContentPartSize(removed);
		}
		// If the single remaining (or first) part is still over budget, trim its text
		if (managed.contentSize > targetSize && managed.content.length > 0) {
			const head = managed.content[0];
			const excess = managed.contentSize - targetSize;
			if (head.type === 'command') {
				head.output = head.output.slice(excess);
			} else {
				head.value = head.value.slice(excess);
			}
			managed.contentSize -= excess;
		}
	}

	/** Dispose a terminal: kill the process and remove it. */
	disposeTerminal(uri: string): void {
		const terminal = this._terminals.get(uri);
		if (terminal) {
			this._terminals.delete(uri);
			terminal.store.dispose();
			this._broadcastTerminalList();
		}
	}

	private _getDefaultShell(): string {
		if (platform.isWindows) {
			return process.env['COMSPEC'] || 'cmd.exe';
		}
		return process.env['SHELL'] || '/bin/sh';
	}

	/** Dispatch root/terminalsChanged with the current terminal list. */
	private _broadcastTerminalList(): void {
		this._stateManager.dispatchServerAction({
			type: ActionType.RootTerminalsChanged,
			terminals: this.getTerminalInfos(),
		});
	}

	override dispose(): void {
		for (const terminal of this._terminals.values()) {
			terminal.store.dispose();
		}
		this._terminals.clear();
		super.dispose();
	}
}
