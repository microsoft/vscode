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

export interface ITextAreaData {
	content: string;
	cursorX: number;
}

export class TextAreaSyncAddon extends Disposable implements ITerminalAddon {
	private _terminal: Terminal | undefined;
	private _listeners = this._register(new MutableDisposable<DisposableStore>());
	private _currentCommand: string | undefined;
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
			textArea.selectionStart = this._cursorX ?? 0;
			textArea.selectionEnd = this._cursorX ?? 0;
			this._logService.debug(`TextAreaSyncAddon#syncTextArea: selection start/end changed to ${this._cursorX}`);
		}
	}

	private _updateCommandAndCursor(): void {
		if (!this._terminal) {
			return;
		}
		const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		const currentCommand = commandCapability?.currentCommand;
		if (!currentCommand) {
			this._logService.debug(`TextAreaSyncAddon#updateCommandAndCursor: no current command`);
			return;
		}
		const buffer = this._terminal.buffer.active;
		const lineNumber = currentCommand.commandStartMarker?.line;
		if (!lineNumber) {
			return;
		}
		const commandLine = buffer.getLine(lineNumber)?.translateToString(true);
		if (!commandLine) {
			this._logService.debug(`TextAreaSyncAddon#updateCommandAndCursor: no line`);
			return;
		}
		if (currentCommand.commandStartX !== undefined) {
			this._currentCommand = commandLine.substring(currentCommand.commandStartX);
			this._cursorX = buffer.cursorX - currentCommand.commandStartX;
		} else {
			this._currentCommand = undefined;
			this._cursorX = undefined;
			this._logService.debug(`TextAreaSyncAddon#updateCommandAndCursor: no commandStartX`);
		}
	}
}
