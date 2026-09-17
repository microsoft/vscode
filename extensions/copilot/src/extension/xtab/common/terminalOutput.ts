/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ITerminalService } from '../../../platform/terminal/common/terminalService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';

const MAX_BUFFER_CHARS = 2000;

interface LastTerminalActivity {
	readonly terminal: vscode.Terminal;
	readonly terminalName: string;
	readonly commandLine: string | undefined;
	readonly cwd: string | undefined;
	readonly exitCode: number | undefined;
	readonly timestamp: number;
}

/**
 * Monitors terminal activity and tracks the last terminal command execution.
 * Similar to UserInteractionMonitor, this class listens to terminal events
 * to understand user terminal activity patterns.
 */
export class TerminalMonitor extends Disposable {

	private _lastActivity: LastTerminalActivity | undefined;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();

		// Listen to terminal shell execution end events to track command completions
		this._register(this._terminalService.onDidEndTerminalShellExecution(e => {
			this._recordTerminalActivity(e);
		}));

		// Clear last activity if the terminal is closed
		this._register(this._terminalService.onDidCloseTerminal(terminal => {
			if (this._lastActivity?.terminal === terminal) {
				this._lastActivity = undefined;
			}
		}));
	}

	private _recordTerminalActivity(event: vscode.TerminalShellExecutionEndEvent): void {
		const executedCommand = event.execution;

		this._lastActivity = {
			terminal: event.terminal,
			terminalName: event.terminal.name,
			commandLine: executedCommand.commandLine?.value,
			cwd: formatCwd(executedCommand.cwd),
			exitCode: event.exitCode,
			timestamp: Date.now(),
		};
	}

	/**
	 * Gets the terminal output data for telemetry, including how long ago the last command was executed.
	 * Data is primarily sourced from onDidEndTerminalShellExecution to ensure consistency
	 * (buffer, command, and metadata all come from the same terminal).
	 */
	public getData(): string {
		const now = Date.now();
		const terminalCount = this._terminalService.terminals.length;

		if (!this._lastActivity) {
			return JSON.stringify({
				terminalCount,
			});
		}

		// Get buffer from the same terminal where the last command was executed
		const buffer = this._terminalService.getBufferForTerminal(this._lastActivity.terminal, MAX_BUFFER_CHARS * 2);
		const msAgo = now - this._lastActivity.timestamp;

		const data = {
			// All data from the same terminal that executed the last tracked command
			terminalName: this._lastActivity.terminalName,
			commandLine: this._lastActivity.commandLine,
			cwd: this._lastActivity.cwd,
			exitCode: this._lastActivity.exitCode,
			msAgo,
			// Buffer from the same terminal
			buffer: buffer.length <= MAX_BUFFER_CHARS ? {
				fits: true,
				content: buffer,
				length: buffer.length,
			} : {
				fits: false,
				contentStart: buffer.slice(0, MAX_BUFFER_CHARS / 2),
				contentEnd: buffer.slice(-MAX_BUFFER_CHARS / 2),
				length: buffer.length,
				truncatedChars: buffer.length - MAX_BUFFER_CHARS,
			},
			// General terminal state
			terminalCount,
		};

		return JSON.stringify(data);
	}
}

function formatCwd(cwd: URI | string | undefined): string | undefined {
	if (cwd === undefined) {
		return undefined;
	}
	if (typeof cwd === 'string') {
		return cwd;
	}
	return cwd.fsPath;
}
