/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import type { Terminal, ITerminalAddon } from 'xterm';

export interface ITextAreaData {
	content: string;
	cursorX: number;
}

export class TextAreaSyncAddon extends Disposable implements ITerminalAddon {
	private _terminal: Terminal | undefined;
	private readonly _onDidRequestTextAreaSync = this._register(new Emitter<ITextAreaData>());
	readonly onDidRequestTextAreaSync = this._onDidRequestTextAreaSync.event;
	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._register(this._terminal.onCursorMove(() => this._refreshTextArea()));
	}

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
	}

	private _refreshTextArea(): void {
		if (!this._terminal) {
			return;
		}
		if (this._accessibilityService.isScreenReaderOptimized()) {
			const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
			const currentCommand = commandCapability?.currentCommand;
			if (!currentCommand) {
				return;
			}
			const buffer = this._terminal.buffer.active;
			const line = buffer.getLine(buffer.cursorY)?.translateToString(true);
			let content: string = '';
			let commandStartX: number | undefined;
			if (!line) {
				return;
			}
			if (currentCommand.commandStartX) {
				// Left prompt
				content = line.substring(currentCommand.commandStartX).trim();
				commandStartX = currentCommand.commandStartX;
			} else if (currentCommand.commandRightPromptStartX) {
				// Right prompt
				content = line.substring(0, currentCommand.commandRightPromptStartX).trim();
				commandStartX = 0;
			}
			if (commandStartX) {
				this._onDidRequestTextAreaSync.fire({ content, cursorX: buffer.cursorX - commandStartX });
			}
		}
	}

}
