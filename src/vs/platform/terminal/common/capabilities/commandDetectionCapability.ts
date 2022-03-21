/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { ICommandDetectionCapability, TerminalCapability, ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ISerializedCommand, ISerializedCommandDetectionCapability } from 'vs/platform/terminal/common/terminalProcess';
// Importing types is safe in any layer
// eslint-disable-next-line code-import-patterns
import type { IBuffer, IDisposable, IMarker, Terminal } from 'xterm-headless';

export interface ICurrentPartialCommand {
	previousCommandMarker?: IMarker;

	promptStartMarker?: IMarker;

	commandStartMarker?: IMarker;
	commandStartX?: number;
	commandStartLineContent?: string;

	commandRightPromptStartX?: number;
	commandRightPromptEndX?: number;

	commandLines?: IMarker;

	commandExecutedMarker?: IMarker;
	commandExecutedX?: number;

	commandFinishedMarker?: IMarker;

	currentContinuationMarker?: IMarker;
	continuations?: { marker: IMarker; end: number }[];

	command?: string;
}

interface ITerminalDimensions {
	cols: number;
	rows: number;
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
	private _dimensions: ITerminalDimensions;

	get commands(): readonly ITerminalCommand[] { return this._commands; }
	get executingCommand(): string | undefined { return this._currentCommand.command; }
	get cwd(): string | undefined { return this._cwd; }

	private readonly _onCommandStarted = new Emitter<ITerminalCommand>();
	readonly onCommandStarted = this._onCommandStarted.event;
	private readonly _onCommandFinished = new Emitter<ITerminalCommand>();
	readonly onCommandFinished = this._onCommandFinished.event;

	constructor(
		private readonly _terminal: Terminal,
		@ILogService private readonly _logService: ILogService
	) {
		this._dimensions = {
			cols: this._terminal.cols,
			rows: this._terminal.rows
		};
		this._terminal.onResize(e => this._handleResize(e));
	}

	private _handleResize(e: { cols: number; rows: number }) {
		if (this._isWindowsPty) {
			this._preHandleResizeWindows(e);
		}
		this._dimensions.cols = e.cols;
		this._dimensions.rows = e.rows;
	}

	private _preHandleResizeWindows(e: { cols: number; rows: number }) {
		// Resize behavior is different under conpty; instead of bringing parts of the scrollback
		// back into the viewport, new lines are inserted at the bottom (ie. the same behavior as if
		// there was no scrollback).
		//
		// On resize this workaround will wait for a conpty reprint to occur by waiting for the
		// cursor to move, it will then calculate the number of lines that the commands within the
		// viewport _may have_ shifted. After verifying the content of the current line is
		// incorrect, the line after shifting is checked and if that matches delete events are fired
		// on the xterm.js buffer to move the markers.
		//
		// While a bit hacky, this approach is quite safe and seems to work great at least for pwsh.
		const baseY = this._terminal.buffer.active.baseY;
		const rowsDifference = e.rows - this._dimensions.rows;
		// Only do when rows increase, do in the next frame as this needs to happen after
		// conpty reprints the screen
		if (rowsDifference > 0) {
			this._waitForCursorMove().then(() => {
				// Calculate the number of lines the content may have shifted, this will max out at
				// scrollback count since the standard behavior will be used then
				const potentialShiftedLineCount = Math.min(rowsDifference, baseY);
				// For each command within the viewport, assume commands are in the correct order
				for (let i = this.commands.length - 1; i >= 0; i--) {
					const command = this.commands[i];
					if (!command.marker || command.marker.line < baseY || command.commandStartLineContent === undefined) {
						break;
					}
					const line = this._terminal.buffer.active.getLine(command.marker.line);
					if (!line || line.translateToString(true) === command.commandStartLineContent) {
						continue;
					}
					const shiftedY = command.marker.line - potentialShiftedLineCount;
					const shiftedLine = this._terminal.buffer.active.getLine(shiftedY);
					if (shiftedLine?.translateToString(true) !== command.commandStartLineContent) {
						continue;
					}
					// HACK: xterm.js doesn't expose this by design as it's an internal core
					// function an embedder could easily do damage with. Additionally, this
					// can't really be upstreamed since the event relies on shell integration to
					// verify the shifting is necessary.
					(this._terminal as any)._core._bufferService.buffer.lines.onDeleteEmitter.fire({
						index: this._terminal.buffer.active.baseY,
						amount: potentialShiftedLineCount
					});
				}
			});
		}
	}

	private _waitForCursorMove(): Promise<void> {
		const cursorX = this._terminal.buffer.active.cursorX;
		const cursorY = this._terminal.buffer.active.cursorY;
		let totalDelay = 0;
		return new Promise<void>((resolve, reject) => {
			const interval = setInterval(() => {
				if (cursorX !== this._terminal.buffer.active.cursorX || cursorY !== this._terminal.buffer.active.cursorY) {
					resolve();
					clearInterval(interval);
					return;
				}
				totalDelay += 10;
				if (totalDelay > 1000) {
					clearInterval(interval);
					resolve();
				}
			}, 10);
		});
	}

	setCwd(value: string) {
		this._cwd = value;
	}

	setIsWindowsPty(value: boolean) {
		this._isWindowsPty = value;
	}

	getCwdForLine(line: number): string | undefined {
		// Handle the current partial command first, anything below it's prompt is considered part
		// of the current command
		if (this._currentCommand.promptStartMarker && line >= this._currentCommand.promptStartMarker?.line) {
			return this._cwd;
		}
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

	handleRightPromptStart(): void {
		this._currentCommand.commandRightPromptStartX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleRightPromptStart', this._currentCommand.commandRightPromptStartX);
	}

	handleRightPromptEnd(): void {
		this._currentCommand.commandRightPromptEndX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleRightPromptEnd', this._currentCommand.commandRightPromptEndX);
	}

	handleCommandStart(): void {
		if (this._isWindowsPty) {
			this._handleCommandStartWindows();
			return;
		}
		this._currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
		this._currentCommand.commandStartMarker = this._terminal.registerMarker(0);
		this._onCommandStarted.fire({ marker: this._currentCommand.commandStartMarker } as ITerminalCommand);
		this._logService.debug('CommandDetectionCapability#handleCommandStart', this._currentCommand.commandStartX, this._currentCommand.commandStartMarker?.line);
	}

	private _handleCommandStartWindows(): void {
		this._currentCommand.commandStartX = this._terminal.buffer.active.cursorX;

		// On Windows track all cursor movements after the command start sequence
		this._commandMarkers.length = 0;
		// HACK: Fire command started on the following frame on Windows to allow the cursor
		// position to update as conpty often prints the sequence on a different line to the
		// actual line the command started on.
		timeout(0).then(() => {
			if (!this._currentCommand.commandExecutedMarker) {
				this._onCursorMoveListener = this._terminal.onCursorMove(() => {
					if (this._commandMarkers.length === 0 || this._commandMarkers[this._commandMarkers.length - 1].line !== this._terminal.buffer.active.cursorY) {
						const marker = this._terminal.registerMarker(0);
						if (marker) {
							this._commandMarkers.push(marker);
						}
					}
				});
			}
			this._currentCommand.commandStartMarker = this._terminal.registerMarker(0);
			if (this._currentCommand.commandStartMarker) {
				const line = this._terminal.buffer.active.getLine(this._currentCommand.commandStartMarker.line);
				if (line) {
					this._currentCommand.commandStartLineContent = line.translateToString(true);
				}
			}
			this._onCommandStarted.fire({ marker: this._currentCommand.commandStartMarker } as ITerminalCommand);
			this._logService.debug('CommandDetectionCapability#_handleCommandStartWindows', this._currentCommand.commandStartX, this._currentCommand.commandStartMarker?.line);
		});
	}

	handleCommandExecuted(): void {
		if (this._isWindowsPty) {
			this._handleCommandExecutedWindows();
			return;
		}

		this._currentCommand.commandExecutedMarker = this._terminal.registerMarker(0);
		this._currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleCommandExecuted', this._currentCommand.commandExecutedX, this._currentCommand.commandExecutedMarker?.line);

		// Sanity check optional props
		if (!this._currentCommand.commandStartMarker || !this._currentCommand.commandExecutedMarker || this._currentCommand.commandStartX === undefined) {
			return;
		}

		// Calculate the command
		this._currentCommand.command = this._terminal.buffer.active.getLine(this._currentCommand.commandStartMarker.line)?.translateToString(true, this._currentCommand.commandStartX, this._currentCommand.commandRightPromptStartX).trim();
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

	private _handleCommandExecutedWindows(): void {
		// On Windows, use the gathered cursor move markers to correct the command start and
		// executed markers
		this._onCursorMoveListener?.dispose();
		this._onCursorMoveListener = undefined;
		this._evaluateCommandMarkersWindows();
		this._currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleCommandExecuted', this._currentCommand.commandExecutedX, this._currentCommand.commandExecutedMarker?.line);
	}

	handleCommandFinished(exitCode: number | undefined): void {
		if (this._isWindowsPty) {
			this._preHandleCommandFinishedWindows();
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
			const timestamp = Date.now();
			const executedMarker = this._currentCommand.commandExecutedMarker;
			const endMarker = this._currentCommand.commandFinishedMarker;
			const newCommand: ITerminalCommand = {
				command,
				marker: this._currentCommand.commandStartMarker,
				endMarker,
				executedMarker,
				timestamp,
				cwd: this._cwd,
				exitCode: this._exitCode,
				commandStartLineContent: this._currentCommand.commandStartLineContent,
				hasOutput: !!(executedMarker && endMarker && executedMarker?.line < endMarker!.line),
				getOutput: () => getOutputForCommand(executedMarker, endMarker, buffer)
			};
			this._commands.push(newCommand);
			this._logService.debug('CommandDetectionCapability#onCommandFinished', newCommand);
			this._onCommandFinished.fire(newCommand);
		}
		this._currentCommand.previousCommandMarker = this._currentCommand.commandStartMarker;
		this._currentCommand = {};
	}

	private _preHandleCommandFinishedWindows(): void {
		if (this._currentCommand.commandExecutedMarker) {
			return;
		}
		// This is done on command finished just in case command executed never happens (for example
		// PSReadLine tab completion)
		if (this._commandMarkers.length === 0) {
			// If the command start timeout doesn't happen before command finished, just use the
			// current marker.
			if (!this._currentCommand.commandStartMarker) {
				this._currentCommand.commandStartMarker = this._terminal.registerMarker(0);
			}
			if (this._currentCommand.commandStartMarker) {
				this._commandMarkers.push(this._currentCommand.commandStartMarker);
			}
		}
		this._evaluateCommandMarkersWindows();
	}

	private _evaluateCommandMarkersWindows(): void {
		// On Windows, use the gathered cursor move markers to correct the command start and
		// executed markers.
		if (this._commandMarkers.length === 0) {
			return;
		}
		this._commandMarkers = this._commandMarkers.sort((a, b) => a.line - b.line);
		this._currentCommand.commandStartMarker = this._commandMarkers[0];
		if (this._currentCommand.commandStartMarker) {
			const line = this._terminal.buffer.active.getLine(this._currentCommand.commandStartMarker.line);
			if (line) {
				this._currentCommand.commandStartLineContent = line.translateToString(true);
			}
		}
		this._currentCommand.commandExecutedMarker = this._commandMarkers[this._commandMarkers.length - 1];
	}

	setCommandLine(commandLine: string) {
		this._logService.debug('CommandDetectionCapability#setCommandLine', commandLine);
		this._currentCommand.command = commandLine;
	}

	serialize(): ISerializedCommandDetectionCapability {
		const commands: ISerializedCommand[] = this.commands.map(e => {
			return {
				startLine: e.marker?.line,
				startX: undefined,
				endLine: e.endMarker?.line,
				executedLine: e.executedMarker?.line,
				command: e.command,
				cwd: e.cwd,
				exitCode: e.exitCode,
				commandStartLineContent: e.commandStartLineContent,
				timestamp: e.timestamp
			};
		});
		if (this._currentCommand.commandStartMarker) {
			commands.push({
				startLine: this._currentCommand.commandStartMarker.line,
				startX: this._currentCommand.commandStartX,
				endLine: undefined,
				executedLine: undefined,
				command: '',
				cwd: this._cwd,
				exitCode: undefined,
				commandStartLineContent: undefined,
				timestamp: 0,
			});
		}
		return {
			isWindowsPty: this._isWindowsPty,
			commands
		};
	}

	deserialize(serialized: ISerializedCommandDetectionCapability): void {
		if (serialized.isWindowsPty) {
			this.setIsWindowsPty(serialized.isWindowsPty);
		}
		const buffer = this._terminal.buffer.normal;
		for (const e of serialized.commands) {
			const marker = e.startLine !== undefined ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : undefined;
			// Check for invalid command
			if (!marker) {
				continue;
			}
			// Partial command
			if (!e.endLine) {
				this._currentCommand.commandStartMarker = marker;
				this._currentCommand.commandStartX = e.startX;
				this._cwd = e.cwd;
				this._onCommandStarted.fire({ marker } as ITerminalCommand);
				continue;
			}
			// Full command
			const endMarker = e.endLine !== undefined ? this._terminal.registerMarker(e.endLine - (buffer.baseY + buffer.cursorY)) : undefined;
			const executedMarker = e.executedLine !== undefined ? this._terminal.registerMarker(e.executedLine - (buffer.baseY + buffer.cursorY)) : undefined;
			const newCommand = {
				command: e.command,
				marker,
				endMarker,
				executedMarker,
				timestamp: e.timestamp,
				cwd: e.cwd,
				commandStartLineContent: e.commandStartLineContent,
				exitCode: e.exitCode,
				hasOutput: !!(executedMarker && endMarker && executedMarker.line < endMarker.line),
				getOutput: () => getOutputForCommand(executedMarker, endMarker, buffer)
			};
			this._commands.push(newCommand);
			this._logService.debug('CommandDetectionCapability#onCommandFinished', newCommand);
			this._onCommandFinished.fire(newCommand);
		}
	}
}

function getOutputForCommand(executedMarker: IMarker | undefined, endMarker: IMarker | undefined, buffer: IBuffer): string | undefined {
	if (!executedMarker || !endMarker) {
		return undefined;
	}
	const startLine = executedMarker.line;
	const endLine = endMarker.line;

	if (startLine === endLine) {
		return undefined;
	}
	let output = '';
	for (let i = startLine; i < endLine; i++) {
		output += buffer.getLine(i)?.translateToString() + '\n';
	}
	return output === '' ? undefined : output;
}
