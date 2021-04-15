/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LayoutPriority, Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalService, TerminalConnectionState } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminal/browser/terminalFindWidget';
import { TerminalTabsWidget } from 'vs/workbench/contrib/terminal/browser/terminalTabsWidget';
import { IThemeService, IColorTheme } from 'vs/platform/theme/common/themeService';
import * as nls from 'vs/nls';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import * as dom from 'vs/base/browser/dom';
import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { DataTransfers } from 'vs/base/browser/dnd';
import { URI } from 'vs/base/common/uri';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IAction } from 'vs/base/common/actions';
import { IMenu, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { KEYBINDING_CONTEXT_TERMINAL_FIND_VISIBLE, TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Codicon } from 'vs/base/common/codicons';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';

const $ = dom.$;

const FIND_FOCUS_CLASS = 'find-focused';
const TABS_WIDGET_WIDTH_KEY = 'tabs-widget-width';
const MIN_TABS_WIDGET_WIDTH = 46;
const DEFAULT_TABS_WIDGET_WIDTH = 124;
const MIDPOINT_WIDGET_WIDTH = (MIN_TABS_WIDGET_WIDTH + DEFAULT_TABS_WIDGET_WIDTH) / 2;

export class TerminalTabbedView extends Disposable {

	private _splitView: SplitView;

	private _terminalContainer: HTMLElement;
	private _terminalTabTree: HTMLElement;
	private _parentElement: HTMLElement;
	private _tabTreeContainer: HTMLElement;

	private _tabsWidget: TerminalTabsWidget;
	private _findWidget: TerminalFindWidget;

	private _plusButton: HTMLElement | undefined;

	private _tabTreeIndex: number;
	private _terminalContainerIndex: number;

	private _showTabs: boolean;
	private _findWidgetVisible: IContextKey<boolean>;

	private _height: number | undefined;
	private _width: number | undefined;

	private _cancelContextMenu: boolean = false;
	private _instanceMenu: IMenu;
	// private _dropdownMenu: IMenu;

	constructor(
		parentElement: HTMLElement,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		this._parentElement = parentElement;

		this._tabTreeContainer = $('.tabs-container');
		const tabWidgetContainer = $('.tabs-widget-container');
		this._terminalTabTree = $('.tabs-widget');
		tabWidgetContainer.appendChild(this._terminalTabTree);
		this._tabTreeContainer.appendChild(tabWidgetContainer);

		this._instanceMenu = this._register(menuService.createMenu(MenuId.TerminalContext, contextKeyService));
		// this._dropdownMenu = this._register(menuService.createMenu(MenuId.TerminalTabsContext, contextKeyService));

		this._tabsWidget = this._instantiationService.createInstance(TerminalTabsWidget, this._terminalTabTree);
		this._findWidget = this._instantiationService.createInstance(TerminalFindWidget, this._terminalService.getFindState());
		parentElement.appendChild(this._findWidget.getDomNode());

		this._terminalContainer = document.createElement('div');
		this._terminalContainer.classList.add('terminal-outer-container');
		this._terminalContainer.style.display = 'block';

		this._showTabs = this._terminalService.configHelper.config.showTabs;

		this._tabTreeIndex = this._terminalService.configHelper.config.tabsLocation === 'left' ? 0 : 1;
		this._terminalContainerIndex = this._terminalService.configHelper.config.tabsLocation === 'left' ? 1 : 0;

		this._findWidgetVisible = KEYBINDING_CONTEXT_TERMINAL_FIND_VISIBLE.bindTo(contextKeyService);

		this._terminalService.setContainers(parentElement, this._terminalContainer);

		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated.showTabs')) {
				this._showTabs = this._terminalService.configHelper.config.showTabs;
				if (this._showTabs) {
					this._addTabTree();
				} else {
					this._splitView.removeView(this._tabTreeIndex);
					if (this._plusButton) {
						this._tabTreeContainer.removeChild(this._plusButton);
					}
				}
			} else if (e.affectsConfiguration('terminal.integrated.tabsLocation')) {
				this._tabTreeIndex = this._terminalService.configHelper.config.tabsLocation === 'left' ? 0 : 1;
				this._terminalContainerIndex = this._terminalService.configHelper.config.tabsLocation === 'left' ? 1 : 0;
				if (this._showTabs) {
					this._splitView.swapViews(0, 1);
				}
			}
		});

		this._register(this._themeService.onDidColorThemeChange(theme => this._updateTheme(theme)));
		this._updateTheme();

		this._findWidget.focusTracker.onDidFocus(() => this._terminalContainer!.classList.add(FIND_FOCUS_CLASS));

		this._attachEventListeners(parentElement, this._terminalContainer);

		this._splitView = new SplitView(parentElement, { orientation: Orientation.HORIZONTAL, proportionalLayout: false });

		this._setupSplitView();
	}

	private _getLastWidgetWidth(): number {
		const storedValue = this._storageService.get(TABS_WIDGET_WIDTH_KEY, StorageScope.WORKSPACE);
		if (!storedValue || !parseInt(storedValue)) {
			return DEFAULT_TABS_WIDGET_WIDTH;
		}
		return parseInt(storedValue);
	}

	private _handleOnDidSashChange(): void {
		this._refreshHasTextClass();
		let widgetWidth = this._splitView.getViewSize(this._tabTreeIndex);
		if (!this._width || widgetWidth <= 0) {
			return;
		}
		widgetWidth = this._updateWidgetWidth(widgetWidth);
		for (const instance of this._terminalService.terminalInstances) {
			this._tabsWidget.rerender(instance);
		}
		this._storageService.store(TABS_WIDGET_WIDTH_KEY, widgetWidth, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	private _updateWidgetWidth(width: number): number {
		if (width < MIDPOINT_WIDGET_WIDTH && width > MIN_TABS_WIDGET_WIDTH) {
			width = MIN_TABS_WIDGET_WIDTH;
			this._splitView.resizeView(this._tabTreeIndex, width);
		} else if (width > MIDPOINT_WIDGET_WIDTH && width < DEFAULT_TABS_WIDGET_WIDTH) {
			width = DEFAULT_TABS_WIDGET_WIDTH;
			this._splitView.resizeView(this._tabTreeIndex, width);
		}
		return width;
	}

	private _setupSplitView(): void {
		this._register(this._splitView.onDidSashReset(() => this._splitView.resizeView(this._tabTreeIndex, DEFAULT_TABS_WIDGET_WIDTH)));
		this._register(this._splitView.onDidSashChange(() => this._handleOnDidSashChange()));

		if (this._showTabs) {
			this._addTabTree();
		}
		this._splitView.addView({
			element: this._terminalContainer,
			layout: width => this._terminalService.terminalTabs.forEach(tab => tab.layout(width, this._height || 0)),
			minimumSize: 120,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: () => Disposable.None,
			priority: LayoutPriority.High
		}, Sizing.Distribute, this._terminalContainerIndex);
	}

	private _addTabTree() {
		this._splitView.addView({
			element: this._tabTreeContainer,
			layout: width => this._tabsWidget.layout(this._height ? this._height - 28 : 0, width),
			minimumSize: MIN_TABS_WIDGET_WIDTH,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: () => Disposable.None,
			priority: LayoutPriority.Low
		}, Sizing.Distribute, this._tabTreeIndex);
		this._createButton();
	}

	layout(width: number, height: number): void {
		this._height = height;
		this._width = width;
		this._refreshHasTextClass();
		this._splitView.layout(width);
		if (this._showTabs) {
			this._splitView.resizeView(this._tabTreeIndex, this._getLastWidgetWidth());
		}
	}

	private _refreshHasTextClass() {
		this._tabTreeContainer.classList.toggle('has-text', this._tabTreeContainer.clientWidth >= DEFAULT_TABS_WIDGET_WIDTH);
	}

	private _createButton(): void {
		const toolBar = new ToolBar(this._tabTreeContainer, this._contextMenuService);
		toolBar.setActions([
			this._instantiationService.createInstance(MenuItemAction, { id: TERMINAL_COMMAND_ID.NEW, title: nls.localize('terminal.new', "New Terminal"), icon: Codicon.plus }, undefined, undefined),
			// TODO: Bring back context menu: await this._openTabsContextMenu(e);
			this._instantiationService.createInstance(MenuItemAction, { id: TERMINAL_COMMAND_ID.NEW_WITH_PROFILE, title: nls.localize('terminal.newWithProfile', "New Terminal With Profile"), icon: Codicon.chevronDown }, undefined, undefined)
		]);
	}

	private _updateTheme(theme?: IColorTheme): void {
		if (!theme) {
			theme = this._themeService.getColorTheme();
		}

		this._findWidget?.updateTheme(theme);
	}

	private _attachEventListeners(parentDomElement: HTMLElement, terminalContainer: HTMLElement): void {
		this._register(dom.addDisposableListener(parentDomElement, 'mousedown', async (event: MouseEvent) => {
			if (this._terminalService.terminalInstances.length === 0) {
				return;
			}

			if (event.which === 2 && isLinux) {
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

					// copyPaste: Shift+right click should open context menu
					if (rightClickBehavior === 'copyPaste' && event.shiftKey) {
						this._openContextMenu(event);
						return;
					}

					if (rightClickBehavior === 'copyPaste' && terminal.hasSelection()) {
						await terminal.copySelection();
						terminal.clearSelection();
					} else {
						if (BrowserFeatures.clipboard.readText) {
							terminal.paste();
						} else {
							this._notificationService.info(`This browser doesn't support the clipboard.readText API needed to trigger a paste, try ${isMacintosh ? '⌘' : 'Ctrl'}+V instead.`);
						}
					}
					// Clear selection after all click event bubbling is finished on Mac to prevent
					// right-click selecting a word which is seemed cannot be disabled. There is a
					// flicker when pasting but this appears to give the best experience if the
					// setting is enabled.
					if (isMacintosh) {
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
				this._openContextMenu(event);
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
			if (e.target === this._parentElement || dom.isAncestor(e.target as HTMLElement, parentDomElement)) {
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
					const preparedPath = await this._terminalService.preparePathForTerminalAsync(path, terminal.shellLaunchConfig.executable, terminal.title, terminal.shellType);
					terminal.sendText(preparedPath, false);
					terminal.focus();
				}
			}
		}));
	}
	private _openContextMenu(event: MouseEvent): void {
		const standardEvent = new StandardMouseEvent(event);
		const anchor: { x: number, y: number } = { x: standardEvent.posx, y: standardEvent.posy };

		const actions: IAction[] = [];
		const actionsDisposable = createAndFillInContextMenuActions(this._instanceMenu, undefined, actions);

		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			getActionsContext: () => this._parentElement,
			onHide: () => actionsDisposable.dispose()
		});
	}

	// private async _openTabsContextMenu(event: MouseEvent): Promise<void> {
	// 	const standardEvent = new StandardMouseEvent(event);
	// 	const anchor: { x: number, y: number } = { x: standardEvent.posx, y: standardEvent.posy };

	// 	const actions: IAction[] = [];

	// 	const profiles = await this._terminalService.getAvailableProfiles().filter(p => this._terminalService.configHelper.checkIsProcessLaunchSafe(undefined, p));
	// 	const tabsMenu = this._dropdownMenu;
	// 	for (const p of profiles) {
	// 		const action = new MenuItemAction({ id: TERMINAL_COMMAND_ID.NEW_WITH_PROFILE, title: p.profileName, category: ContextMenuTabsGroup.Profile }, undefined, { arg: p, shouldForwardArgs: true }, this._contextKeyService, this._commandService);
	// 		actions.push(action);
	// 	}

	// 	const actionsDisposable = createAndFillInContextMenuActions(tabsMenu, undefined, actions);

	// 	this._contextMenuService.showContextMenu({
	// 		getAnchor: () => anchor,
	// 		getActions: () => actions,
	// 		getActionsContext: () => this._parentElement,
	// 		onHide: () => actionsDisposable.dispose()
	// 	});
	// }

	public focusFindWidget() {
		this._findWidgetVisible.set(true);
		const activeInstance = this._terminalService.getActiveInstance();
		if (activeInstance && activeInstance.hasSelection() && activeInstance.selection!.indexOf('\n') === -1) {
			this._findWidget!.reveal(activeInstance.selection);
		} else {
			this._findWidget!.reveal();
		}
	}

	public hideFindWidget() {
		this._findWidgetVisible.reset();
		this.focus();
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
	public focus() {
		if (this._terminalService.connectionState === TerminalConnectionState.Connecting) {
			// If the terminal is waiting to reconnect to remote terminals, then there is no TerminalInstance yet that can
			// be focused. So wait for connection to finish, then focus.
			const activeElement = document.activeElement;
			this._register(this._terminalService.onDidChangeConnectionState(() => {
				// Only focus the terminal if the activeElement has not changed since focus() was called
				// TODO hack
				if (document.activeElement === activeElement) {
					this._focus();
				}
			}));

			return;
		}
		this._focus();
	}

	private _focus() {
		this._terminalService.getActiveInstance()?.focusWhenReady();
	}
}
