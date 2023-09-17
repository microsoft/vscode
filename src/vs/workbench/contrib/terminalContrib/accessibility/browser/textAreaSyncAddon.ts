/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalLogService } from 'vs/platform/terminal/common/terminal';
import type { Terminal, ITerminalAddon } from 'xterm';

export interface ITextAreaData {
	content: string;
	cursorX: number;
}

export class TextAreaSyncAddon extends Disposable implements ITerminalAddon {
	private _terminal: Terminal | undefined;
	private _onCursorMoveListener = this._register(new MutableDisposable());
	activate(terminal: Terminal): void {
		this._terminal = terminal;
		if (this._accessibilityService.isScreenReaderOptimized()) {
			this._onCursorMoveListener.value = this._terminal.onCursorMove(() => this._refreshTextArea());
		}
	}

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ITerminalLogService private readonly _logService: ITerminalLogService
	) {
		super();
		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			if (this._accessibilityService.isScreenReaderOptimized() && this._terminal) {
				this._refreshTextArea();
				this._onCursorMoveListener.value = this._terminal.onCursorMove(() => this._refreshTextArea());
			} else {
				this._onCursorMoveListener.clear();
			}
		}));
	}

	private _refreshTextArea(focusChanged?: boolean): void {
		if (!this._terminal) {
			return;
		}
		this._logService.debug('TextAreaSyncAddon#refreshTextArea');
		const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		const currentCommand = commandCapability?.currentCommand;
		if (!currentCommand) {
			this._logService.debug(`TextAreaSyncAddon#refreshTextArea: no currentCommand`);
			return;
		}
		const buffer = this._terminal.buffer.active;
		const line = buffer.getLine(buffer.cursorY)?.translateToString(true);
		let commandStartX: number | undefined;
		if (!line) {
			this._logService.debug(`TextAreaSyncAddon#refreshTextArea: no line`);
			return;
		}
		let content: string | undefined;
		if (currentCommand.commandStartX) {
			// Left prompt
			content = line.substring(currentCommand.commandStartX);
			commandStartX = currentCommand.commandStartX;
		} else if (currentCommand.commandRightPromptStartX) {
			// Right prompt
			content = line.substring(0, currentCommand.commandRightPromptStartX);
			commandStartX = 0;
		}

		if (!content) {
			this._logService.debug(`TextAreaSyncAddon#refreshTextArea: no content`);
			return;
		}

		if (commandStartX === undefined) {
			this._logService.debug(`TextAreaSyncAddon#refreshTextArea: no commandStartX`);
			return;
		}

		const textArea = this._terminal.textarea;
		if (!textArea) {
			this._logService.debug(`TextAreaSyncAddon#refreshTextArea: no textarea`);
			return;
		}

		this._logService.debug(`TextAreaSyncAddon#refreshTextArea: content is "${content}"`);
		this._logService.debug(`TextAreaSyncAddon#refreshTextArea: textContent is "${textArea.textContent}"`);
		if (focusChanged || content !== textArea.textContent) {
			textArea.textContent = content;
			this._logService.debug(`TextAreaSyncAddon#refreshTextArea: textContent changed to "${content}"`);
		}

		const cursorX = buffer.cursorX - commandStartX;
		this._logService.debug(`TextAreaSyncAddon#refreshTextArea: cursorX is ${cursorX}`);
		this._logService.debug(`TextAreaSyncAddon#refreshTextArea: selectionStart is ${textArea.selectionStart}`);
		if (focusChanged || cursorX !== textArea.selectionStart) {
			textArea.selectionStart = cursorX;
			textArea.selectionEnd = cursorX;
			this._logService.debug(`TextAreaSyncAddon#refreshTextArea: selectionStart changed to ${cursorX}`);
		}
		// TODO: cursorY?
	}
}
