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
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { localize } from 'vs/nls';

const enum DecorationSelector {
	PromptDecoration = 'terminal-prompt-decoration',
	Error = 'error',
	NoOutput = 'no-output'
}

const enum DecorationProperties {
	Width = .5
}

export class DecorationAddon extends Disposable implements ITerminalAddon {
	private _decorations: IDecoration[] = [];
	protected _terminal: Terminal | undefined;

	private readonly _onRunCommandRequested = this._register(new Emitter<string>());
	readonly onRunCommandRequested = this._onRunCommandRequested.event;

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
					const element = this.registerPromptDecoration(c);
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

	registerPromptDecoration(command: ITerminalCommand): IDecoration | undefined {
		if (!command.marker || !command.endMarker || !command.startMarker) {
			throw new Error(`cannot add decoration, for command: ${command}, and terminal: ${this._terminal}`);
		} else if (!this._terminal || command.command.trim().length === 0) {
			return undefined;
		}
		const decoration = this._terminal.registerDecoration({ marker: command.marker, width: DecorationProperties.Width });
		const target = decoration?.element;
		if (!!target) {
			const hasOutput = command.endMarker.line - command.startMarker.line > 0;
			this._register(dom.addDisposableListener(target, dom.EventType.CLICK, async () => {
				const actions = await this._getDecorationActions(command, hasOutput);
				this._contextMenuService.showContextMenu({ getAnchor: () => target, getActions: () => actions });
			}));
			this._register(dom.addDisposableListener(target, dom.EventType.MOUSE_ENTER, async () => {
				let hoverContent = `${localize('terminal-prompt-context-menu', "Show Actions")}` + ` ...${command.getTimeFromNow()} `;
				if (command.exitCode) {
					hoverContent += `\n\n\n\nExit Code: ${command.exitCode} `;
				}
				const hoverOptions = { content: new MarkdownString(hoverContent), target };
				this._hoverService.showHover(hoverOptions);
			}));
			this._register(dom.addDisposableListener(target, dom.EventType.MOUSE_LEAVE, async () => {
				this._hoverService.hideHover();
			}));
			target.classList.add(DecorationSelector.PromptDecoration);
			if (!hasOutput) {
				target.classList.add(DecorationSelector.NoOutput);
			} else if (command.exitCode) {
				target.classList.add(DecorationSelector.Error);
			}
			return decoration;
		} else {
			throw new Error('Cannot register decoration for a marker that has already been disposed of');
		}
	}

	private async _getDecorationActions(command: ITerminalCommand, hasOutput?: boolean): Promise<IAction[]> {
		const copyOutputAction = {
			class: 'copy-output', tooltip: 'Copy Output', dispose: () => { }, id: 'terminal.copyOutput', label: 'Copy Output', enabled: true,
			run: async () => {
				await this._clipboardService.writeText(command.getOutput()!);
			}
		};
		const rerunCommandAction = {
			class: 'rerun-command', tooltip: 'Rerun Command', dispose: () => { }, id: 'terminal.rerunCommand', label: 'Re-run Command', enabled: true,
			run: async () => {
				this._onRunCommandRequested.fire(command.command);
			}
		};
		return hasOutput ? [copyOutputAction, rerunCommandAction] : [rerunCommandAction];
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const promptDecorationBackground = theme.getColor(TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR);
	collector.addRule(`.terminal-prompt-decoration { background-color: ${promptDecorationBackground ? promptDecorationBackground.toString() : ''}; }`);
	const promptDecorationBackgroundError = theme.getColor(TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR_ERROR);
	collector.addRule(`.terminal-prompt-decoration.${DecorationSelector.Error} { background-color: ${promptDecorationBackgroundError ? promptDecorationBackgroundError.toString() : ''}; }`);
	const promptDecorationBackgroundNoOutput = theme.getColor(TERMINAL_PROMPT_DECORATION_BACKGROUND_COLOR_NO_OUTPUT);
	collector.addRule(`.terminal-prompt-decoration.${DecorationSelector.NoOutput} { background-color: ${promptDecorationBackgroundNoOutput ? promptDecorationBackgroundNoOutput.toString() : ''}; }`);
});
