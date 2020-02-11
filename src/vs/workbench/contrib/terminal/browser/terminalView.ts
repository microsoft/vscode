/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { Action, IAction } from 'vs/base/common/actions';
import { IActionViewItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, ITheme, registerThemingParticipant, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminal/browser/terminalFindWidget';
import { editorHoverBackground, editorHoverBorder, editorHoverForeground } from 'vs/platform/theme/common/colorRegistry';
import { KillTerminalAction, SwitchTerminalAction, SwitchTerminalActionViewItem, CopyTerminalSelectionAction, TerminalPasteAction, ClearTerminalAction, SelectAllTerminalAction, CreateNewTerminalAction, SplitTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { URI } from 'vs/base/common/uri';
import { TERMINAL_BACKGROUND_COLOR, TERMINAL_BORDER_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { DataTransfers } from 'vs/base/browser/dnd';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewDescriptorService } from 'vs/workbench/common/views';

const FIND_FOCUS_CLASS = 'find-focused';

export class TerminalViewPane extends ViewPane {
	private _actions: IAction[] | undefined;
	private _copyContextMenuAction: IAction | undefined;
	private _contextMenuActions: IAction[] | undefined;
	private _cancelContextMenu: boolean = false;
	private _fontStyleElement: HTMLElement | undefined;
	private _parentDomElement: HTMLElement | undefined;
	private _terminalContainer: HTMLElement | undefined;
	private _findWidget: TerminalFindWidget | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IThemeService protected readonly themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService storageService: IStorageService
	) {
		super(options, keybindingService, _contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instantiationService);
	}

	protected renderBody(container: HTMLElement): void {
		this._parentDomElement = container;
		dom.addClass(this._parentDomElement, 'integrated-terminal');
		this._fontStyleElement = document.createElement('style');

		this._terminalContainer = document.createElement('div');
		dom.addClass(this._terminalContainer, 'terminal-outer-container');

		this._findWidget = this._instantiationService.createInstance(TerminalFindWidget, this._terminalService.getFindState());
		this._findWidget.focusTracker.onDidFocus(() => this._terminalContainer!.classList.add(FIND_FOCUS_CLASS));

		this._parentDomElement.appendChild(this._fontStyleElement);
		this._parentDomElement.appendChild(this._terminalContainer);
		this._parentDomElement.appendChild(this._findWidget.getDomNode());

		this._attachEventListeners(this._parentDomElement, this._terminalContainer);

		this._terminalService.setContainers(container, this._terminalContainer);

		this._register(this.themeService.onThemeChange(theme => this._updateTheme(theme)));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated') || e.affectsConfiguration('editor.fontFamily')) {
				this._updateFont();
			}

			if (e.affectsConfiguration('terminal.integrated.fontFamily') || e.affectsConfiguration('editor.fontFamily')) {
				const configHelper = this._terminalService.configHelper;
				if (!configHelper.configFontIsMonospace()) {
					const choices: IPromptChoice[] = [{
						label: nls.localize('terminal.useMonospace', "Use 'monospace'"),
						run: () => this.configurationService.updateValue('terminal.integrated.fontFamily', 'monospace'),
					}];
					this._notificationService.prompt(Severity.Warning, nls.localize('terminal.monospaceOnly', "The terminal only supports monospace fonts. Be sure to restart VS Code if this is a newly installed font."), choices);
				}
			}
		}));
		this._updateFont();
		this._updateTheme();

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				const hadTerminals = this._terminalService.terminalInstances.length > 0;
				if (!hadTerminals) {
					this._terminalService.createTerminal();
				}
				this._updateFont();
				this._updateTheme();
				if (hadTerminals) {
					this._terminalService.getActiveTab()?.setVisible(visible);
				}
			}
		}));

		// Force another layout (first is setContainers) since config has changed
		this.layoutBody(this._terminalContainer.offsetWidth, this._terminalContainer.offsetHeight);
	}

	protected layoutBody(height: number, width: number): void {
		this._terminalService.terminalTabs.forEach(t => t.layout(width, height));
	}

	public getActions(): IAction[] {
		if (!this._actions) {
			this._actions = [
				this._instantiationService.createInstance(SwitchTerminalAction, SwitchTerminalAction.ID, SwitchTerminalAction.LABEL),
				this._instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.SHORT_LABEL),
				this._instantiationService.createInstance(SplitTerminalAction, SplitTerminalAction.ID, SplitTerminalAction.LABEL),
				this._instantiationService.createInstance(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.PANEL_LABEL)
			];
			this._actions.forEach(a => {
				this._register(a);
			});
		}
		return this._actions;
	}

	private _getContextMenuActions(): IAction[] {
		if (!this._contextMenuActions || !this._copyContextMenuAction) {
			this._copyContextMenuAction = this._instantiationService.createInstance(CopyTerminalSelectionAction, CopyTerminalSelectionAction.ID, CopyTerminalSelectionAction.SHORT_LABEL);

			const clipboardActions = [];
			if (BrowserFeatures.clipboard.writeText) {
				clipboardActions.push(this._copyContextMenuAction);
			}
			if (BrowserFeatures.clipboard.readText) {
				clipboardActions.push(this._instantiationService.createInstance(TerminalPasteAction, TerminalPasteAction.ID, TerminalPasteAction.SHORT_LABEL));
			}

			clipboardActions.push(this._instantiationService.createInstance(SelectAllTerminalAction, SelectAllTerminalAction.ID, SelectAllTerminalAction.LABEL));

			this._contextMenuActions = [
				this._instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.SHORT_LABEL),
				this._instantiationService.createInstance(SplitTerminalAction, SplitTerminalAction.ID, SplitTerminalAction.SHORT_LABEL),
				new Separator(),
				...clipboardActions,
				new Separator(),
				this._instantiationService.createInstance(ClearTerminalAction, ClearTerminalAction.ID, ClearTerminalAction.LABEL),
				new Separator(),
				this._instantiationService.createInstance(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.PANEL_LABEL)

			];
			this._contextMenuActions.forEach(a => {
				this._register(a);
			});
		}
		const activeInstance = this._terminalService.getActiveInstance();
		this._copyContextMenuAction.enabled = !!activeInstance && activeInstance.hasSelection();
		return this._contextMenuActions;
	}

	public getActionViewItem(action: Action): IActionViewItem | undefined {
		if (action.id === SwitchTerminalAction.ID) {
			return this._instantiationService.createInstance(SwitchTerminalActionViewItem, action);
		}

		return super.getActionViewItem(action);
	}

	public focus(): void {
		const activeInstance = this._terminalService.getActiveInstance();
		if (activeInstance) {
			activeInstance.focusWhenReady(true);
		}
	}

	public focusFindWidget() {
		const activeInstance = this._terminalService.getActiveInstance();
		if (activeInstance && activeInstance.hasSelection() && activeInstance.selection!.indexOf('\n') === -1) {
			this._findWidget!.reveal(activeInstance.selection);
		} else {
			this._findWidget!.reveal();
		}
	}

	public hideFindWidget() {
		this._findWidget!.hide();
	}

	public showFindWidget() {
		const activeInstance = this._terminalService.getActiveInstance();
		if (activeInstance && activeInstance.hasSelection() && activeInstance.selection!.indexOf('\n') === -1) {
			this._findWidget!.show(activeInstance.selection);
		} else {
			this._findWidget!.show();
		}
	}

	public getFindWidget(): TerminalFindWidget {
		return this._findWidget!;
	}

	private _attachEventListeners(parentDomElement: HTMLElement, terminalContainer: HTMLElement): void {
		this._register(dom.addDisposableListener(parentDomElement, 'mousedown', async (event: MouseEvent) => {
			if (this._terminalService.terminalInstances.length === 0) {
				return;
			}

			if (event.which === 2 && platform.isLinux) {
				// Drop selection and focus terminal on Linux to enable middle button paste when click
				// occurs on the selection itself.
				const terminal = this._terminalService.getActiveInstance();
				if (terminal) {
					terminal.focus();
				}
			} else if (event.which === 3) {
				const rightClickBehavior = this._terminalService.configHelper.config.rightClickBehavior;
				if (rightClickBehavior === 'copyPaste' || rightClickBehavior === 'paste') {
					const terminal = this._terminalService.getActiveInstance();
					if (!terminal) {
						return;
					}
					if (rightClickBehavior === 'copyPaste' && terminal.hasSelection()) {
						await terminal.copySelection();
						terminal.clearSelection();
					} else {
						terminal.paste();
					}
					// Clear selection after all click event bubbling is finished on Mac to prevent
					// right-click selecting a word which is seemed cannot be disabled. There is a
					// flicker when pasting but this appears to give the best experience if the
					// setting is enabled.
					if (platform.isMacintosh) {
						setTimeout(() => {
							terminal.clearSelection();
						}, 0);
					}
					this._cancelContextMenu = true;
				}
			}
		}));
		this._register(dom.addDisposableListener(parentDomElement, 'contextmenu', (event: MouseEvent) => {
			if (!this._cancelContextMenu) {
				const standardEvent = new StandardMouseEvent(event);
				const anchor: { x: number, y: number } = { x: standardEvent.posx, y: standardEvent.posy };
				this._contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => this._getContextMenuActions(),
					getActionsContext: () => this._parentDomElement
				});
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			this._cancelContextMenu = false;
		}));
		this._register(dom.addDisposableListener(document, 'keydown', (event: KeyboardEvent) => {
			terminalContainer.classList.toggle('alt-active', !!event.altKey);
		}));
		this._register(dom.addDisposableListener(document, 'keyup', (event: KeyboardEvent) => {
			terminalContainer.classList.toggle('alt-active', !!event.altKey);
		}));
		this._register(dom.addDisposableListener(parentDomElement, 'keyup', (event: KeyboardEvent) => {
			if (event.keyCode === 27) {
				// Keep terminal open on escape
				event.stopPropagation();
			}
		}));
		this._register(dom.addDisposableListener(parentDomElement, dom.EventType.DROP, async (e: DragEvent) => {
			if (e.target === this._parentDomElement || dom.isAncestor(e.target as HTMLElement, parentDomElement)) {
				if (!e.dataTransfer) {
					return;
				}

				// Check if files were dragged from the tree explorer
				let path: string | undefined;
				const resources = e.dataTransfer.getData(DataTransfers.RESOURCES);
				if (resources) {
					path = URI.parse(JSON.parse(resources)[0]).fsPath;
				} else if (e.dataTransfer.files.length > 0 && e.dataTransfer.files[0].path /* Electron only */) {
					// Check if the file was dragged from the filesystem
					path = URI.file(e.dataTransfer.files[0].path).fsPath;
				}

				if (!path) {
					return;
				}

				const terminal = this._terminalService.getActiveInstance();
				if (terminal) {
					return this._terminalService.preparePathForTerminalAsync(path, terminal.shellLaunchConfig.executable, terminal.title, terminal.shellType).then(preparedPath => {
						terminal.sendText(preparedPath, false);
					});
				}
			}
		}));
	}

	private _updateTheme(theme?: ITheme): void {
		if (!theme) {
			theme = this.themeService.getTheme();
		}

		if (this._findWidget) {
			this._findWidget.updateTheme(theme);
		}
	}

	private _updateFont(): void {
		if (this._terminalService.terminalInstances.length === 0 || !this._parentDomElement) {
			return;
		}
		// TODO: Can we support ligatures?
		// dom.toggleClass(this._parentDomElement, 'enable-ligatures', this._terminalService.configHelper.config.fontLigatures);
		this.layoutBody(this._parentDomElement.offsetWidth, this._parentDomElement.offsetHeight);
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const backgroundColor = theme.getColor(TERMINAL_BACKGROUND_COLOR);
	collector.addRule(`.monaco-workbench .pane-body.integrated-terminal .terminal-outer-container { background-color: ${backgroundColor ? backgroundColor.toString() : ''}; }`);

	const borderColor = theme.getColor(TERMINAL_BORDER_COLOR);
	if (borderColor) {
		collector.addRule(`.monaco-workbench .pane-body.integrated-terminal .split-view-view:not(:first-child) { border-color: ${borderColor.toString()}; }`);
	}

	// Borrow the editor's hover background for now
	const hoverBackground = theme.getColor(editorHoverBackground);
	if (hoverBackground) {
		collector.addRule(`.monaco-workbench .pane-body.integrated-terminal .terminal-message-widget { background-color: ${hoverBackground}; }`);
	}
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-workbench .pane-body.integrated-terminal .terminal-message-widget { border: 1px solid ${hoverBorder}; }`);
	}
	const hoverForeground = theme.getColor(editorHoverForeground);
	if (hoverForeground) {
		collector.addRule(`.monaco-workbench .pane-body.integrated-terminal .terminal-message-widget { color: ${hoverForeground}; }`);
	}
});
