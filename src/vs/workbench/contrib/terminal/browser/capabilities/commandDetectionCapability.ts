/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { ICommandDetectionCapability, TerminalCapability, ITerminalCommand } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { IBuffer, IDisposable, IMarker, Terminal } from 'xterm';

export interface ICurrentPartialCommand {
	previousCommandMarker?: IMarker;

	promptStartMarker?: IMarker;

	commandStartMarker?: IMarker;
	commandStartX?: number;

	commandLines?: IMarker;

	commandExecutedMarker?: IMarker;
	commandExecutedX?: number;

	commandFinishedMarker?: IMarker;

	currentContinuationMarker?: IMarker;
	continuations?: { marker: IMarker; end: number }[];

	command?: string;
}

export class CommandDetectionCapability implements ICommandDetectionCapability {
	readonly type = TerminalCapability.CommandDetection;

	protected _commands: ITerminalCommand[] = [];
	private _exitCode: number | undefined;
	private _cwd: string | undefined;
	private _currentCommand: ICurrentPartialCommand = {};
	private _isWindowsPty: boolean = false;
	private _onCursorMoveListener?: IDisposable;
	private _commandMarkers: IMarker[] = [];

	get commands(): readonly ITerminalCommand[] { return this._commands; }

	private readonly _onCommandStarted = new Emitter<ITerminalCommand>();
	readonly onCommandStarted = this._onCommandStarted.event;
	private readonly _onCommandFinished = new Emitter<ITerminalCommand>();
	readonly onCommandFinished = this._onCommandFinished.event;

	constructor(
		private readonly _terminal: Terminal,
		@ILogService private readonly _logService: ILogService
	) { }

	setCwd(value: string) {
		this._cwd = value;
	}

	setIsWindowsPty(value: boolean) {
		this._isWindowsPty = value;
	}

	getCwdForLine(line: number): string | undefined {
		// TODO: It would be more reliable to take the closest cwd above the line if it isn't found for the line
		// TODO: Use a reverse for loop to find the line to avoid creating another array
		const reversed = [...this._commands].reverse();
		return reversed.find(c => c.marker!.line <= line - 1)?.cwd;
	}

	handlePromptStart(): void {
		this._currentCommand.promptStartMarker = this._terminal.registerMarker(0);
		this._logService.debug('CommandDetectionCapability#handlePromptStart', this._terminal.buffer.active.cursorX, this._currentCommand.promptStartMarker?.line);
	}

	handleContinuationStart(): void {
		this._currentCommand.currentContinuationMarker = this._terminal.registerMarker(0);
		this._logService.debug('CommandDetectionCapability#handleContinuationStart', this._currentCommand.currentContinuationMarker);
	}

	handleContinuationEnd(): void {
		if (!this._currentCommand.currentContinuationMarker) {
			this._logService.warn('CommandDetectionCapability#handleContinuationEnd Received continuation end without start');
			return;
		}
		if (!this._currentCommand.continuations) {
			this._currentCommand.continuations = [];
		}
		this._currentCommand.continuations.push({
			marker: this._currentCommand.currentContinuationMarker,
			end: this._terminal.buffer.active.cursorX
		});
		this._currentCommand.currentContinuationMarker = undefined;
		this._logService.debug('CommandDetectionCapability#handleContinuationEnd', this._currentCommand.continuations[this._currentCommand.continuations.length - 1]);
	}

	handleCommandStart(): void {
		this._currentCommand.commandStartX = this._terminal.buffer.active.cursorX;

		// On Windows track all cursor movements after the command start sequence
		if (this._isWindowsPty) {
			this._commandMarkers.length = 0;
			this._onCursorMoveListener = this._terminal.onCursorMove(() => {
				if (this._commandMarkers.length === 0 || this._commandMarkers[this._commandMarkers.length - 1].line !== this._terminal.buffer.active.cursorY) {
					const marker = this._terminal.registerMarker(0);
					if (marker) {
						this._commandMarkers.push(marker);
					}
				}
			});
			// HACK: Fire command started on the following frame on Windows to allow the cursor
			// position to update as conpty often prints the sequence on a different line to the
			// actual line the command started on.
			timeout(0).then(() => {
				this._currentCommand.commandStartMarker = this._terminal.registerMarker(0);
				this._onCommandStarted.fire({ marker: this._currentCommand.commandStartMarker } as ITerminalCommand);
			});
		} else {
			this._currentCommand.commandStartMarker = this._terminal.registerMarker(0);
			this._onCommandStarted.fire({ marker: this._currentCommand.commandStartMarker } as ITerminalCommand);
		}
		this._logService.debug('CommandDetectionCapability#handleCommandStart', this._currentCommand.commandStartX, this._currentCommand.commandStartMarker?.line);
	}

	handleCommandExecuted(): void {
		// On Windows, use the gathered cursor move markers to correct the command start and
		// executed markers
		if (this._isWindowsPty) {
			this._onCursorMoveListener?.dispose();
			this._onCursorMoveListener = undefined;
		}

		this._currentCommand.commandExecutedMarker = this._terminal.registerMarker(0);
		this._currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleCommandExecuted', this._currentCommand.commandExecutedX, this._currentCommand.commandExecutedMarker?.line);

		// Don't get the command on Windows, rely on the command line sequence for this
		if (this._isWindowsPty) {
			return;
		}

		// Sanity check optional props
		if (!this._currentCommand.commandStartMarker || !this._currentCommand.commandExecutedMarker || !this._currentCommand.commandStartX) {
			return;
		}

		// Calculate the command
		this._currentCommand.command = this._terminal.buffer.active.getLine(this._currentCommand.commandStartMarker.line)?.translateToString(true, this._currentCommand.commandStartX);
		let y = this._currentCommand.commandStartMarker.line + 1;
		const commandExecutedLine = this._currentCommand.commandExecutedMarker.line;
		for (; y < commandExecutedLine; y++) {
			const line = this._terminal.buffer.active.getLine(y);
			if (line) {
				const continuation = this._currentCommand.continuations?.find(e => e.marker.line === y);
				if (continuation) {
					this._currentCommand.command += '\n';
				}
				const startColumn = continuation?.end ?? 0;
				this._currentCommand.command += line.translateToString(true, startColumn);
			}
		}
		if (y === commandExecutedLine) {
			this._currentCommand.command += this._terminal.buffer.active.getLine(commandExecutedLine)?.translateToString(true, undefined, this._currentCommand.commandExecutedX) || '';
		}
	}

	handleCommandFinished(exitCode: number | undefined): void {
		// On Windows, use the gathered cursor move markers to correct the command start and
		// executed markers. This is done on command finished just in case command executed never
		// happens (for example PSReadLine tab completion)
		if (this._isWindowsPty) {
			this._commandMarkers = this._commandMarkers.sort((a, b) => a.line - b.line);
			this._currentCommand.commandStartMarker = this._commandMarkers[0];
			this._currentCommand.commandExecutedMarker = this._commandMarkers[this._commandMarkers.length - 1];
		}

		this._currentCommand.commandFinishedMarker = this._terminal.registerMarker(0);
		const command = this._currentCommand.command;
		this._logService.debug('CommandDetectionCapability#handleCommandFinished', this._terminal.buffer.active.cursorX, this._currentCommand.commandFinishedMarker?.line, this._currentCommand.command, this._currentCommand);
		this._exitCode = exitCode;

		// HACK: Handle a special case on some versions of bash where identical commands get merged
		// in the output of `history`, this detects that case and sets the exit code to the the last
		// command's exit code. This covered the majority of cases but will fail if the same command
		// runs with a different exit code, that will need a more robust fix where we send the
		// command ID and exit code over to the capability to adjust there.
		if (this._exitCode === undefined) {
			const lastCommand = this.commands.length > 0 ? this.commands[this.commands.length - 1] : undefined;
			if (command && command.length > 0 && lastCommand?.command === command) {
				this._exitCode = lastCommand.exitCode;
			}
		}

		if (this._currentCommand.commandStartMarker === undefined || !this._terminal.buffer.active) {
			return;
		}

		if (command !== undefined && !command.startsWith('\\')) {
			const buffer = this._terminal.buffer.active;
			const clonedPartialCommand = { ...this._currentCommand };
			const timestamp = Date.now();
			const newCommand = {
				command,
				marker: this._currentCommand.commandStartMarker,
				endMarker: this._currentCommand.commandFinishedMarker,
				timestamp,
				cwd: this._cwd,
				exitCode: this._exitCode,
				hasOutput: !!(this._currentCommand.commandExecutedMarker && this._currentCommand.commandFinishedMarker && this._currentCommand.commandExecutedMarker?.line < this._currentCommand.commandFinishedMarker!.line),
				getOutput: () => getOutputForCommand(clonedPartialCommand, buffer)
			};
			this._commands.push(newCommand);
			this._logService.debug('CommandDetectionCapability#onCommandFinished', newCommand);
			this._onCommandFinished.fire(newCommand);
		}
		this._currentCommand.previousCommandMarker = this._currentCommand.commandStartMarker;
		this._currentCommand = {};
	}

	setCommandLine(commandLine: string) {
		this._logService.debug('CommandDetectionCapability#setCommandLine', commandLine);
		this._currentCommand.command = commandLine;
	}
}

function getOutputForCommand(command: ICurrentPartialCommand, buffer: IBuffer): string | undefined {
	const startLine = command.commandExecutedMarker!.line;
	const endLine = command.commandFinishedMarker!.line;

	if (startLine === endLine) {
		return undefined;
	}
	let output = '';
	for (let i = startLine; i < endLine; i++) {
		output += buffer.getLine(i)?.translateToString() + '\n';
	}
	return output === '' ? undefined : output;
}
