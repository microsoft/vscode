/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
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
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			if (this._accessibilityService.isScreenReaderOptimized() && this._terminal) {
				this._refreshTextArea()
				this._onCursorMoveListener.value = this._terminal.onCursorMove(() => this._refreshTextArea());
			} else {
				this._onCursorMoveListener.clear();
			}
		}));
	}

	private _refreshTextArea(): void {
		if (!this._terminal) {
			return;
		}

		const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		const currentCommand = commandCapability?.currentCommand;
		if (!currentCommand) {
			return;
		}
		const buffer = this._terminal.buffer.active;
		const line = buffer.getLine(buffer.cursorY)?.translateToString(true);
		let commandStartX: number | undefined;
		if (!line) {
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
			return;
		}

		if (commandStartX === undefined) {
			return;
		}

		const textArea = this._terminal.textarea;
		if (!textArea) {
			return;
		}

		if (content !== textArea.textContent) {
			textArea.textContent = content;
		}

		const cursorX = buffer.cursorX - commandStartX;
		if (cursorX !== textArea.selectionStart) {
			textArea.selectionStart = cursorX;
			textArea.selectionEnd = cursorX;
		}
		// TODO: cursorY?
	}
}
