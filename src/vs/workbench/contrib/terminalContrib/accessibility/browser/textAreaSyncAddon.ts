/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalLogService } from 'vs/platform/terminal/common/terminal';
import type { Terminal, ITerminalAddon } from 'xterm';
import { debounce } from 'vs/base/common/decorators';
import { addDisposableListener } from 'vs/base/browser/dom';
import { ICurrentPartialCommand } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';

export interface ITextAreaData {
	content: string;
	cursorX: number;
}

export class TextAreaSyncAddon extends Disposable implements ITerminalAddon {
	private _terminal: Terminal | undefined;
	private _listeners = this._register(new MutableDisposable<DisposableStore>());
	private _currentCommand: string | undefined;
	private _currentPartialCommand: ICurrentPartialCommand | undefined;
	private _cursorX: number | undefined;

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		if (this._accessibilityService.isScreenReaderOptimized()) {
			this._registerSyncListeners();
		}
	}

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ITerminalLogService private readonly _logService: ITerminalLogService
	) {
		super();
		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			if (this._accessibilityService.isScreenReaderOptimized()) {
				this._syncTextArea();
				this._registerSyncListeners();
			} else {
				this._listeners.clear();
			}
		}));
	}

	private _registerSyncListeners(): void {
		if (this._accessibilityService.isScreenReaderOptimized() && this._terminal?.textarea) {
			this._listeners.value = new DisposableStore();
			this._listeners.value.add(this._terminal.onCursorMove(() => this._syncTextArea()));
			this._listeners.value.add(this._terminal.onData(() => this._syncTextArea()));
			this._listeners.value.add(addDisposableListener(this._terminal.textarea, 'focus', () => this._syncTextArea()));
		}
	}

	@debounce(50)
	private _syncTextArea(): void {
		this._logService.debug('TextAreaSyncAddon#syncTextArea');
		const textArea = this._terminal?.textarea;
		if (!textArea) {
			this._logService.debug(`TextAreaSyncAddon#syncTextArea: no textarea`);
			return;
		}

		this._updateCommandAndCursor();

		if (this._currentCommand !== textArea.value) {
			textArea.value = this._currentCommand || '';
			this._logService.debug(`TextAreaSyncAddon#syncTextArea: text changed to "${this._currentCommand}"`);
		} else if (!this._currentCommand) {
			textArea.value = '';
			this._logService.debug(`TextAreaSyncAddon#syncTextArea: text cleared`);
		}

		if (this._cursorX !== textArea.selectionStart) {
			const selection = !this._cursorX || this._cursorX < 0 ? 0 : this._cursorX;
			textArea.selectionStart = selection;
			textArea.selectionEnd = selection;
			this._logService.debug(`TextAreaSyncAddon#syncTextArea: selection start/end changed to ${selection}`);
		}
	}

	private _updateCommandAndCursor(): void {
		if (!this._terminal) {
			return;
		}
		const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		this._currentPartialCommand = commandCapability?.currentCommand;
		if (!this._currentPartialCommand) {
			this._logService.debug(`TextAreaSyncAddon#updateCommandAndCursor: no current command`);
			return;
		}
		const buffer = this._terminal.buffer.active;
		const lineNumber = this._currentPartialCommand.commandStartMarker?.line;
		if (!lineNumber) {
			return;
		}
		const commandLine = buffer.getLine(lineNumber)?.translateToString(true);
		if (!commandLine) {
			this._logService.debug(`TextAreaSyncAddon#updateCommandAndCursor: no line`);
			return;
		}
		this._logService.info('commandLine', commandLine);
		this._logService.info('match ', commandLine.match((/.*PS.*|[A-Z]:\\*>/)));
		let isGuessForPrompt = false;
		if (this._currentPartialCommand.isInvalid || !commandLine.match((/.*PS.*>|[A-Z]:\\*>/)) && this._capabilities.get(TerminalCapability.CommandDetection)?.commands.length) {
			const commands = this._capabilities.get(TerminalCapability.CommandDetection)?.commands;
			const command = commands?.slice().reverse().find(c => c.marker?.line && this._currentPartialCommand?.commandStartMarker?.line && c.marker.line < this._currentPartialCommand?.commandStartMarker?.line);
			isGuessForPrompt = true;
			this._logService.info('reassigned command from {0} to {1}', this._currentPartialCommand, command);
			this._currentPartialCommand = command;
			const buffer = this._terminal.buffer.active;
			const lineNumber = this._currentPartialCommand?.commandStartMarker?.line;
			if (!lineNumber) {
				return;
			}
			const commandLine = buffer.getLine(lineNumber)?.translateToString(true);
			if (!commandLine) {
				this._logService.debug(`TextAreaSyncAddon#updateCommandAndCursor: no line`);
				return;
			}
		}
		this._logService.info('guess', isGuessForPrompt);
		if (this._currentPartialCommand?.commandStartX !== undefined) {
			const start = this._currentPartialCommand.commandStartX;
			this._currentCommand = commandLine.substring(this._currentPartialCommand.commandStartX) || commandLine;
			if (isGuessForPrompt) {
				this._currentCommand = this._currentCommand.match(/.*PS.*>|[A-Z]:\\*>/)?.[0];
			}
			this._logService.info('start, end, commandline', start, commandLine, this._currentCommand);
			this._cursorX = buffer.cursorX - this._currentPartialCommand.commandStartX;
		} else {
			this._currentCommand = undefined;
			this._cursorX = undefined;
			this._logService.debug(`TextAreaSyncAddon#updateCommandAndCursor: no commandStartX`);
		}
	}
}
