/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOM = require('vs/base/browser/dom');
import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import { Action, IAction } from 'vs/base/common/actions';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { IActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITerminalService, ITerminalFont, TERMINAL_PANEL_ID } from 'vs/workbench/parts/terminal/common/terminal';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { ansiColorIdentifiers } from './terminalColorRegistry';
import { ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { KillTerminalAction, CreateNewTerminalAction, SwitchTerminalInstanceAction, SwitchTerminalInstanceActionItem, CopyTerminalSelectionAction, TerminalPasteAction, ClearTerminalAction } from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import { Panel } from 'vs/workbench/browser/panel';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { TPromise } from 'vs/base/common/winjs.base';

export class TerminalPanel extends Panel {

	private _actions: IAction[];
	private _copyContextMenuAction: IAction;
	private _contextMenuActions: IAction[];
	private _cancelContextMenu: boolean = false;
	private _font: ITerminalFont;
	private _fontStyleElement: HTMLElement;
	private _parentDomElement: HTMLElement;
	private _terminalContainer: HTMLElement;
	private _themeStyleElement: HTMLElement;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService,
		@IContextMenuService private _contextMenuService: IContextMenuService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@ITerminalService private _terminalService: ITerminalService,
		@IThemeService protected themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(TERMINAL_PANEL_ID, telemetryService, themeService);
	}

	public create(parent: Builder): TPromise<any> {
		super.create(parent);
		this._parentDomElement = parent.getHTMLElement();
		DOM.addClass(this._parentDomElement, 'integrated-terminal');
		this._themeStyleElement = document.createElement('style');
		this._fontStyleElement = document.createElement('style');

		this._terminalContainer = document.createElement('div');
		DOM.addClass(this._terminalContainer, 'terminal-outer-container');
		this._parentDomElement.appendChild(this._themeStyleElement);
		this._parentDomElement.appendChild(this._fontStyleElement);
		this._parentDomElement.appendChild(this._terminalContainer);

		this._attachEventListeners();

		this._terminalService.setContainers(this.getContainer().getHTMLElement(), this._terminalContainer);

		this._register(this.themeService.onThemeChange(theme => this._updateTheme(theme)));
		this._register(this._configurationService.onDidUpdateConfiguration(() => this._updateFont()));
		this._updateFont();
		this._updateTheme();

		// Force another layout (first is setContainers) since config has changed
		this.layout(new Dimension(this._terminalContainer.offsetWidth, this._terminalContainer.offsetHeight));
		return TPromise.as(void 0);
	}

	public layout(dimension?: Dimension): void {
		if (!dimension) {
			return;
		}
		this._terminalService.terminalInstances.forEach((t) => {
			t.layout(dimension);
		});
	}

	public setVisible(visible: boolean): TPromise<void> {
		if (visible) {
			if (this._terminalService.terminalInstances.length > 0) {
				this._updateFont();
				this._updateTheme();
			} else {
				return super.setVisible(visible).then(() => {
					const instance = this._terminalService.createInstance();
					if (instance) {
						this._updateFont();
						this._updateTheme();
					}
					return TPromise.as(void 0);
				});
			}
		}
		return super.setVisible(visible);
	}

	public getActions(): IAction[] {
		if (!this._actions) {
			this._actions = [
				this._instantiationService.createInstance(SwitchTerminalInstanceAction, SwitchTerminalInstanceAction.ID, SwitchTerminalInstanceAction.LABEL),
				this._instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.PANEL_LABEL),
				this._instantiationService.createInstance(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.PANEL_LABEL)
			];
			this._actions.forEach(a => {
				this._register(a);
			});
		}
		return this._actions;
	}

	private _getContextMenuActions(): IAction[] {
		if (!this._contextMenuActions) {
			this._copyContextMenuAction = this._instantiationService.createInstance(CopyTerminalSelectionAction, CopyTerminalSelectionAction.ID, nls.localize('copy', "Copy"));
			this._contextMenuActions = [
				this._instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, nls.localize('createNewTerminal', "New Terminal")),
				new Separator(),
				this._copyContextMenuAction,
				this._instantiationService.createInstance(TerminalPasteAction, TerminalPasteAction.ID, nls.localize('paste', "Paste")),
				new Separator(),
				this._instantiationService.createInstance(ClearTerminalAction, ClearTerminalAction.ID, nls.localize('clear', "Clear"))
			];
			this._contextMenuActions.forEach(a => {
				this._register(a);
			});
		}
		this._copyContextMenuAction.enabled = document.activeElement.classList.contains('xterm') && window.getSelection().toString().length > 0;
		return this._contextMenuActions;
	}

	public getActionItem(action: Action): IActionItem {
		if (action.id === SwitchTerminalInstanceAction.ID) {
			return this._instantiationService.createInstance(SwitchTerminalInstanceActionItem, action);
		}

		return super.getActionItem(action);
	}

	public focus(): void {
		const activeInstance = this._terminalService.getActiveInstance();
		if (activeInstance) {
			activeInstance.focus(true);
		}
	}

	private _attachEventListeners(): void {
		this._register(DOM.addDisposableListener(window, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => this._refreshCtrlHeld(e)));
		this._register(DOM.addDisposableListener(window, DOM.EventType.KEY_UP, (e: KeyboardEvent) => this._refreshCtrlHeld(e)));
		this._register(DOM.addDisposableListener(window, DOM.EventType.FOCUS, (e: KeyboardEvent) => this._refreshCtrlHeld(e)));
		this._register(DOM.addDisposableListener(this._parentDomElement, 'mousedown', (event: MouseEvent) => {
			if (this._terminalService.terminalInstances.length === 0) {
				return;
			}

			if (event.which === 2 && platform.isLinux) {
				// Drop selection and focus terminal on Linux to enable middle button paste when click
				// occurs on the selection itself.
				this._terminalService.getActiveInstance().focus();
			} else if (event.which === 3) {
				if (this._terminalService.configHelper.config.rightClickCopyPaste) {
					let terminal = this._terminalService.getActiveInstance();
					if (terminal.hasSelection()) {
						terminal.copySelection();
						terminal.clearSelection();
					} else {
						terminal.paste();
					}
					this._cancelContextMenu = true;
				}
			}
		}));
		this._register(DOM.addDisposableListener(this._parentDomElement, 'contextmenu', (event: MouseEvent) => {
			if (!this._cancelContextMenu) {
				const standardEvent = new StandardMouseEvent(event);
				let anchor: { x: number, y: number } = { x: standardEvent.posx, y: standardEvent.posy };
				this._contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => TPromise.as(this._getContextMenuActions()),
					getActionsContext: () => this._parentDomElement,
					getKeyBinding: (action) => this._keybindingService.lookupKeybinding(action.id)
				});
			}
			this._cancelContextMenu = false;
		}));
		this._register(DOM.addDisposableListener(this._parentDomElement, 'click', (event) => {
			if (this._terminalService.terminalInstances.length === 0) {
				return;
			}

			if (event.which !== 3) {
				this._terminalService.getActiveInstance().focus();
			}
		}));
		this._register(DOM.addDisposableListener(this._parentDomElement, 'keyup', (event: KeyboardEvent) => {
			if (event.keyCode === 27) {
				// Keep terminal open on escape
				event.stopPropagation();
			}
		}));
	}

	private _refreshCtrlHeld(e: KeyboardEvent): void {
		this._parentDomElement.classList.toggle('ctrlcmd-held', platform.isMacintosh ? e.metaKey : e.ctrlKey);
	}

	private _updateTheme(theme?: ITheme): void {
		if (!theme) {
			theme = this.themeService.getTheme();
		}

		let css = '';
		ansiColorIdentifiers.forEach((colorId: ColorIdentifier, index: number) => {
			if (colorId) { // should not happen, all indices should have a color defined.
				let color = theme.getColor(colorId);
				let rgba = color.transparent(0.996);
				css += `.monaco-workbench .panel.integrated-terminal .xterm .xterm-color-${index} { color: ${color}; }` +
					`.monaco-workbench .panel.integrated-terminal .xterm .xterm-color-${index}::selection { background-color: ${rgba}; }` +
					`.monaco-workbench .panel.integrated-terminal .xterm .xterm-bg-color-${index} { background-color: ${color}; }` +
					`.monaco-workbench .panel.integrated-terminal .xterm .xterm-bg-color-${index}::selection { color: ${color}; }`;
			}
		});

		this._themeStyleElement.innerHTML = css;
	}

	private _updateFont(): void {
		if (this._terminalService.terminalInstances.length === 0) {
			return;
		}
		let newFont = this._terminalService.configHelper.getFont();
		DOM.toggleClass(this._parentDomElement, 'enable-ligatures', this._terminalService.configHelper.config.fontLigatures);
		DOM.toggleClass(this._parentDomElement, 'disable-bold', !this._terminalService.configHelper.config.enableBold);
		if (!this._font || this._fontsDiffer(this._font, newFont)) {
			this._fontStyleElement.innerHTML = '.monaco-workbench .panel.integrated-terminal .xterm {' +
				`font-family: ${newFont.fontFamily};` +
				`font-size: ${newFont.fontSize};` +
				`line-height: ${newFont.lineHeight};` +
				'}';
			this._font = newFont;
		}
		this.layout(new Dimension(this._parentDomElement.offsetWidth, this._parentDomElement.offsetHeight));
	}

	private _fontsDiffer(a: ITerminalFont, b: ITerminalFont): boolean {
		return a.charHeight !== b.charHeight ||
			a.charWidth !== b.charWidth ||
			a.fontFamily !== b.fontFamily ||
			a.fontSize !== b.fontSize ||
			a.lineHeight !== b.lineHeight;
	}
}
