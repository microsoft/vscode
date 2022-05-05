/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { IDecoration, ITerminalAddon, Terminal } from 'xterm';
import * as dom from 'vs/base/browser/dom';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IColorTheme, ICssStyleCollector, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
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
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { Color } from 'vs/base/common/color';
import { IOpenerService } from 'vs/platform/opener/common/opener';

const enum DecorationSelector {
	CommandDecoration = 'terminal-command-decoration',
	ErrorColor = 'error',
	DefaultColor = 'default',
	Codicon = 'codicon',
	XtermDecoration = 'xterm-decoration',
	OverviewRuler = 'xterm-decoration-overview-ruler'
}

const enum DecorationStyles {
	DefaultDimension = 16,
	MarginLeft = -17,
}

interface IDisposableDecoration { decoration: IDecoration; disposables: IDisposable[]; exitCode?: number }

export class DecorationAddon extends Disposable implements ITerminalAddon {
	protected _terminal: Terminal | undefined;
	private _hoverDelayer: Delayer<void>;
	private _commandStartedListener: IDisposable | undefined;
	private _commandFinishedListener: IDisposable | undefined;
	private _contextMenuVisible: boolean = false;
	private _decorations: Map<number, IDisposableDecoration> = new Map();
	private _placeholderDecoration: IDecoration | undefined;

	private readonly _onDidRequestRunCommand = this._register(new Emitter<{ command: ITerminalCommand; copyAsHtml?: boolean }>());
	readonly onDidRequestRunCommand = this._onDidRequestRunCommand.event;

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		super();
		this._register(toDisposable(() => this.clearDecorations(true)));
		this._register(this._contextMenuService.onDidShowContextMenu(() => this._contextMenuVisible = true));
		this._register(this._contextMenuService.onDidHideContextMenu(() => this._contextMenuVisible = false));
		this._hoverDelayer = this._register(new Delayer(this._configurationService.getValue('workbench.hover.delay')));

		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationIcon) ||
				e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationIconSuccess) ||
				e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationIconError)) {
				this._refreshStyles();
			} else if (e.affectsConfiguration(TerminalSettingId.FontSize) || e.affectsConfiguration(TerminalSettingId.LineHeight)) {
				this.refreshLayouts();
			} else if (e.affectsConfiguration('workbench.colorCustomizations')) {
				this._refreshStyles(true);
			}
		});
		this._themeService.onDidColorThemeChange(() => this._refreshStyles(true));
	}

	public refreshLayouts(): void {
		this._updateLayout(this._placeholderDecoration?.element);
		for (const decoration of this._decorations) {
			this._updateLayout(decoration[1].decoration.element);
		}
	}

	private _refreshStyles(refreshOverviewRulerColors?: boolean): void {
		if (refreshOverviewRulerColors) {
			for (const decoration of this._decorations.values()) {
				let color = decoration.exitCode === undefined ? defaultColor : decoration.exitCode ? errorColor : successColor;
				if (color && typeof color !== 'string') {
					color = color.toString();
				} else {
					color = '';
				}
				if (decoration.decoration.options?.overviewRulerOptions) {
					decoration.decoration.options.overviewRulerOptions.color = color;
				} else if (decoration.decoration.options) {
					decoration.decoration.options.overviewRulerOptions = { color };
				}
			}
		}
		this._updateClasses(this._placeholderDecoration?.element);
		for (const decoration of this._decorations.values()) {
			this._updateClasses(decoration.decoration.element, decoration.exitCode);
		}
	}

	public clearDecorations(disableDecorations?: boolean): void {
		if (disableDecorations) {
			this._commandStartedListener?.dispose();
			this._commandFinishedListener?.dispose();
		}
		this._placeholderDecoration?.dispose();
		this._placeholderDecoration?.marker.dispose();
		for (const value of this._decorations.values()) {
			value.decoration.dispose();
			dispose(value.disposables);
		}
		this._decorations.clear();
	}

	private _attachToCommandCapability(): void {
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			this._addCommandFinishedListener();
			this._addCommandStartedListener();
		} else {
			this._register(this._capabilities.onDidAddCapability(c => {
				if (c === TerminalCapability.CommandDetection) {
					this._addCommandFinishedListener();
					this._addCommandStartedListener();
				}
			}));
		}
		this._register(this._capabilities.onDidRemoveCapability(c => {
			if (c === TerminalCapability.CommandDetection) {
				this._commandStartedListener?.dispose();
				this._commandFinishedListener?.dispose();
			}
		}));
	}

	private _addCommandStartedListener(): void {
		if (this._commandStartedListener) {
			return;
		}
		const capability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!capability) {
			return;
		}
		if (capability.executingCommandObject?.marker) {
			this.registerCommandDecoration(capability.executingCommandObject, true);
		}
		this._commandStartedListener = capability.onCommandStarted(command => this.registerCommandDecoration(command, true));
	}


	private _addCommandFinishedListener(): void {
		if (this._commandFinishedListener) {
			return;
		}
		const capability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!capability) {
			return;
		}
		for (const command of capability.commands) {
			this.registerCommandDecoration(command);
		}
		this._commandFinishedListener = capability.onCommandFinished(command => {
			if (command.command.trim().toLowerCase() === 'clear' || command.command.trim().toLowerCase() === 'cls') {
				this.clearDecorations();
				return;
			}
			this.registerCommandDecoration(command);
		});
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._attachToCommandCapability();
	}

	registerCommandDecoration(command: ITerminalCommand, beforeCommandExecution?: boolean): IDecoration | undefined {
		if (!this._terminal) {
			return undefined;
		}
		if (!command.marker) {
			throw new Error(`cannot add a decoration for a command ${JSON.stringify(command)} with no marker`);
		}

		this._placeholderDecoration?.dispose();
		let color = command.exitCode === undefined ? defaultColor : command.exitCode ? errorColor : successColor;
		if (color && typeof color !== 'string') {
			color = color.toString();
		} else {
			color = '';
		}
		const decoration = this._terminal.registerDecoration({
			marker: command.marker,
			overviewRulerOptions: beforeCommandExecution ? undefined : { color, position: command.exitCode ? 'right' : 'left' }
		});
		if (!decoration) {
			return undefined;
		}

		decoration.onRender(element => {
			if (element.classList.contains(DecorationSelector.OverviewRuler)) {
				return;
			}
			if (beforeCommandExecution && !this._placeholderDecoration) {
				this._placeholderDecoration = decoration;
				this._placeholderDecoration.onDispose(() => this._placeholderDecoration = undefined);
			} else {
				decoration.onDispose(() => this._decorations.delete(decoration.marker.id));
				this._decorations.set(decoration.marker.id,
					{
						decoration,
						disposables: command.exitCode === undefined ? [] : [this._createContextMenu(element, command), ...this._createHover(element, command)],
						exitCode: command.exitCode
					});
			}
			if (!element.classList.contains(DecorationSelector.Codicon) || command.marker?.line === 0) {
				// first render or buffer was cleared
				this._updateLayout(element);
				this._updateClasses(element, command.exitCode);
			}
		});
		return decoration;
	}

	private _updateLayout(element?: HTMLElement): void {
		if (!element) {
			return;
		}
		const fontSize = this._configurationService.inspect(TerminalSettingId.FontSize).value;
		const defaultFontSize = this._configurationService.inspect(TerminalSettingId.FontSize).defaultValue;
		const lineHeight = this._configurationService.inspect(TerminalSettingId.LineHeight).value;
		if (typeof fontSize === 'number' && typeof defaultFontSize === 'number' && typeof lineHeight === 'number') {
			const scalar = (fontSize / defaultFontSize) <= 1 ? (fontSize / defaultFontSize) : 1;
			// must be inlined to override the inlined styles from xterm
			element.style.width = `${scalar * DecorationStyles.DefaultDimension}px`;
			element.style.height = `${scalar * DecorationStyles.DefaultDimension * lineHeight}px`;
			element.style.fontSize = `${scalar * DecorationStyles.DefaultDimension}px`;
			element.style.marginLeft = `${scalar * DecorationStyles.MarginLeft}px`;
		}
	}

	private _updateClasses(element?: HTMLElement, exitCode?: number): void {
		if (!element) {
			return;
		}
		for (const classes of element.classList) {
			element.classList.remove(classes);
		}
		element.classList.add(DecorationSelector.CommandDecoration, DecorationSelector.Codicon, DecorationSelector.XtermDecoration);
		if (exitCode === undefined) {
			element.classList.add(DecorationSelector.DefaultColor);
			element.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationIcon)}`);
		} else if (exitCode) {
			element.classList.add(DecorationSelector.ErrorColor);
			element.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationIconError)}`);
		} else {
			element.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationIconSuccess)}`);
		}
	}

	private _createContextMenu(element: HTMLElement, command: ITerminalCommand): IDisposable {
		// When the xterm Decoration gets disposed of, its element gets removed from the dom
		// along with its listeners
		return dom.addDisposableListener(element, dom.EventType.CLICK, async () => {
			this._hideHover();
			const actions = await this._getCommandActions(command);
			this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => actions });
		});
	}

	private _createHover(element: HTMLElement, command: ITerminalCommand): IDisposable[] {
		return [
			dom.addDisposableListener(element, dom.EventType.MOUSE_ENTER, () => {
				if (this._contextMenuVisible) {
					return;
				}
				this._hoverDelayer.trigger(() => {
					let hoverContent = `${localize('terminalPromptContextMenu', "Show Command Actions")}...`;
					hoverContent += '\n\n---\n\n';
					if (command.exitCode) {
						if (command.exitCode === -1) {
							hoverContent += localize('terminalPromptCommandFailed', 'Command executed {0} and failed', fromNow(command.timestamp, true));
						} else {
							hoverContent += localize('terminalPromptCommandFailedWithExitCode', 'Command executed {0} and failed (Exit Code {1})', fromNow(command.timestamp, true), command.exitCode);
						}
					} else {
						hoverContent += localize('terminalPromptCommandSuccess', 'Command executed {0}', fromNow(command.timestamp, true));
					}
					this._hoverService.showHover({ content: new MarkdownString(hoverContent), target: element });
				});
			}),
			dom.addDisposableListener(element, dom.EventType.MOUSE_LEAVE, () => this._hideHover()),
			dom.addDisposableListener(element, dom.EventType.MOUSE_OUT, () => this._hideHover())
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
			actions.push({
				class: 'copy-output', tooltip: 'Copy Output as HTML', dispose: () => { }, id: 'terminal.copyOutputAsHtml', label: localize("terminal.copyOutputAsHtml", 'Copy Output as HTML'), enabled: true,
				run: () => this._onDidRequestRunCommand.fire({ command, copyAsHtml: true })
			});
		}
		actions.push({
			class: 'rerun-command', tooltip: 'Rerun Command', dispose: () => { }, id: 'terminal.rerunCommand', label: localize("terminal.rerunCommand", 'Rerun Command'), enabled: true,
			run: () => this._onDidRequestRunCommand.fire({ command })
		});
		actions.push({
			class: 'how-does-this-work', tooltip: 'How does this work?', dispose: () => { }, id: 'terminal.howDoesThisWork', label: localize("terminal.howDoesThisWork", 'How does this work?'), enabled: true,
			run: () => this._openerService.open('https://code.visualstudio.com/docs/editor/integrated-terminal#_shell-integration')
		});
		return actions;
	}
}
let successColor: string | Color | undefined;
let errorColor: string | Color | undefined;
let defaultColor: string | Color | undefined;
registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	successColor = theme.getColor(TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR);
	errorColor = theme.getColor(TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR);
	defaultColor = theme.getColor(TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR);
	const hoverBackgroundColor = theme.getColor(toolbarHoverBackground);

	if (successColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration} { color: ${successColor.toString()}; } `);
	}
	if (errorColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.ErrorColor} { color: ${errorColor.toString()}; } `);
	}
	if (defaultColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.DefaultColor} { color: ${defaultColor.toString()};} `);
	}
	if (hoverBackgroundColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}:not(.${DecorationSelector.DefaultColor}):hover { background-color: ${hoverBackgroundColor.toString()}; }`);
	}
});
