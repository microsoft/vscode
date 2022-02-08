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
import { TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR, TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR_ERROR, TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR_NO_OUTPUT } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Codicon } from 'vs/base/common/codicons';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';

export class DecorationAddon extends Disposable implements ITerminalAddon {
	private _decorations: IDecoration[] = [];
	protected _terminal: Terminal | undefined;

	constructor(
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		capabilities: ITerminalCapabilityStore
	) {
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

	registerOutputDecoration(command: ITerminalCommand): IDecoration {
		if (!command.marker || !this._terminal || !command.endMarker) {
			throw new Error(`cannot add decoration, ${command.marker}, ${this._terminal}`);
		}
		const decoration = this._terminal.registerDecoration({ marker: command.marker, width: .5 });
		if (decoration?.element && command.command.trim().length > 0) {
			const hasOutput = command.endMarker!.line - command.startMarker!.line > 0;
			console.log(hasOutput, command.getOutput());
			dom.addDisposableListener(decoration.element, 'click', async () => {
				const copyOutputAction = { class: 'copy-output', icon: Codicon.output, tooltip: 'Copy Output', dispose: () => { }, id: 'terminal.copyOutput', label: 'Copy Output', enabled: true, run: async () => await this._clipboardService.writeText(command.getOutput()!) };
				const rerunCommandAction = {
					class: 'rerun-command', icon: Codicon.run, tooltip: 'Rerun Command', dispose: () => { }, id: 'terminal.rerunCommand', label: 'Re-run Command', enabled: true,
					run: async () => {
						await this._terminal!.writeln(command.command);
					}
				};
				this._contextMenuService.showContextMenu({
					getAnchor: () => decoration.element!,
					getActions: () => hasOutput ? [copyOutputAction, rerunCommandAction] : [rerunCommandAction],
				});
			});
			dom.addDisposableListener(decoration.element, 'mouseenter', async () => {
				this._hoverService.showHover({ content: 'Show Actions', target: decoration.element! });
			});
			dom.addDisposableListener(decoration.element, 'mouseleave', async () => {
				this._hoverService.hideHover();
			});
			decoration.element.classList.add('terminal-prompt-decoration');
			if (hasOutput) {
				decoration.element.classList.add(command.exitCode ? 'error' : 'normal');
			} else {
				decoration.element.classList.add('no-output');
			}
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
	const promptDecorationBackgroundNoOutput = theme.getColor(TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR_NO_OUTPUT);
	collector.addRule(`.terminal-prompt-decoration.no-output { background-color: ${promptDecorationBackgroundNoOutput ? promptDecorationBackgroundNoOutput.toString() : ''}; }`);
});
