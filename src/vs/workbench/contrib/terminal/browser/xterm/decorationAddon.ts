/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICurrentPartialCommand } from 'vs/workbench/contrib/terminal/browser/capabilities/commandDetectionCapability';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITerminalAddon, Terminal } from 'xterm';
import * as dom from 'vs/base/browser/dom';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';

export class DecorationAddon extends Disposable implements ITerminalAddon {

	protected _terminal: Terminal | undefined;

	constructor(@IClipboardService private readonly _clipboardService: IClipboardService) {
		super();
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	registerOutputDecoration(currentCommand: ICurrentPartialCommand, newCommand: ITerminalCommand): void {
		const output = newCommand.getOutput();
		if (!currentCommand.commandStartMarker || !this._terminal || !output) {
			return;
		}
		const decoration = this._terminal.registerDecoration({ marker: currentCommand.commandStartMarker, anchor: 'left', x: -2 });
		if (decoration?.element) {
			dom.addDisposableListener(decoration.element, 'click', async () => {
				await this._clipboardService.writeText(output);
			});
			if (newCommand.exitCode) {
				decoration.element.classList.add('prompt-xterm-error');
			} else {
				decoration.element.classList.add('prompt-xterm-decoration');
			}
			currentCommand.outputDecoration = decoration;
		}
	}
}
