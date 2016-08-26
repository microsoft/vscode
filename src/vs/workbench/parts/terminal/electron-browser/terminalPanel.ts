/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOM = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import {Action, IAction} from 'vs/base/common/actions';
import {Builder, Dimension} from 'vs/base/browser/builder';
import {getBaseThemeId} from 'vs/platform/theme/common/themes';
import {IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IContextKey} from 'vs/platform/contextkey/common/contextkey';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ITerminalFont, TerminalConfigHelper} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import {ITerminalPanel, ITerminalProcess, ITerminalService, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {KillTerminalAction, CreateNewTerminalAction, SwitchTerminalInstanceAction, SwitchTerminalInstanceActionItem, CopyTerminalSelectionAction, TerminalPasteAction} from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import {Panel} from 'vs/workbench/browser/panel';
import {Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {TerminalInstance} from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import {TPromise} from 'vs/base/common/winjs.base';

export class TerminalPanel extends Panel implements ITerminalPanel {

	private toDispose: lifecycle.IDisposable[] = [];
	private terminalInstances: TerminalInstance[] = [];

	private actions: IAction[];
	private contextMenuActions: IAction[];
	private parentDomElement: HTMLElement;
	private terminalContainer: HTMLElement;
	private currentBaseThemeId: string;
	private themeStyleElement: HTMLElement;
	private fontStyleElement: HTMLElement;
	private font: ITerminalFont;
	private configurationHelper: TerminalConfigHelper;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITerminalService private terminalService: ITerminalService,
		@IThemeService private themeService: IThemeService,
		@IMessageService private messageService: IMessageService
	) {
		super(TERMINAL_PANEL_ID, telemetryService);
	}

	public layout(dimension?: Dimension): void {
		if (!dimension) {
			return;
		}
		this.terminalInstances.forEach((t) => {
			t.layout(dimension);
		});
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(SwitchTerminalInstanceAction, SwitchTerminalInstanceAction.ID, SwitchTerminalInstanceAction.LABEL),
				this.instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.PANEL_LABEL),
				this.instantiationService.createInstance(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.PANEL_LABEL)
			];
			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}
		return this.actions;
	}

	private getContextMenuActions(): IAction[] {
		if (!this.contextMenuActions) {
			this.contextMenuActions = [
				this.instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, nls.localize('createNewTerminal', "New Terminal")),
				new Separator(),
				this.instantiationService.createInstance(CopyTerminalSelectionAction, CopyTerminalSelectionAction.ID, nls.localize('copy', "Copy")),
				this.instantiationService.createInstance(TerminalPasteAction, TerminalPasteAction.ID, nls.localize('paste', "Paste"))
			];
			this.contextMenuActions.forEach(a => {
				this.toDispose.push(a);
			});
		}
		return this.contextMenuActions;
	}

	public getActionItem(action: Action): IActionItem {
		if (action.id === SwitchTerminalInstanceAction.ID) {
			return this.instantiationService.createInstance(SwitchTerminalInstanceActionItem, action);
		}

		return super.getActionItem(action);
	}

	public create(parent: Builder): TPromise<any> {
		super.create(parent);
		this.parentDomElement = parent.getHTMLElement();
		this.terminalService.initConfigHelper(parent);
		DOM.addClass(this.parentDomElement, 'integrated-terminal');
		this.themeStyleElement = document.createElement('style');
		this.fontStyleElement = document.createElement('style');

		this.terminalContainer = document.createElement('div');
		DOM.addClass(this.terminalContainer, 'terminal-outer-container');
		this.parentDomElement.appendChild(this.themeStyleElement);
		this.parentDomElement.appendChild(this.fontStyleElement);
		this.parentDomElement.appendChild(this.terminalContainer);

		this.attachEventListeners();

		this.configurationHelper = new TerminalConfigHelper(platform.platform, this.configurationService, parent);

		return TPromise.as(void 0);
	}

	private attachEventListeners(): void {
		this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'mousedown', (event: MouseEvent) => {
			if (this.terminalInstances.length === 0) {
				return;
			}

			if (event.which === 2 && platform.isLinux) {
				// Drop selection and focus terminal on Linux to enable middle button paste when click
				// occurs on the selection itself.
				this.terminalInstances[this.terminalService.getActiveTerminalIndex()].focus(true);
			} else if (event.which === 3) {
				// Trigger the context menu on right click
				let anchor: HTMLElement | { x: number, y: number } = this.parentDomElement;
				if (event instanceof MouseEvent) {
					const standardEvent = new StandardMouseEvent(event);
					anchor = { x: standardEvent.posx, y: standardEvent.posy };
				}

				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => TPromise.as(this.getContextMenuActions()),
					getActionsContext: () => this.parentDomElement,
					getKeyBinding: (action) => {
						const opts = this.keybindingService.lookupKeybindings(action.id);
						if (opts.length > 0) {
							return opts[0]; // only take the first one
						}
						return null;
					}
				});
			}
		}));
		this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'mouseup', (event) => {
			if (this.terminalInstances.length === 0) {
				return;
			}

			if (event.which !== 3) {
				this.terminalInstances[this.terminalService.getActiveTerminalIndex()].focus();
			}
		}));
		this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'keyup', (event: KeyboardEvent) => {
			if (event.keyCode === 27) {
				// Keep terminal open on escape
				event.stopPropagation();
			}
		}));
	}

	public createNewTerminalInstance(process: ITerminalProcess, focusContextKey: IContextKey<boolean>): TPromise<number> {
		return this.createTerminal(process, focusContextKey).then((terminalInstance) => {
			this.updateConfig();
			this.focus();
			return TPromise.as(terminalInstance.id);
		});
	}

	public closeActiveTerminal(): TPromise<void> {
		return this.closeTerminal(this.terminalService.getActiveTerminalIndex());
	}

	public closeTerminal(index: number): TPromise<void> {
		this.onTerminalInstanceExit(this.terminalInstances[index]);
		return TPromise.as(void 0);
	}

	public closeTerminalById(terminalId: number): TPromise<void> {
		return this.closeTerminal(this.getTerminalIndexFromId(terminalId));
	}

	public setVisible(visible: boolean): TPromise<void> {
		if (visible) {
			if (this.terminalInstances.length > 0) {
				this.updateConfig();
				this.updateTheme();
			} else {
				return super.setVisible(visible).then(() => {
					this.terminalService.createNew();
				});
			}
		}
		return super.setVisible(visible);
	}

	public sendTextToActiveTerminal(text: string, addNewLine: boolean): void {
		let terminalInstance = this.terminalInstances[this.terminalService.getActiveTerminalIndex()];
		terminalInstance.sendText(text, addNewLine);
	}

	private createTerminal(terminalProcess: ITerminalProcess, terminalFocusContextKey: IContextKey<boolean>): TPromise<TerminalInstance> {
		return new TPromise<TerminalInstance>(resolve => {
			var terminalInstance = new TerminalInstance(
				terminalProcess,
				this.terminalContainer,
				this.contextMenuService,
				this.contextService,
				this.instantiationService,
				this.keybindingService,
				this.terminalService,
				this.messageService,
				terminalFocusContextKey,
				this.onTerminalInstanceExit.bind(this));
			this.terminalInstances.push(terminalInstance);
			this.setActiveTerminal(this.terminalInstances.length - 1);
			this.toDispose.push(this.themeService.onDidColorThemeChange(this.updateTheme.bind(this)));
			this.toDispose.push(this.configurationService.onDidUpdateConfiguration(this.updateConfig.bind(this)));
			this.updateTheme();
			this.updateConfig();
			resolve(terminalInstance);
		});
	}

	public setActiveTerminal(newActiveIndex: number): void {
		this.terminalInstances.forEach((terminalInstance, i) => {
			terminalInstance.toggleVisibility(i === newActiveIndex);
		});
	}

	private getTerminalIndexFromId(terminalId: number): number {
		let terminalIndex = -1;
		this.terminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.id === terminalId) {
				terminalIndex = i;
			}
		});
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	private onTerminalInstanceExit(terminalInstance: TerminalInstance): void {
		let index = this.terminalInstances.indexOf(terminalInstance);
		if (index !== -1) {
			this.terminalInstances[index].dispose();
			this.terminalInstances.splice(index, 1);
		}
		if (this.terminalInstances.length > 0) {
			this.setActiveTerminal(this.terminalService.getActiveTerminalIndex());
		}
		if (this.terminalInstances.length === 0) {
			this.terminalService.hide();
		} else {
			this.terminalService.show(true);
		}
	}

	private updateTheme(themeId?: string): void {
		if (!themeId) {
			themeId = this.themeService.getColorTheme();
		}

		let baseThemeId = getBaseThemeId(themeId);
		if (baseThemeId === this.currentBaseThemeId) {
			return;
		}
		this.currentBaseThemeId = baseThemeId;

		let theme = this.configurationHelper.getTheme(baseThemeId);

		let css = '';
		theme.forEach((color: string, index: number) => {
			let rgba = this.convertHexCssColorToRgba(color, 0.996);
			css += `.monaco-workbench .panel.integrated-terminal .xterm .xterm-color-${index} { color: ${color}; }` +
				`.monaco-workbench .panel.integrated-terminal .xterm .xterm-color-${index}::selection { background-color: ${rgba}; }` +
				`.monaco-workbench .panel.integrated-terminal .xterm .xterm-bg-color-${index} { background-color: ${color}; }` +
				`.monaco-workbench .panel.integrated-terminal .xterm .xterm-bg-color-${index}::selection { color: ${color}; }`;
		});

		this.themeStyleElement.innerHTML = css;
	}

	public scrollDown(): void {
		this.terminalInstances[this.terminalService.getActiveTerminalIndex()].scrollDown();
	}

	public scrollUp(): void {
		this.terminalInstances[this.terminalService.getActiveTerminalIndex()].scrollUp();
	}

	/**
	 * Converts a CSS hex color (#rrggbb) to a CSS rgba color (rgba(r, g, b, a)).
	 */
	private convertHexCssColorToRgba(hex: string, alpha: number): string {
		let r = parseInt(hex.substr(1, 2), 16);
		let g = parseInt(hex.substr(3, 2), 16);
		let b = parseInt(hex.substr(5, 2), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	private updateConfig(): void {
		this.updateFont();
		this.updateCursorBlink();
		this.updateCommandsToSkipShell();
	}

	private updateFont(): void {
		if (this.terminalInstances.length === 0) {
			return;
		}
		let newFont = this.configurationHelper.getFont();
		DOM.toggleClass(this.parentDomElement, 'enable-ligatures', this.configurationHelper.getFontLigaturesEnabled());
		if (!this.font || this.fontsDiffer(this.font, newFont)) {
			this.fontStyleElement.innerHTML = '.monaco-workbench .panel.integrated-terminal .xterm {' +
				`font-family: ${newFont.fontFamily};` +
				`font-weight: ${newFont.fontWeight};` +
				`font-size: ${newFont.fontSize};` +
				`line-height: ${newFont.lineHeight};` +
				'}';
			this.font = newFont;
		}
		this.terminalInstances[this.terminalService.getActiveTerminalIndex()].setFont(newFont);
		this.layout(new Dimension(this.parentDomElement.offsetWidth, this.parentDomElement.offsetHeight));
	}

	private fontsDiffer(a: ITerminalFont, b: ITerminalFont): boolean {
		return a.charHeight !== b.charHeight ||
			a.charWidth !== b.charWidth ||
			a.fontFamily !== b.fontFamily ||
			a.fontWeight !== b.fontWeight ||
			a.fontSize !== b.fontSize ||
			a.lineHeight !== b.lineHeight;
	}

	private updateCursorBlink(): void {
		this.terminalInstances.forEach((instance) => {
			instance.setCursorBlink(this.configurationHelper.getCursorBlink());
		});
	}

	private updateCommandsToSkipShell(): void {
		this.terminalInstances.forEach((instance) => {
			instance.setCommandsToSkipShell(this.configurationHelper.getCommandsToSkipShell());
		});
	}

	public focus(): void {
		let activeIndex = this.terminalService.getActiveTerminalIndex();
		if (activeIndex !== -1 && this.terminalInstances.length > 0) {
			this.terminalInstances[activeIndex].focus(true);
		}
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		while (this.terminalInstances.length > 0) {
			this.terminalInstances.pop().dispose();
		}
		super.dispose();
	}
}
