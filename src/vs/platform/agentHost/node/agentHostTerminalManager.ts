/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import * as platform from '../../../base/common/platform.js';
import { ILogService } from '../../log/common/log.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ActionType } from '../common/state/protocol/actions.js';
import type { ICreateTerminalParams } from '../common/state/protocol/commands.js';
import { ITerminalClaim, ITerminalInfo, ITerminalState, TerminalClaimKind } from '../common/state/protocol/state.js';
import { isTerminalAction } from '../common/state/sessionActions.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostTerminalManager = createDecorator<IAgentHostTerminalManager>('agentHostTerminalManager');

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
	getContent(uri: string): string | undefined;
	getClaim(uri: string): ITerminalClaim | undefined;
	hasTerminal(uri: string): boolean;
	getExitCode(uri: string): number | undefined;
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

/** Represents a single managed terminal with its PTY process. */
interface IManagedTerminal {
	readonly uri: string;
	readonly store: DisposableStore;
	readonly pty: import('node-pty').IPty;
	readonly onDataEmitter: Emitter<string>;
	readonly onExitEmitter: Emitter<number>;
	readonly onClaimChangedEmitter: Emitter<ITerminalClaim>;
	title: string;
	cwd: string;
	cols: number;
	rows: number;
	content: string;
	claim: ITerminalClaim;
	exitCode?: number;
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

		const ptyProcess = nodePty.spawn(shell, [], {
			name,
			cwd,
			env: process.env as Record<string, string>,
			cols,
			rows,
		});

		const store = new DisposableStore();
		const claim: ITerminalClaim = params.claim ?? { kind: TerminalClaimKind.Client, clientId: '' };

		const onDataEmitter = store.add(new Emitter<string>());
		const onExitEmitter = store.add(new Emitter<number>());
		const onClaimChangedEmitter = store.add(new Emitter<ITerminalClaim>());

		const managed: IManagedTerminal = {
			uri,
			store,
			pty: ptyProcess,
			onDataEmitter,
			onExitEmitter,
			onClaimChangedEmitter,
			title: params.name ?? shell,
			cwd,
			cols,
			rows,
			content: '',
			claim,
		};

		this._terminals.set(uri, managed);

		// Wire PTY events → protocol events
		store.add(toDisposable(() => {
			try { ptyProcess.kill(); } catch { /* already dead */ }
		}));

		const dataListener = ptyProcess.onData(data => {
			managed.content += data;
			if (managed.content.length > 100_000) {
				managed.content = managed.content.slice(-80_000);
			}
			managed.onDataEmitter.fire(data);
			this._stateManager.dispatchServerAction({
				type: ActionType.TerminalData,
				terminal: uri,
				data,
			});
		});
		store.add(toDisposable(() => dataListener.dispose()));

		const exitListener = ptyProcess.onExit(e => {
			managed.exitCode = e.exitCode;
			managed.onExitEmitter.fire(e.exitCode);
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

	/** Get accumulated scrollback content for a terminal. */
	getContent(uri: string): string | undefined {
		return this._terminals.get(uri)?.content;
	}

	/** Get the current claim for a terminal. */
	getClaim(uri: string): ITerminalClaim | undefined {
		return this._terminals.get(uri)?.claim;
	}

	/** Check whether a terminal exists. */
	hasTerminal(uri: string): boolean {
		return this._terminals.has(uri);
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
			terminal.content = '';
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
