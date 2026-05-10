/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { ILogService } from '../../log/common/log.js';
import pkg from '@xterm/headless';

type XtermTerminal = pkg.Terminal;
const { Terminal: XtermTerminal } = pkg;

export interface IAgentHostHeadlessTerminalOptions {
	cols: number;
	rows: number;
	scrollback: number;
	logService: ILogService;
	terminalFactory?: (options: IXtermTerminalOptions) => XtermTerminal;
}

/**
 * Mirrors an agent-host PTY into xterm's interpreted terminal model.
 *
 * The mirror is intentionally internal to the agent host. Protocol-visible
 * terminal data still flows through the existing OSC 633 parser and content
 * model; this class provides terminal responses for programs that query
 * terminal state.
 */
export class AgentHostHeadlessTerminal extends Disposable {

	private readonly _terminal: XtermTerminal;
	private readonly _logService: ILogService;
	private readonly _onResponseData = this._register(new Emitter<string>());
	readonly onResponseData: Event<string> = this._onResponseData.event;
	private _writeBarrier: Promise<void> = Promise.resolve();
	private _isDisposed = false;

	constructor(options: IAgentHostHeadlessTerminalOptions) {
		super();
		this._logService = options.logService;
		const terminalOptions: IXtermTerminalOptions = {
			cols: options.cols,
			rows: options.rows,
			scrollback: options.scrollback,
			allowProposedApi: true,
		};
		this._terminal = options.terminalFactory?.(terminalOptions) ?? new XtermTerminal(terminalOptions);

		this._register(this._terminal.onData(data => {
			if (this._isCursorPositionReportResponse(data)) {
				this._logService.debug(`[AgentHostHeadlessTerminal] Forwarding terminal response ${JSON.stringify(data)}`);
				this._onResponseData.fire(data);
			} else {
				this._logService.debug(`[AgentHostHeadlessTerminal] Dropping terminal response ${JSON.stringify(data)}`);
			}
		}));
		this._register({
			dispose: () => {
				this._isDisposed = true;
				this._terminal.dispose();
			}
		});
	}

	writePtyData(data: string): Promise<void> {
		this._writeBarrier = this._writeBarrier.catch(() => undefined).then(() => {
			if (this._isDisposed) {
				return;
			}
			return new Promise<void>(resolve => {
				try {
					this._terminal.write(data, resolve);
				} catch {
					resolve();
				}
			});
		});
		return this._writeBarrier;
	}

	resize(cols: number, rows: number): void {
		this._terminal.resize(cols, rows);
	}

	clear(): void {
		// xterm.clear() preserves the visible line content; emulate a terminal
		// clear sequence so future terminal-state reads match a user-visible clear.
		void this.writePtyData('\x1b[2J\x1b[3J\x1b[H');
	}

	override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	private _isCursorPositionReportResponse(data: string): boolean {
		// Only forward cursor position reports for now. xterm can also answer
		// device attribute queries, but workbench only forwards those in narrow
		// ConPTY-specific cases; keep Agent Host conservative until needed.
		return /^(?:\x1b\[\??\d+;\d+R)+$/.test(data);
	}
}

interface IXtermTerminalOptions {
	cols: number;
	rows: number;
	scrollback: number;
	allowProposedApi: boolean;
}
