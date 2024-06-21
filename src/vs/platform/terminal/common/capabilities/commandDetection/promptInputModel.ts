/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import type { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { throttle } from 'vs/base/common/decorators';

// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { Terminal, IMarker, IBufferCell, IBufferLine, IBuffer } from '@xterm/headless';

const enum PromptInputState {
	Unknown = 0,
	Input = 1,
	Execute = 2,
}

/**
 * A model of the prompt input state using shell integration and analyzing the terminal buffer. This
 * may not be 100% accurate but provides a best guess.
 */
export interface IPromptInputModel {
	readonly onDidStartInput: Event<IPromptInputModelState>;
	readonly onDidChangeInput: Event<IPromptInputModelState>;
	readonly onDidFinishInput: Event<IPromptInputModelState>;
	/**
	 * Fires immediately before {@link onDidFinishInput} when a SIGINT/Ctrl+C/^C is detected.
	 */
	readonly onDidInterrupt: Event<IPromptInputModelState>;

	readonly value: string;
	readonly cursorIndex: number;
	readonly ghostTextIndex: number;

	/**
	 * Gets the prompt input as a user-friendly string where `|` is the cursor position and `[` and
	 * `]` wrap any ghost text.
	 */
	getCombinedString(): string;
}

export interface IPromptInputModelState {
	readonly value: string;
	readonly cursorIndex: number;
	readonly ghostTextIndex: number;
}

export interface ISerializedPromptInputModel {
	readonly modelState: IPromptInputModelState;
	readonly commandStartX: number;
	readonly lastPromptLine: string | undefined;
	readonly continuationPrompt: string | undefined;
	readonly lastUserInput: string;
}

export class PromptInputModel extends Disposable implements IPromptInputModel {
	private _state: PromptInputState = PromptInputState.Unknown;

	private _commandStartMarker: IMarker | undefined;
	private _commandStartX: number = 0;
	private _lastPromptLine: string | undefined;
	private _continuationPrompt: string | undefined;

	private _lastUserInput: string = '';

	private _value: string = '';
	get value() { return this._value; }

	private _cursorIndex: number = 0;
	get cursorIndex() { return this._cursorIndex; }

	private _ghostTextIndex: number = -1;
	get ghostTextIndex() { return this._ghostTextIndex; }

	private readonly _onDidStartInput = this._register(new Emitter<IPromptInputModelState>());
	readonly onDidStartInput = this._onDidStartInput.event;
	private readonly _onDidChangeInput = this._register(new Emitter<IPromptInputModelState>());
	readonly onDidChangeInput = this._onDidChangeInput.event;
	private readonly _onDidFinishInput = this._register(new Emitter<IPromptInputModelState>());
	readonly onDidFinishInput = this._onDidFinishInput.event;
	private readonly _onDidInterrupt = this._register(new Emitter<IPromptInputModelState>());
	readonly onDidInterrupt = this._onDidInterrupt.event;

	constructor(
		private readonly _xterm: Terminal,
		onCommandStart: Event<ITerminalCommand>,
		onCommandExecuted: Event<ITerminalCommand>,
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._register(Event.any(
			this._xterm.onCursorMove,
			this._xterm.onData,
			this._xterm.onWriteParsed,
		)(() => this._sync()));
		this._register(this._xterm.onData(e => this._handleUserInput(e)));

		this._register(onCommandStart(e => this._handleCommandStart(e as { marker: IMarker })));
		this._register(onCommandExecuted(() => this._handleCommandExecuted()));

		this._register(this.onDidStartInput(() => this._logCombinedStringIfTrace('PromptInputModel#onDidStartInput')));
		this._register(this.onDidChangeInput(() => this._logCombinedStringIfTrace('PromptInputModel#onDidChangeInput')));
		this._register(this.onDidFinishInput(() => this._logCombinedStringIfTrace('PromptInputModel#onDidFinishInput')));
		this._register(this.onDidInterrupt(() => this._logCombinedStringIfTrace('PromptInputModel#onDidInterrupt')));
	}

	private _logCombinedStringIfTrace(message: string) {
		// Only generate the combined string if trace
		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace(message, this.getCombinedString());
		}
	}

	setContinuationPrompt(value: string): void {
		this._continuationPrompt = value;
		this._sync();
	}

	setLastPromptLine(value: string): void {
		this._lastPromptLine = value;
		this._sync();
	}

	setConfidentCommandLine(value: string): void {
		if (this._value !== value) {
			this._value = value;
			this._cursorIndex = -1;
			this._ghostTextIndex = -1;
			this._onDidChangeInput.fire(this._createStateObject());
		}
	}

	getCombinedString(): string {
		const value = this._value.replaceAll('\n', '\u23CE');
		if (this._cursorIndex === -1) {
			return value;
		}
		let result = `${value.substring(0, this.cursorIndex)}|`;
		if (this.ghostTextIndex !== -1) {
			result += `${value.substring(this.cursorIndex, this.ghostTextIndex)}[`;
			result += `${value.substring(this.ghostTextIndex)}]`;
		} else {
			result += value.substring(this.cursorIndex);
		}
		return result;
	}

	serialize(): ISerializedPromptInputModel {
		return {
			modelState: this._createStateObject(),
			commandStartX: this._commandStartX,
			lastPromptLine: this._lastPromptLine,
			continuationPrompt: this._continuationPrompt,
			lastUserInput: this._lastUserInput
		};
	}

	deserialize(serialized: ISerializedPromptInputModel): void {
		this._value = serialized.modelState.value;
		this._cursorIndex = serialized.modelState.cursorIndex;
		this._ghostTextIndex = serialized.modelState.ghostTextIndex;
		this._commandStartX = serialized.commandStartX;
		this._lastPromptLine = serialized.lastPromptLine;
		this._continuationPrompt = serialized.continuationPrompt;
		this._lastUserInput = serialized.lastUserInput;
	}

	private _handleCommandStart(command: { marker: IMarker }) {
		if (this._state === PromptInputState.Input) {
			return;
		}

		this._state = PromptInputState.Input;
		this._commandStartMarker = command.marker;
		this._commandStartX = this._xterm.buffer.active.cursorX;
		this._value = '';
		this._cursorIndex = 0;
		this._onDidStartInput.fire(this._createStateObject());
		this._onDidChangeInput.fire(this._createStateObject());

		// Trigger a sync if prompt terminator is set as that could adjust the command start X
		if (this._lastPromptLine) {
			if (this._commandStartX !== this._lastPromptLine.length) {
				const line = this._xterm.buffer.active.getLine(this._commandStartMarker.line);
				if (line?.translateToString(true).startsWith(this._lastPromptLine)) {
					this._commandStartX = this._lastPromptLine.length;
					this._sync();
				}
			}
		}
	}

	private _handleCommandExecuted() {
		if (this._state === PromptInputState.Execute) {
			return;
		}

		this._cursorIndex = -1;

		// Remove any ghost text from the input if it exists on execute
		if (this._ghostTextIndex !== -1) {
			this._value = this._value.substring(0, this._ghostTextIndex);
			this._ghostTextIndex = -1;
		}

		const event = this._createStateObject();
		if (this._lastUserInput === '\u0003') {
			this._lastUserInput = '';
			this._onDidInterrupt.fire(event);
		}

		this._state = PromptInputState.Execute;
		this._onDidFinishInput.fire(event);
		this._onDidChangeInput.fire(event);
	}

	@throttle(0)
	private _sync() {
		try {
			this._doSync();
		} catch (e) {
			this._logService.error('Error while syncing prompt input model', e);
		}
	}

	private _doSync() {
		if (this._state !== PromptInputState.Input) {
			return;
		}

		const commandStartY = this._commandStartMarker?.line;
		if (commandStartY === undefined) {
			return;
		}

		const buffer = this._xterm.buffer.active;
		let line = buffer.getLine(commandStartY);
		const commandLine = line?.translateToString(true, this._commandStartX);
		if (!line || commandLine === undefined) {
			this._logService.trace(`PromptInputModel#_sync: no line`);
			return;
		}

		const absoluteCursorY = buffer.baseY + buffer.cursorY;
		let value = commandLine;
		let ghostTextIndex = -1;
		let cursorIndex: number;
		if (absoluteCursorY === commandStartY) {
			cursorIndex = this._getRelativeCursorIndex(this._commandStartX, buffer, line);
		} else {
			cursorIndex = commandLine.trimEnd().length;
		}

		// Detect ghost text by looking for italic or dim text in or after the cursor and
		// non-italic/dim text in the cell closest non-whitespace cell before the cursor
		if (absoluteCursorY === commandStartY && buffer.cursorX > 1) {
			// Ghost text in pwsh only appears to happen on the cursor line
			ghostTextIndex = this._scanForGhostText(buffer, line, cursorIndex);
		}

		// From command start line to cursor line
		for (let y = commandStartY + 1; y <= absoluteCursorY; y++) {
			line = buffer.getLine(y);
			const lineText = line?.translateToString(true);
			if (lineText && line) {
				// Check if the line wrapped without a new line (continuation)
				if (line.isWrapped) {
					value += lineText;
					const relativeCursorIndex = this._getRelativeCursorIndex(0, buffer, line);
					if (absoluteCursorY === y) {
						cursorIndex += relativeCursorIndex;
					} else {
						cursorIndex += lineText.length;
					}
				}
				// Verify continuation prompt if we have it, if this line doesn't have it then the
				// user likely just pressed enter.
				else if (this._continuationPrompt === undefined || this._lineContainsContinuationPrompt(lineText)) {
					const trimmedLineText = this._trimContinuationPrompt(lineText);
					value += `\n${trimmedLineText}`;
					if (absoluteCursorY === y) {
						const continuationCellWidth = this._getContinuationPromptCellWidth(line, lineText);
						const relativeCursorIndex = this._getRelativeCursorIndex(continuationCellWidth, buffer, line);
						cursorIndex += relativeCursorIndex + 1;
					} else {
						cursorIndex += trimmedLineText.length + 1;
					}
				} else {
					break;
				}
			}
		}

		// Below cursor line
		for (let y = absoluteCursorY + 1; y < buffer.baseY + this._xterm.rows; y++) {
			line = buffer.getLine(y);
			const lineText = line?.translateToString(true);
			if (lineText && line) {
				if (this._continuationPrompt === undefined || this._lineContainsContinuationPrompt(lineText)) {
					value += `\n${this._trimContinuationPrompt(lineText)}`;
				} else {
					break;
				}
			} else {
				break;
			}
		}

		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace(`PromptInputModel#_sync: ${this.getCombinedString()}`);
		}

		// Adjust trailing whitespace
		{
			let trailingWhitespace = this._value.length - this._value.trimEnd().length;

			// Handle backspace key
			if (this._lastUserInput === '\x7F') {
				this._lastUserInput = '';
				if (cursorIndex === this._cursorIndex - 1) {
					// If trailing whitespace is being increased by removing a non-whitespace character
					if (this._value.trimEnd().length > value.trimEnd().length && value.trimEnd().length <= cursorIndex) {
						trailingWhitespace = Math.max((this._value.length - 1) - value.trimEnd().length, 0);
					}
					// Standard case; subtract from trailing whitespace
					else {
						trailingWhitespace = Math.max(trailingWhitespace - 1, 0);
					}

				}
			}

			// Handle delete key
			if (this._lastUserInput === '\x1b[3~') {
				this._lastUserInput = '';
				if (cursorIndex === this._cursorIndex) {
					trailingWhitespace = Math.max(trailingWhitespace - 1, 0);
				}
			}

			const valueLines = value.split('\n');
			const isMultiLine = valueLines.length > 1;
			const valueEndTrimmed = value.trimEnd();
			if (!isMultiLine) {
				// Adjust trimmed whitespace value based on cursor position
				if (valueEndTrimmed.length < value.length) {
					// Handle space key
					if (this._lastUserInput === ' ') {
						this._lastUserInput = '';
						if (cursorIndex > valueEndTrimmed.length && cursorIndex > this._cursorIndex) {
							trailingWhitespace++;
						}
					}
					trailingWhitespace = Math.max(cursorIndex - valueEndTrimmed.length, trailingWhitespace, 0);
				}

				// Handle case where a non-space character is inserted in the middle of trailing whitespace
				const charBeforeCursor = cursorIndex === 0 ? '' : value[cursorIndex - 1];
				if (trailingWhitespace > 0 && cursorIndex === this._cursorIndex + 1 && this._lastUserInput !== '' && charBeforeCursor !== ' ') {
					trailingWhitespace = this._value.length - this._cursorIndex;
				}
			}

			if (isMultiLine) {
				valueLines[valueLines.length - 1] = valueLines.at(-1)?.trimEnd() ?? '';
				const continuationOffset = (valueLines.length - 1) * (this._continuationPrompt?.length ?? 0);
				trailingWhitespace = Math.max(0, cursorIndex - value.length - continuationOffset);
			}

			value = valueLines.map(e => e.trimEnd()).join('\n') + ' '.repeat(trailingWhitespace);
		}

		if (this._value !== value || this._cursorIndex !== cursorIndex || this._ghostTextIndex !== ghostTextIndex) {
			this._value = value;
			this._cursorIndex = cursorIndex;
			this._ghostTextIndex = ghostTextIndex;
			this._onDidChangeInput.fire(this._createStateObject());
		}
	}

	private _handleUserInput(e: string) {
		this._lastUserInput = e;
	}

	/**
	 * Detect ghost text by looking for italic or dim text in or after the cursor and
	 * non-italic/dim text in the cell closest non-whitespace cell before the cursor.
	 */
	private _scanForGhostText(buffer: IBuffer, line: IBufferLine, cursorIndex: number): number {
		// Check last non-whitespace character has non-ghost text styles
		let ghostTextIndex = -1;
		let proceedWithGhostTextCheck = false;
		let x = buffer.cursorX;
		while (x > 0) {
			const cell = line.getCell(--x);
			if (!cell) {
				break;
			}
			if (cell.getChars().trim().length > 0) {
				proceedWithGhostTextCheck = !this._isCellStyledLikeGhostText(cell);
				break;
			}
		}

		// Check to the end of the line for possible ghost text. For example pwsh's ghost text
		// can look like this `Get-|Ch[ildItem]`
		if (proceedWithGhostTextCheck) {
			let potentialGhostIndexOffset = 0;
			let x = buffer.cursorX;
			while (x < line.length) {
				const cell = line.getCell(x++);
				if (!cell || cell.getCode() === 0) {
					break;
				}
				if (this._isCellStyledLikeGhostText(cell)) {
					ghostTextIndex = cursorIndex + potentialGhostIndexOffset;
					break;
				}
				potentialGhostIndexOffset += cell.getChars().length;
			}
		}

		return ghostTextIndex;
	}

	private _trimContinuationPrompt(lineText: string): string {
		if (this._lineContainsContinuationPrompt(lineText)) {
			lineText = lineText.substring(this._continuationPrompt!.length);
		}
		return lineText;
	}

	private _lineContainsContinuationPrompt(lineText: string): boolean {
		return !!(this._continuationPrompt && lineText.startsWith(this._continuationPrompt));
	}

	private _getContinuationPromptCellWidth(line: IBufferLine, lineText: string): number {
		if (!this._continuationPrompt || !lineText.startsWith(this._continuationPrompt)) {
			return 0;
		}
		let buffer = '';
		let x = 0;
		while (buffer !== this._continuationPrompt) {
			buffer += line.getCell(x++)!.getChars();
		}
		return x;
	}

	private _getRelativeCursorIndex(startCellX: number, buffer: IBuffer, line: IBufferLine): number {
		return line?.translateToString(true, startCellX, buffer.cursorX).length ?? 0;
	}

	private _isCellStyledLikeGhostText(cell: IBufferCell): boolean {
		return !!(cell.isItalic() || cell.isDim());
	}

	private _createStateObject(): IPromptInputModelState {
		return Object.freeze({
			value: this._value,
			cursorIndex: this._cursorIndex,
			ghostTextIndex: this._ghostTextIndex
		});
	}
}
