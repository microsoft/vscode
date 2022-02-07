/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { IDecoration, ITerminalAddon, Terminal } from 'xterm';
import * as dom from 'vs/base/browser/dom';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';

export class DecorationAddon extends Disposable implements ITerminalAddon {
	private _decorations: IDecoration[] = [];
	protected _terminal: Terminal | undefined;

	constructor(@IClipboardService private readonly _clipboardService: IClipboardService, capabilities: ITerminalCapabilityStore) {
		super();
		capabilities.onDidAddCapability(c => {
			if (c === TerminalCapability.CommandDetection) {
				capabilities.get(TerminalCapability.CommandDetection)?.onCommandFinished(c => this._decorations.push(this.registerOutputDecoration(c)));
			}
		});
	}

	override dispose(): void {
		for (const decoration of this._decorations) {
			decoration.dispose();
		}
		super.dispose();
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	registerOutputDecoration(command: ITerminalCommand): IDecoration {
		const output = command.getOutput();
		if (!command.marker || !this._terminal || !output) {
			throw new Error(`Cannot register output decoration for command: ${command}, terminal: ${this._terminal}, and output: ${output}`);
		}
		//TODO: disallow negative x, use negative left margin %
		const decoration = this._terminal.registerDecoration({ marker: command.marker, anchor: 'left', x: -2 });
		if (decoration?.element) {
			dom.addDisposableListener(decoration.element, 'click', async () => {
				await this._clipboardService.writeText(output);
			});
			// TODO:apply classes
			decoration.element.classList.add('terminal-prompt-decoration');
			decoration.element.style.backgroundColor = command.exitCode ? 'red' : 'blue';
			return decoration;
		} else {
			throw new Error('Cannot register decoration for a marker that has already been disposed of');
		}
	}
}
