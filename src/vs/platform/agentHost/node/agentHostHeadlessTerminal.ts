/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ShellIntegrationAddon } from '../../terminal/common/xterm/shellIntegrationAddon.js';
import pkg from '@xterm/headless';

type XtermTerminal = pkg.Terminal;
const { Terminal: XtermTerminal } = pkg;

export interface IAgentHostHeadlessTerminalOptions {
	cols: number;
	rows: number;
	scrollback: number;
	shellIntegrationNonce?: string;
	logService: ILogService;
}

export interface IRenderedTextOptions {
	lines?: number;
}

/**
 * Mirrors an agent-host PTY into xterm's interpreted terminal model.
 *
 * The mirror is intentionally internal to the agent host. Protocol-visible
 * terminal data still flows through the existing OSC 633 parser and content
 * model; this class provides terminal responses, modes, and rendered snapshots.
 */
export class AgentHostHeadlessTerminal extends Disposable {

	private readonly _terminal: XtermTerminal;
	private readonly _onResponseData = this._register(new Emitter<string>());
	readonly onResponseData: Event<string> = this._onResponseData.event;
	private _writeBarrier: Promise<void> = Promise.resolve();
	private _isDisposed = false;

	constructor(options: IAgentHostHeadlessTerminalOptions) {
		super();
		const logService = options.logService;
		this._terminal = new XtermTerminal({
			cols: options.cols,
			rows: options.rows,
			scrollback: options.scrollback,
			allowProposedApi: true,
		});

		if (options.shellIntegrationNonce) {
			this._terminal.loadAddon(this._register(new ShellIntegrationAddon(options.shellIntegrationNonce, true, undefined, undefined, logService)));
		}

		this._register(this._terminal.onData(data => {
			if (this._isAllowedResponseData(data)) {
				this._onResponseData.fire(data);
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

	async getRecentRenderedText(options?: IRenderedTextOptions): Promise<string> {
		await this._writeBarrier;
		return this._getRenderedText(options);
	}

	async getCursorLineText(): Promise<string> {
		await this._writeBarrier;
		const buffer = this._terminal.buffer.active;
		const line = buffer.getLine(buffer.baseY + buffer.cursorY);
		return line?.translateToString(true) ?? '';
	}

	resize(cols: number, rows: number): void {
		this._terminal.resize(cols, rows);
	}

	clear(): void {
		// xterm.clear() preserves the visible line content; emulate a terminal
		// clear sequence so rendered reads match a user-visible clear screen.
		void this.writePtyData('\x1b[2J\x1b[3J\x1b[H');
	}

	isInAltBuffer(): boolean {
		return this._terminal.buffer.active.type === 'alternate';
	}

	isBracketedPasteMode(): boolean {
		return this._terminal.modes.bracketedPasteMode;
	}

	override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	private _getRenderedText(options?: IRenderedTextOptions): string {
		const buffer = this._terminal.buffer.active;
		const start = Math.max(0, buffer.length - (options?.lines ?? buffer.length));
		const logicalLines: string[] = [];
		let currentLine: string | undefined;

		for (let i = start; i < buffer.length; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const text = line.translateToString(true);
			if (line.isWrapped && currentLine !== undefined) {
				currentLine += text;
				continue;
			}
			if (currentLine !== undefined) {
				logicalLines.push(currentLine);
			}
			currentLine = text;
		}

		if (currentLine !== undefined) {
			logicalLines.push(currentLine);
		}

		return logicalLines.join('\n').trimEnd();
	}

	private _isAllowedResponseData(data: string): boolean {
		// Only forward cursor position reports for now. Workbench xterm can
		// also answer terminal queries when attached, so keep this conservative.
		return /^(?:\x1b\[\d+;\d+R)+$/.test(data);
	}
}
