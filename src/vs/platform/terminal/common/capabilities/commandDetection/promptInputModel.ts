/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import type { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { debounce } from 'vs/base/common/decorators';

// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { Terminal, IMarker, IBufferCell, IBufferLine, IBuffer } from '@xterm/headless';

const enum PromptInputState {
	Unknown,
	Input,
	Execute,
}

export interface IPromptInputModel {
	readonly onDidStartInput: Event<void>;
	readonly onDidChangeInput: Event<void>;
	readonly onDidFinishInput: Event<void>;

	readonly value: string;
	readonly cursorIndex: number;
	readonly ghostTextIndex: number;

	/**
	 * Gets the prompt input as a user-friendly string where `|` is the cursor position and `[` and
	 * `]` wrap any ghost text.
	 */
	getCombinedString(): string;
}

export class PromptInputModel extends Disposable implements IPromptInputModel {
	private _state: PromptInputState = PromptInputState.Unknown;

	private _commandStartMarker: IMarker | undefined;
	private _commandStartX: number = 0;
	private _continuationPrompt: string | undefined;

	private _value: string = '';
	get value() { return this._value; }

	private _cursorIndex: number = 0;
	get cursorIndex() { return this._cursorIndex; }

	private _ghostTextIndex: number = -1;
	get ghostTextIndex() { return this._ghostTextIndex; }

	private readonly _onDidStartInput = this._register(new Emitter<void>());
	readonly onDidStartInput = this._onDidStartInput.event;
	private readonly _onDidChangeInput = this._register(new Emitter<void>());
	readonly onDidChangeInput = this._onDidChangeInput.event;
	private readonly _onDidFinishInput = this._register(new Emitter<void>());
	readonly onDidFinishInput = this._onDidFinishInput.event;

	constructor(
		private readonly _xterm: Terminal,
		onCommandStart: Event<ITerminalCommand>,
		onCommandExecuted: Event<ITerminalCommand>,
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._register(this._xterm.onData(e => this._handleInput(e)));
		this._register(this._xterm.onCursorMove(() => this._sync()));

		this._register(onCommandStart(e => this._handleCommandStart(e as { marker: IMarker })));
		this._register(onCommandExecuted(() => this._handleCommandExecuted()));
	}

	setContinuationPrompt(value: string): void {
		this._continuationPrompt = value;
	}

	getCombinedString(): string {
		const value = this._value.replaceAll('\n', '\u23CE');
		let result = `${value.substring(0, this.cursorIndex)}|`;
		if (this.ghostTextIndex !== -1) {
			result += `${value.substring(this.cursorIndex, this.ghostTextIndex)}[`;
			result += `${value.substring(this.ghostTextIndex)}]`;
		} else {
			result += value.substring(this.cursorIndex);
		}
		return result;
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
		this._onDidStartInput.fire();
	}

	private _handleCommandExecuted() {
		if (this._state === PromptInputState.Execute) {
			return;
		}

		this._state = PromptInputState.Execute;
		this._onDidFinishInput.fire();
	}

	private _handleInput(data: string) {
		this._sync();
	}

	@debounce(50)
	private _sync() {
		this._syncNow();
	}

	protected _syncNow() {
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

		// Command start line
		this._value = commandLine;

		// Get cursor index
		const absoluteCursorY = buffer.baseY + buffer.cursorY;
		this._cursorIndex = absoluteCursorY === commandStartY ? this._getRelativeCursorIndex(this._commandStartX, buffer, line) : commandLine.length + 1;
		this._ghostTextIndex = -1;

		// Detect ghost text by looking for italic or dim text in or after the cursor and
		// non-italic/dim text in the cell closest non-whitespace cell before the cursor
		if (absoluteCursorY === commandStartY && buffer.cursorX > 1) {
			// Ghost text in pwsh only appears to happen on the cursor line
			this._ghostTextIndex = this._scanForGhostText(buffer, line);
		}

		// IDEA: Detect line continuation if it's not set

		// From command start line to cursor line
		for (let y = commandStartY + 1; y <= absoluteCursorY; y++) {
			line = buffer.getLine(y);
			let lineText = line?.translateToString(true);
			if (lineText && line) {
				// Verify continuation prompt if we have it, if this line doesn't have it then the
				// user likely just pressed enter
				if (this._continuationPrompt === undefined || this._lineContainsContinuationPrompt(lineText)) {
					lineText = this._trimContinuationPrompt(lineText);
					this._value += `\n${lineText}`;
					this._cursorIndex += (absoluteCursorY === y
						? this._getRelativeCursorIndex(this._getContinuationPromptCellWidth(line, lineText), buffer, line)
						: lineText.length + 1);
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
					this._value += `\n${this._trimContinuationPrompt(lineText)}`;
				} else {
					break;
				}
			}
		}

		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace(`PromptInputModel#_sync: ${this.getCombinedString()}`);
		}

		this._onDidChangeInput.fire();
	}

	/**
	 * Detect ghost text by looking for italic or dim text in or after the cursor and
	 * non-italic/dim text in the cell closest non-whitespace cell before the cursor.
	 */
	private _scanForGhostText(buffer: IBuffer, line: IBufferLine): number {
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
					ghostTextIndex = this._cursorIndex + potentialGhostIndexOffset;
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
}
