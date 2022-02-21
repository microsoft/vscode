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
import { editorGutterDeletedBackground, editorGutterModifiedBackground } from 'vs/workbench/contrib/scm/browser/dirtydiffDecorator';
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';

const enum DecorationSelector {
	CommandDecoration = 'terminal-command-decoration',
	ErrorColor = 'error',
	DefaultColor = 'default',
	Codicon = 'codicon',
	XtermScreen = 'xterm-screen'
}

interface IDisposableDecoration { decoration: IDecoration; disposables: IDisposable[] }

export class DecorationAddon extends Disposable implements ITerminalAddon {
	protected _terminal: Terminal | undefined;
	private _hoverDelayer: Delayer<void>;
	private _commandStartedListener: IDisposable | undefined;
	private _commandFinishedListener: IDisposable | undefined;
	private _contextMenuVisible: boolean = false;
	private _decorations: Map<number, IDisposableDecoration> = new Map();
	private _placeholderDecoration: IDecoration | undefined;

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
				this._commandStartedListener?.dispose();
				this._commandFinishedListener?.dispose();
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
			this._addCommandFinishedListener();
		} else {
			this._register(this._capabilities.onDidAddCapability(c => {
				if (c === TerminalCapability.CommandDetection) {
					this._addCommandStartedListener();
					this._addCommandFinishedListener();
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
		this._commandStartedListener = capability.onCommandStarted(command => this.registerCommandDecoration(command));
	}


	private _addCommandFinishedListener(): void {
		if (this._commandFinishedListener) {
			return;
		}
		const capability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!capability) {
			return;
		}
		this._commandFinishedListener = capability.onCommandFinished(command => {
			this._placeholderDecoration?.dispose();
			this.registerCommandDecoration(command);
		});
	}

	activate(terminal: Terminal): void { this._terminal = terminal; }

	registerCommandDecoration(command: ITerminalCommand, beforeCommandExecution?: boolean): IDecoration | undefined {
		if (!this._terminal) {
			return undefined;
		}
		if (!command.marker) {
			throw new Error(`cannot add a decoration for a command ${JSON.stringify(command)} with no marker`);
		}
		if (beforeCommandExecution) {
			const decoration = this._terminal.registerDecoration({ marker: command.marker });
			if (!decoration) {
				return undefined;
			}
			decoration.onRender(target => {
				this._applyStyles(target);
				target.classList.add(DecorationSelector.DefaultColor);
			});
			this._placeholderDecoration = decoration;
			return decoration;
		}

		const decoration = this._terminal.registerDecoration({ marker: command.marker });
		if (!decoration) {
			return undefined;
		}

		decoration.onRender(target => {
			if (target && !this._decorations.get(decoration.marker.id)) {
				const disposables = command.exitCode === undefined ? [] : [this._createContextMenu(target, command), ...this._createHover(target, command)];
				this._decorations.set(decoration.marker.id, { decoration, disposables });
			}
			if (target.clientWidth! > 0) {
				this._applyStyles(target);
				if (command.exitCode === undefined) {
					target.classList.add(DecorationSelector.DefaultColor);
					target.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationCommandIconDefault)}`);
				} else if (command.exitCode) {
					target.classList.add(DecorationSelector.ErrorColor);
					target.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationCommandIconError)}`);
				} else {
					target.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationCommandIcon)}`);
				}
			}
		});
		return decoration;
	}

	private _applyStyles(target: HTMLElement): void {
		target.classList.add(DecorationSelector.CommandDecoration);
		target.classList.add(DecorationSelector.Codicon);
		// must be inlined to override the inlined styles from xterm
		target.style.width = '16px';
		target.style.height = '16px';
	}

	private _createContextMenu(target: HTMLElement, command: ITerminalCommand): IDisposable {
		// When the xterm Decoration gets disposed of, its element gets removed from the dom
		// along with its listeners
		return dom.addDisposableListener(target, dom.EventType.CLICK, async () => {
			this._hideHover();
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
	const successColor = theme.getColor(editorGutterModifiedBackground);
	const errorColor = theme.getColor(editorGutterDeletedBackground);
	const defaultColor = theme.getColor(TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR);
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
