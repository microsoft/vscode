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
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR, TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR_ERROR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';

export class DecorationAddon extends Disposable implements ITerminalAddon {
	private _decorations: IDecoration[] = [];
	protected _terminal: Terminal | undefined;

	constructor(@IClipboardService private readonly _clipboardService: IClipboardService, capabilities: ITerminalCapabilityStore) {
		super();
		capabilities.onDidAddCapability(c => {
			if (c === TerminalCapability.CommandDetection) {
				capabilities.get(TerminalCapability.CommandDetection)?.onCommandFinished(c => {
					const element = this.registerOutputDecoration(c);
					if (element) {
						this._decorations.push(element);
					}
				});
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

	registerOutputDecoration(command: ITerminalCommand): IDecoration | undefined {
		const output = command.getOutput();
		if (!command.marker || !this._terminal || !output) {
			return undefined;
		}
		const decoration = this._terminal.registerDecoration({ marker: command.marker, width: .5 });
		if (decoration?.element) {
			dom.addDisposableListener(decoration.element, 'click', async () => {
				await this._clipboardService.writeText(output);
			});
			decoration.element.classList.add('terminal-prompt-decoration');
			decoration.element.classList.add(command.exitCode ? 'error' : 'normal');
			return decoration;
		} else {
			throw new Error('Cannot register decoration for a marker that has already been disposed of');
		}
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const promptDecorationBackground = theme.getColor(TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR);
	collector.addRule(`.terminal-prompt-decoration.normal { background-color: ${promptDecorationBackground ? promptDecorationBackground.toString() : ''}; }`);
	const promptDecorationBackgroundError = theme.getColor(TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR_ERROR);
	collector.addRule(`.terminal-prompt-decoration.error { background-color: ${promptDecorationBackgroundError ? promptDecorationBackgroundError.toString() : ''}; }`);
});
