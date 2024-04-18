/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import type { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';

// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { Terminal, IMarker } from '@xterm/headless';
import { debounce } from 'vs/base/common/decorators';

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
		private readonly _logService: ILogService
	) {
		super();

		this._register(this._xterm.onData(e => this._handleInput(e)));
		this._register(this._xterm.onCursorMove(() => this._sync()));
		// TODO: Listen to the xterm textarea focus event?

		this._register(onCommandStart(e => this._handleCommandStart(e as { marker: IMarker })));
		this._register(onCommandExecuted(() => this._handleCommandExecuted()));
	}

	setContinuationPrompt(value: string): void {
		console.log('setContinuationPrompt', value);
		this._continuationPrompt = value;
	}

	private _handleCommandStart(command: { marker: IMarker }) {
		if (this._state === PromptInputState.Input) {
			return;
		}

		this._state = PromptInputState.Input;
		this._commandStartMarker = command.marker;
		this._commandStartX = this._xterm.buffer.active.cursorX;
		console.log('commandStart', command.marker.line, this._commandStartX);
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
		this._logService.trace(`PromptInputModel#_handleInput data=${data}`);
		this._sync();
	}

	@debounce(50)
	private _sync() {
		if (this._state !== PromptInputState.Input) {
			return;
		}

		const commandStartY = this._commandStartMarker?.line;
		if (!commandStartY) {
			return;
		}

		const buffer = this._xterm.buffer.active;
		const commandLine = buffer.getLine(commandStartY)?.translateToString(true);
		if (!commandLine) {
			this._logService.trace(`PromptInputModel#_sync: no line`);
			return;
		}

		// Command start line
		this._value = commandLine.substring(this._commandStartX);
		this._cursorIndex = Math.max(buffer.cursorX - this._commandStartX, 0);

		// IDEA: Reinforce knowledge of prompt to avoid incorrect commandStart
		// IDEA: Detect ghost text based on SGR and cursor

		// From command start line to cursor line
		const absoluteCursorY = buffer.baseY + buffer.cursorY;
		for (let y = commandStartY + 1; y <= absoluteCursorY; y++) {
			let lineText = buffer.getLine(y)?.translateToString(true);
			if (lineText) {
				// Verify continuation prompt if we have it, if this line doesn't have it then the
				// user likely just pressed enter
				if (this._continuationPrompt === undefined || this._lineContainsContinuationPrompt(lineText)) {
					lineText = this._trimContinuationPrompt(lineText);
					this._value += `\n${lineText}`;
					if (y === absoluteCursorY) {
						// TODO: Wide/emoji length support
						this._cursorIndex = Math.max(this._value.length - lineText.length - (this._continuationPrompt?.length ?? 0) + buffer.cursorX, 0);
					}
				} else {
					this._cursorIndex = this._value.length;
					break;
				}
			}
		}

		// Below cursor line
		for (let y = absoluteCursorY + 1; y < buffer.baseY + this._xterm.rows; y++) {
			const lineText = buffer.getLine(y)?.translateToString(true);
			if (lineText) {
				if (this._continuationPrompt === undefined || this._lineContainsContinuationPrompt(lineText)) {
					this._value += `\n${this._trimContinuationPrompt(lineText)}`;
				} else {
					break;
				}
			}
		}

		if (this._logService.getLevel() === LogLevel.Trace) {
			this._logService.trace(`PromptInputModel#_sync: Input="${this._value.substring(0, this._cursorIndex)}|${this.value.substring(this._cursorIndex)}"`);
		}

		this._onDidChangeInput.fire();
	}

	private _trimContinuationPrompt(lineText: string): string {
		// TODO: Detect line continuation if it's not set
		if (this._lineContainsContinuationPrompt(lineText)) {
			lineText = lineText.substring(this._continuationPrompt!.length);
		}
		return lineText;
	}

	private _lineContainsContinuationPrompt(lineText: string): boolean {
		return !!(this._continuationPrompt && lineText.startsWith(this._continuationPrompt));
	}
}
