/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { IDecoration, ITerminalAddon, Terminal } from 'xterm';
import * as dom from 'vs/base/browser/dom';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_SKIPPED_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { localize } from 'vs/nls';
import { Delayer } from 'vs/base/common/async';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { fromNow } from 'vs/base/common/date';
import { toolbarHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';

const enum DecorationSelector {
	CommandDecoration = 'terminal-command-decoration',
	ErrorColor = 'error',
	SkippedColor = 'skipped',
	Codicon = 'codicon',
}

const enum DecorationStyles { ButtonMargin = 4 }

interface IDisposableDecoration { decoration: IDecoration; disposables: IDisposable[] }

export class DecorationAddon extends Disposable implements ITerminalAddon {
	protected _terminal: Terminal | undefined;
	private _hoverDelayer: Delayer<void>;
	private _commandListener: IDisposable | undefined;
	private _contextMenuVisible: boolean = false;
	private _decorations: Map<number, IDisposableDecoration> = new Map();

	private readonly _onDidRequestRunCommand = this._register(new Emitter<string>());
	readonly onDidRequestRunCommand = this._onDidRequestRunCommand.event;

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._register({
			dispose: () => {
				this._commandListener?.dispose();
				this._clearDecorations();
			}
		});
		this._attachToCommandCapability();
		this._register(this._contextMenuService.onDidShowContextMenu(() => this._contextMenuVisible = true));
		this._register(this._contextMenuService.onDidHideContextMenu(() => this._contextMenuVisible = false));
		this._hoverDelayer = this._register(new Delayer(this._configurationService.getValue('workbench.hover.delay')));
	}

	private _clearDecorations(): void {
		for (const [, decorationDisposables] of Object.entries(this._decorations)) {
			decorationDisposables.decoration.dispose();
			dispose(decorationDisposables.disposables);
		}
		this._decorations.clear();
	}

	private _attachToCommandCapability(): void {
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			this._addCommandListener();
		} else {
			this._register(this._capabilities.onDidAddCapability(c => {
				if (c === TerminalCapability.CommandDetection) {
					this._addCommandListener();
				}
			}));
		}
		this._register(this._capabilities.onDidRemoveCapability(c => {
			if (c === TerminalCapability.CommandDetection) {
				this._commandListener?.dispose();
			}
		}));
	}

	private _addCommandListener(): void {
		if (this._commandListener) {
			return;
		}
		const capability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!capability) {
			return;
		}
		this._commandListener = capability.onCommandFinished(c => this.registerCommandDecoration(c));
	}

	activate(terminal: Terminal): void { this._terminal = terminal; }

	registerCommandDecoration(command: ITerminalCommand): IDecoration | undefined {
		if (!command.marker) {
			throw new Error(`cannot add a decoration for a command ${JSON.stringify(command)} with no marker`);
		}
		if (!this._terminal) {
			return undefined;
		}

		const decoration = this._terminal.registerDecoration({ marker: command.marker });
		if (!decoration) {
			return undefined;
		}

		decoration.onRender(target => {
			if (decoration.element && !this._decorations.get(decoration.marker.id)) {
				const disposables = command.exitCode === undefined ? [] : [this._createContextMenu(decoration.element, command), ...this._createHover(decoration.element, command)];
				this._decorations.set(decoration.marker.id, { decoration, disposables });
			}
			if (decoration.element?.clientWidth! > 0) {
				const marginWidth = ((decoration.element?.parentElement?.parentElement?.previousElementSibling?.clientWidth || 0) - (decoration.element?.parentElement?.parentElement?.clientWidth || 0)) * .5;
				target.style.marginLeft = `${((marginWidth - (decoration.element!.clientWidth + DecorationStyles.ButtonMargin)) * .5) - marginWidth}px`;
				target.classList.add(DecorationSelector.CommandDecoration);
				target.classList.add(DecorationSelector.Codicon);
				if (command.exitCode === undefined) {
					target.classList.add(DecorationSelector.SkippedColor);
					// TODO: Use outline icon?
					target.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.CommandIcon)}`);
				} else if (command.exitCode) {
					target.classList.add(DecorationSelector.ErrorColor);
					target.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.CommandIconError)}`);
				} else {
					target.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.CommandIcon)}`);
				}
				target.style.width = `${marginWidth}px`;
				target.style.height = `${marginWidth}px`;
			}
		});
		return decoration;
	}

	private _createContextMenu(target: HTMLElement, command: ITerminalCommand): IDisposable {
		// When the xterm Decoration gets disposed of, its element gets removed from the dom
		// along with its listeners
		return dom.addDisposableListener(target, dom.EventType.CLICK, async () => {
			const actions = await this._getCommandActions(command);
			this._contextMenuService.showContextMenu({ getAnchor: () => target, getActions: () => actions });
		});
	}

	private _createHover(target: HTMLElement, command: ITerminalCommand): IDisposable[] {
		return [
			dom.addDisposableListener(target, dom.EventType.MOUSE_ENTER, () => {
				if (this._contextMenuVisible) {
					return;
				}
				this._hoverDelayer.trigger(() => {
					let hoverContent = `${localize('terminal-prompt-context-menu', "Show Actions")}...\n\n---\n\n- ${localize('terminal-prompt-command-executed-time', 'Executed: {0}', fromNow(command.timestamp, true))}`;
					if (command.exitCode) {
						hoverContent += `\n- ${command.exitCode === -1 ? localize('terminal-prompt-command-failed', 'Failed') : localize('terminal-prompt-command-exit-code', 'Exit code: {0}', command.exitCode)}`;
					}
					this._hoverService.showHover({ content: new MarkdownString(hoverContent), target });
				});
			}),
			dom.addDisposableListener(target, dom.EventType.MOUSE_LEAVE, () => this._hideHover()),
			dom.addDisposableListener(target, dom.EventType.MOUSE_OUT, () => this._hideHover())
		];
	}

	private _hideHover() {
		this._hoverDelayer.cancel();
		this._hoverService.hideHover();
	}

	private async _getCommandActions(command: ITerminalCommand): Promise<IAction[]> {
		const actions: IAction[] = [];
		if (command.hasOutput) {
			actions.push({
				class: 'copy-output', tooltip: 'Copy Output', dispose: () => { }, id: 'terminal.copyOutput', label: localize("terminal.copyOutput", 'Copy Output'), enabled: true,
				run: () => this._clipboardService.writeText(command.getOutput()!)
			});
		}
		actions.push({
			class: 'rerun-command', tooltip: 'Rerun Command', dispose: () => { }, id: 'terminal.rerunCommand', label: localize("terminal.rerunCommand", 'Re-run Command'), enabled: true,
			run: () => this._onDidRequestRunCommand.fire(command.command)
		});
		return actions;
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const commandDecorationDefaultColor = theme.getColor(TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR);
	collector.addRule(`.${DecorationSelector.CommandDecoration} { color: ${commandDecorationDefaultColor ? commandDecorationDefaultColor.toString() : ''}; } `);
	const commandDecorationErrorColor = theme.getColor(TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR);
	collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.ErrorColor} { color: ${commandDecorationErrorColor ? commandDecorationErrorColor.toString() : ''}; } `);
	const commandDecorationSkippedColor = theme.getColor(TERMINAL_COMMAND_DECORATION_SKIPPED_BACKGROUND_COLOR);
	collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.SkippedColor} { color: ${commandDecorationSkippedColor ? commandDecorationSkippedColor.toString() : ''}; } `);
	const toolbarHoverBackgroundColor = theme.getColor(toolbarHoverBackground);
	collector.addRule(`.${DecorationSelector.CommandDecoration}:not(.${DecorationSelector.SkippedColor}):hover { background-color: ${toolbarHoverBackgroundColor ? toolbarHoverBackgroundColor.toString() : ''}; }`);
});
