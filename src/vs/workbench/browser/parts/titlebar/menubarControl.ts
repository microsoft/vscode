/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IMenubarMenu, IMenubarMenuItemAction, IMenubarMenuItemSubmenu, IMenubarKeybinding, IMenubarService, IMenubarData } from 'vs/platform/menubar/common/menubar';
import { IMenuService, MenuId, IMenu, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { registerThemingParticipant, ITheme, ICssStyleCollector, IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowService, MenuBarVisibility, IWindowsService, getTitleBarStyle } from 'vs/platform/windows/common/windows';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IAction, Action } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import * as DOM from 'vs/base/browser/dom';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { RunOnceScheduler } from 'vs/base/common/async';
import { MENUBAR_SELECTION_FOREGROUND, MENUBAR_SELECTION_BACKGROUND, MENUBAR_SELECTION_BORDER, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { URI } from 'vs/base/common/uri';
import { ILabelService } from 'vs/platform/label/common/label';
import { IUpdateService, StateType } from 'vs/platform/update/common/update';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { MenuBar } from 'vs/base/browser/ui/menu/menubar';
import { SubmenuAction } from 'vs/base/browser/ui/menu/menu';
import { attachMenuStyler } from 'vs/platform/theme/common/styler';

export class MenubarControl extends Disposable {

	private keys = [
		'files.autoSave',
		'window.menuBarVisibility',
		'editor.multiCursorModifier',
		'workbench.sideBar.location',
		'workbench.statusBar.visible',
		'workbench.activityBar.visible',
		'window.enableMenuBarMnemonics',
		'window.nativeTabs'
	];

	private topLevelMenus: {
		'File': IMenu;
		'Edit': IMenu;
		'Selection': IMenu;
		'View': IMenu;
		'Go': IMenu;
		'Debug': IMenu;
		'Terminal': IMenu;
		'Window'?: IMenu;
		'Help': IMenu;
		[index: string]: IMenu;
	};

	private topLevelTitles = {
		'File': nls.localize({ key: 'mFile', comment: ['&& denotes a mnemonic'] }, "&&File"),
		'Edit': nls.localize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit"),
		'Selection': nls.localize({ key: 'mSelection', comment: ['&& denotes a mnemonic'] }, "&&Selection"),
		'View': nls.localize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View"),
		'Go': nls.localize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go"),
		'Debug': nls.localize({ key: 'mDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug"),
		'Terminal': nls.localize({ key: 'mTerminal', comment: ['&& denotes a mnemonic'] }, "&&Terminal"),
		'Help': nls.localize({ key: 'mHelp', comment: ['&& denotes a mnemonic'] }, "&&Help")
	};

	private menubar: MenuBar;
	private menuUpdater: RunOnceScheduler;
	private container: HTMLElement;
	private recentlyOpened: IRecentlyOpened;

	private _onVisibilityChange: Emitter<boolean>;
	private _onFocusStateChange: Emitter<boolean>;

	private static MAX_MENU_RECENT_ENTRIES = 10;

	constructor(
		@IThemeService private themeService: IThemeService,
		@IMenubarService private menubarService: IMenubarService,
		@IMenuService private menuService: IMenuService,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ILabelService private labelService: ILabelService,
		@IUpdateService private updateService: IUpdateService,
		@IStorageService private storageService: IStorageService,
		@INotificationService private notificationService: INotificationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {

		super();

		this.topLevelMenus = {
			'File': this._register(this.menuService.createMenu(MenuId.MenubarFileMenu, this.contextKeyService)),
			'Edit': this._register(this.menuService.createMenu(MenuId.MenubarEditMenu, this.contextKeyService)),
			'Selection': this._register(this.menuService.createMenu(MenuId.MenubarSelectionMenu, this.contextKeyService)),
			'View': this._register(this.menuService.createMenu(MenuId.MenubarViewMenu, this.contextKeyService)),
			'Go': this._register(this.menuService.createMenu(MenuId.MenubarGoMenu, this.contextKeyService)),
			'Debug': this._register(this.menuService.createMenu(MenuId.MenubarDebugMenu, this.contextKeyService)),
			'Terminal': this._register(this.menuService.createMenu(MenuId.MenubarTerminalMenu, this.contextKeyService)),
			'Help': this._register(this.menuService.createMenu(MenuId.MenubarHelpMenu, this.contextKeyService))
		};

		if (isMacintosh) {
			this.topLevelMenus['Preferences'] = this._register(this.menuService.createMenu(MenuId.MenubarPreferencesMenu, this.contextKeyService));
		}

		this.menuUpdater = this._register(new RunOnceScheduler(() => this.doUpdateMenubar(false), 200));

		if (isMacintosh || this.currentTitlebarStyleSetting !== 'custom') {
			for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
				this._register(this.topLevelMenus[topLevelMenuName].onDidChange(() => this.updateMenubar()));
			}

			this.doUpdateMenubar(true);
		}

		this._onVisibilityChange = this._register(new Emitter<boolean>());
		this._onFocusStateChange = this._register(new Emitter<boolean>());

		this.windowService.getRecentlyOpened().then((recentlyOpened) => {
			this.recentlyOpened = recentlyOpened;
		});

		this.detectAndRecommendCustomTitlebar();

		this.registerListeners();
	}

	private get currentEnableMenuBarMnemonics(): boolean {
		let enableMenuBarMnemonics = this.configurationService.getValue<boolean>('window.enableMenuBarMnemonics');
		if (typeof enableMenuBarMnemonics !== 'boolean') {
			enableMenuBarMnemonics = true;
		}

		return enableMenuBarMnemonics;
	}

	private get currentSidebarPosition(): string {
		return this.configurationService.getValue<string>('workbench.sideBar.location');
	}

	private get currentStatusBarVisibility(): boolean {
		let setting = this.configurationService.getValue<boolean>('workbench.statusBar.visible');
		if (typeof setting !== 'boolean') {
			setting = true;
		}

		return setting;
	}

	private get currentActivityBarVisibility(): boolean {
		let setting = this.configurationService.getValue<boolean>('workbench.activityBar.visible');
		if (typeof setting !== 'boolean') {
			setting = true;
		}

		return setting;
	}

	private get currentMenubarVisibility(): MenuBarVisibility {
		return this.configurationService.getValue<MenuBarVisibility>('window.menuBarVisibility');
	}

	private get currentTitlebarStyleSetting(): string {
		return getTitleBarStyle(this.configurationService, this.environmentService);
	}

	private onDidChangeWindowFocus(hasFocus: boolean): void {
		if (this.container) {
			if (hasFocus) {
				DOM.removeClass(this.container, 'inactive');
			} else {
				DOM.addClass(this.container, 'inactive');
				this.menubar.blur();
			}
		}
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (this.keys.some(key => event.affectsConfiguration(key))) {
			this.updateMenubar();
		}

		if (event.affectsConfiguration('window.menuBarVisibility')) {
			this.detectAndRecommendCustomTitlebar();
		}
	}

	private onRecentlyOpenedChange(): void {
		this.windowService.getRecentlyOpened().then(recentlyOpened => {
			this.recentlyOpened = recentlyOpened;
			this.updateMenubar();
		});
	}

	private detectAndRecommendCustomTitlebar(): void {
		if (!isLinux) {
			return;
		}

		if (!this.storageService.getBoolean('menubar/electronFixRecommended', StorageScope.GLOBAL, false)) {
			if (this.currentMenubarVisibility === 'hidden' || this.currentTitlebarStyleSetting === 'custom') {
				// Issue will not arise for user, abort notification
				return;
			}

			const message = nls.localize('menubar.electronFixRecommendation', "If you experience hard to read text in the menu bar, we recommend trying out the custom title bar.");
			this.notificationService.prompt(Severity.Info, message, [
				{
					label: nls.localize('goToSetting', "Open Settings"),
					run: () => {
						return this.preferencesService.openGlobalSettings(undefined, { query: 'window.titleBarStyle' });
					}
				},
				{
					label: nls.localize('moreInfo', "More Info"),
					run: () => {
						window.open('https://go.microsoft.com/fwlink/?linkid=2038566');
					}
				},
				{
					label: nls.localize('neverShowAgain', "Don't Show Again"),
					run: () => {
						this.storageService.store('menubar/electronFixRecommended', true, StorageScope.GLOBAL);
					}
				}
			]);
		}
	}

	private registerListeners(): void {
		// Update when config changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));

		// Listen to update service
		this.updateService.onStateChange(() => this.updateMenubar());

		// Listen for changes in recently opened menu
		this._register(this.windowsService.onRecentlyOpenedChange(() => { this.onRecentlyOpenedChange(); }));

		// Listen to keybindings change
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateMenubar()));

		// These listeners only apply when the custom menubar is being used
		if (!isMacintosh && this.currentTitlebarStyleSetting === 'custom') {
			// Listen for window focus changes
			this._register(this.windowService.onDidChangeFocus(e => this.onDidChangeWindowFocus(e)));

			this._register(this.windowService.onDidChangeMaximize(e => this.updateMenubar()));

			this._register(DOM.addDisposableListener(window, DOM.EventType.RESIZE, () => {
				this.menubar.blur();
			}));
		}
	}

	private doUpdateMenubar(firstTime: boolean): void {
		if (!isMacintosh && this.currentTitlebarStyleSetting === 'custom') {
			this.setupCustomMenubar(firstTime);
		} else {
			// Send menus to main process to be rendered by Electron
			const menubarData = { menus: {}, keybindings: {} };
			if (this.getMenubarMenus(menubarData)) {
				this.menubarService.updateMenubar(this.windowService.getCurrentWindowId(), menubarData);
			}
		}
	}

	private updateMenubar(): void {
		this.menuUpdater.schedule();
	}

	private calculateActionLabel(action: IAction | IMenubarMenuItemAction): string {
		let label = action.label;
		switch (action.id) {
			case 'workbench.action.toggleSidebarPosition':
				if (this.currentSidebarPosition !== 'right') {
					label = nls.localize({ key: 'miMoveSidebarRight', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Right");
				} else {
					label = nls.localize({ key: 'miMoveSidebarLeft', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Left");
				}
				break;

			case 'workbench.action.toggleStatusbarVisibility':
				if (this.currentStatusBarVisibility) {
					label = nls.localize({ key: 'miHideStatusbar', comment: ['&& denotes a mnemonic'] }, "&&Hide Status Bar");
				} else {
					label = nls.localize({ key: 'miShowStatusbar', comment: ['&& denotes a mnemonic'] }, "&&Show Status Bar");
				}
				break;

			case 'workbench.action.toggleActivityBarVisibility':
				if (this.currentActivityBarVisibility) {
					label = nls.localize({ key: 'miHideActivityBar', comment: ['&& denotes a mnemonic'] }, "Hide &&Activity Bar");
				} else {
					label = nls.localize({ key: 'miShowActivityBar', comment: ['&& denotes a mnemonic'] }, "Show &&Activity Bar");
				}
				break;

			default:
				break;
		}

		return label;
	}

	private createOpenRecentMenuAction(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI, commandId: string, isFile: boolean): IAction {

		let label: string;
		let uri: URI;

		if (isSingleFolderWorkspaceIdentifier(workspace) && !isFile) {
			label = this.labelService.getWorkspaceLabel(workspace, { verbose: true });
			uri = workspace;
		} else if (isWorkspaceIdentifier(workspace)) {
			label = this.labelService.getWorkspaceLabel(workspace, { verbose: true });
			uri = URI.file(workspace.configPath);
		} else {
			uri = workspace;
			label = this.labelService.getUriLabel(uri);
		}

		return new Action(commandId, label, undefined, undefined, (event) => {
			const openInNewWindow = event && ((!isMacintosh && (event.ctrlKey || event.shiftKey)) || (isMacintosh && (event.metaKey || event.altKey)));

			return this.windowService.openWindow([uri], {
				forceNewWindow: openInNewWindow,
				forceOpenWorkspaceAsFile: isFile
			});
		});
	}

	private getOpenRecentActions(): IAction[] {
		if (!this.recentlyOpened) {
			return [];
		}

		const { workspaces, files } = this.recentlyOpened;

		const result: IAction[] = [];

		if (workspaces.length > 0) {
			for (let i = 0; i < MenubarControl.MAX_MENU_RECENT_ENTRIES && i < workspaces.length; i++) {
				result.push(this.createOpenRecentMenuAction(workspaces[i], 'openRecentWorkspace', false));
			}

			result.push(new Separator());
		}

		if (files.length > 0) {
			for (let i = 0; i < MenubarControl.MAX_MENU_RECENT_ENTRIES && i < files.length; i++) {
				result.push(this.createOpenRecentMenuAction(files[i], 'openRecentFile', false));
			}

			result.push(new Separator());
		}

		return result;
	}

	private getUpdateAction(): IAction | null {
		const state = this.updateService.state;

		switch (state.type) {
			case StateType.Uninitialized:
				return null;

			case StateType.Idle:
				const windowId = this.windowService.getCurrentWindowId();
				return new Action('update.check', nls.localize({ key: 'checkForUpdates', comment: ['&& denotes a mnemonic'] }, "Check for &&Updates..."), undefined, true, () =>
					this.updateService.checkForUpdates({ windowId }));

			case StateType.CheckingForUpdates:
				return new Action('update.checking', nls.localize('checkingForUpdates', "Checking For Updates..."), undefined, false);

			case StateType.AvailableForDownload:
				return new Action('update.downloadNow', nls.localize({ key: 'download now', comment: ['&& denotes a mnemonic'] }, "D&&ownload Now"), null, true, () =>
					this.updateService.downloadUpdate());

			case StateType.Downloading:
				return new Action('update.downloading', nls.localize('DownloadingUpdate', "Downloading Update..."), undefined, false);

			case StateType.Downloaded:
				return new Action('update.install', nls.localize({ key: 'installUpdate...', comment: ['&& denotes a mnemonic'] }, "Install &&Update..."), undefined, true, () =>
					this.updateService.applyUpdate());

			case StateType.Updating:
				return new Action('update.updating', nls.localize('installingUpdate', "Installing Update..."), undefined, false);

			case StateType.Ready:
				return new Action('update.restart', nls.localize({ key: 'restartToUpdate', comment: ['&& denotes a mnemonic'] }, "Restart to &&Update..."), undefined, true, () =>
					this.updateService.quitAndInstall());
		}
	}

	private insertActionsBefore(nextAction: IAction, target: IAction[]): void {
		switch (nextAction.id) {
			case 'workbench.action.openRecent':
				target.push(...this.getOpenRecentActions());
				break;

			case 'workbench.action.showAboutDialog':
				if (!isMacintosh) {
					const updateAction = this.getUpdateAction();
					if (updateAction) {
						target.push(updateAction);
						target.push(new Separator());
					}
				}

				break;

			default:
				break;
		}
	}

	private setupCustomMenubar(firstTime: boolean): void {
		if (firstTime) {
			this.menubar = this._register(new MenuBar(
				this.container, {
					enableMnemonics: this.currentEnableMenuBarMnemonics,
					visibility: this.currentMenubarVisibility,
					getKeybinding: (action) => this.keybindingService.lookupKeybinding(action.id),
				}
			));

			this._register(this.menubar.onFocusStateChange(e => this._onFocusStateChange.fire(e)));
			this._register(this.menubar.onVisibilityChange(e => this._onVisibilityChange.fire(e)));

			this._register(attachMenuStyler(this.menubar, this.themeService));
		} else {
			this.menubar.update({ enableMnemonics: this.currentEnableMenuBarMnemonics, visibility: this.currentMenubarVisibility, getKeybinding: (action) => this.keybindingService.lookupKeybinding(action.id) });
		}

		// Update the menu actions
		const updateActions = (menu: IMenu, target: IAction[]) => {
			target.splice(0);
			let groups = menu.getActions();
			for (let group of groups) {
				const [, actions] = group;

				for (let action of actions) {
					this.insertActionsBefore(action, target);
					if (action instanceof SubmenuItemAction) {
						const submenu = this.menuService.createMenu(action.item.submenu, this.contextKeyService);
						const submenuActions: SubmenuAction[] = [];
						updateActions(submenu, submenuActions);
						target.push(new SubmenuAction(action.label, submenuActions));
						submenu.dispose();
					} else {
						action.label = this.calculateActionLabel(action);
						target.push(action);
					}
				}

				target.push(new Separator());
			}

			target.pop();
		};

		for (let title of Object.keys(this.topLevelMenus)) {
			const menu = this.topLevelMenus[title];
			if (firstTime) {
				this._register(menu.onDidChange(() => {
					const actions = [];
					updateActions(menu, actions);
					this.menubar.updateMenu({ actions: actions, label: this.topLevelTitles[title] });
				}));
			}

			const actions = [];
			updateActions(menu, actions);

			if (!firstTime) {
				this.menubar.updateMenu({ actions: actions, label: this.topLevelTitles[title] });
			} else {
				this.menubar.push({ actions: actions, label: this.topLevelTitles[title] });
			}
		}
	}

	private getMenubarKeybinding(id: string): IMenubarKeybinding {
		const binding = this.keybindingService.lookupKeybinding(id);
		if (!binding) {
			return undefined;
		}

		// first try to resolve a native accelerator
		const electronAccelerator = binding.getElectronAccelerator();
		if (electronAccelerator) {
			return { label: electronAccelerator };
		}

		// we need this fallback to support keybindings that cannot show in electron menus (e.g. chords)
		const acceleratorLabel = binding.getLabel();
		if (acceleratorLabel) {
			return { label: acceleratorLabel, isNative: false };
		}

		return null;
	}

	private populateMenuItems(menu: IMenu, menuToPopulate: IMenubarMenu, keybindings: { [id: string]: IMenubarKeybinding }) {
		let groups = menu.getActions();
		for (let group of groups) {
			const [, actions] = group;

			actions.forEach(menuItem => {

				if (menuItem instanceof SubmenuItemAction) {
					const submenu = { items: [] };
					const menuToDispose = this.menuService.createMenu(menuItem.item.submenu, this.contextKeyService);
					this.populateMenuItems(menuToDispose, submenu, keybindings);

					let menubarSubmenuItem: IMenubarMenuItemSubmenu = {
						id: menuItem.id,
						label: menuItem.label,
						submenu: submenu
					};

					menuToPopulate.items.push(menubarSubmenuItem);
					menuToDispose.dispose();
				} else {
					let menubarMenuItem: IMenubarMenuItemAction = {
						id: menuItem.id,
						label: menuItem.label
					};

					if (menuItem.checked) {
						menubarMenuItem.checked = true;
					}

					if (!menuItem.enabled) {
						menubarMenuItem.enabled = false;
					}

					menubarMenuItem.label = this.calculateActionLabel(menubarMenuItem);
					keybindings[menuItem.id] = this.getMenubarKeybinding(menuItem.id);
					menuToPopulate.items.push(menubarMenuItem);
				}
			});

			menuToPopulate.items.push({ id: 'vscode.menubar.separator' });
		}

		if (menuToPopulate.items.length > 0) {
			menuToPopulate.items.pop();
		}
	}

	private getAdditionalKeybindings(): { [id: string]: IMenubarKeybinding } {
		const keybindings = {};
		if (isMacintosh) {
			keybindings['workbench.action.quit'] = (this.getMenubarKeybinding('workbench.action.quit'));
		}

		return keybindings;
	}

	private getMenubarMenus(menubarData: IMenubarData): boolean {
		if (!menubarData) {
			return false;
		}

		menubarData.keybindings = this.getAdditionalKeybindings();
		for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
			const menu = this.topLevelMenus[topLevelMenuName];
			let menubarMenu: IMenubarMenu = { items: [] };
			this.populateMenuItems(menu, menubarMenu, menubarData.keybindings);
			if (menubarMenu.items.length === 0) {
				// Menus are incomplete
				return false;
			}
			menubarData.menus[topLevelMenuName] = menubarMenu;
		}

		return true;
	}

	public get onVisibilityChange(): Event<boolean> {
		return this._onVisibilityChange.event;
	}

	public get onFocusStateChange(): Event<boolean> {
		return this._onFocusStateChange.event;
	}

	public layout(dimension: DOM.Dimension) {
		if (this.container) {
			this.container.style.height = `${dimension.height}px`;
		}

		if (this.menubar) {
			this.menubar.update({ enableMnemonics: this.currentEnableMenuBarMnemonics, visibility: this.currentMenubarVisibility, getKeybinding: (action) => this.keybindingService.lookupKeybinding(action.id) });
		}
	}

	public getMenubarItemsDimensions(): DOM.Dimension {
		if (this.menubar) {
			return new DOM.Dimension(this.menubar.getWidth(), this.menubar.getHeight());
		}

		return new DOM.Dimension(0, 0);
	}

	public create(parent: HTMLElement): HTMLElement {
		this.container = parent;

		// Build the menubar
		if (this.container) {

			if (!isMacintosh && this.currentTitlebarStyleSetting === 'custom') {
				this.doUpdateMenubar(true);
			}
		}

		return this.container;
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const menubarActiveWindowFgColor = theme.getColor(TITLE_BAR_ACTIVE_FOREGROUND);
	if (menubarActiveWindowFgColor) {
		collector.addRule(`
		.monaco-workbench .menubar > .menubar-menu-button {
			color: ${menubarActiveWindowFgColor};
		}

		.monaco-workbench .menubar .toolbar-toggle-more {
			background-color: ${menubarActiveWindowFgColor}
		}
		`);
	}

	const menubarInactiveWindowFgColor = theme.getColor(TITLE_BAR_INACTIVE_FOREGROUND);
	if (menubarInactiveWindowFgColor) {
		collector.addRule(`
			.monaco-workbench .menubar.inactive > .menubar-menu-button {
				color: ${menubarInactiveWindowFgColor};
			}

			.monaco-workbench .menubar.inactive > .menubar-menu-button .toolbar-toggle-more {
				background-color: ${menubarInactiveWindowFgColor}
			}
		`);
	}


	const menubarSelectedFgColor = theme.getColor(MENUBAR_SELECTION_FOREGROUND);
	if (menubarSelectedFgColor) {
		collector.addRule(`
			.monaco-workbench .menubar > .menubar-menu-button.open,
			.monaco-workbench .menubar > .menubar-menu-button:focus,
			.monaco-workbench .menubar:not(:focus-within) > .menubar-menu-button:hover {
				color: ${menubarSelectedFgColor};
			}

			.monaco-workbench .menubar  > .menubar-menu-button.open .toolbar-toggle-more,
			.monaco-workbench .menubar > .menubar-menu-button:focus .toolbar-toggle-more,
			.monaco-workbench .menubar:not(:focus-within) > .menubar-menu-button:hover .toolbar-toggle-more {
				background-color: ${menubarSelectedFgColor}
			}
		`);
	}

	const menubarSelectedBgColor = theme.getColor(MENUBAR_SELECTION_BACKGROUND);
	if (menubarSelectedBgColor) {
		collector.addRule(`
			.monaco-workbench .menubar > .menubar-menu-button.open,
			.monaco-workbench .menubar > .menubar-menu-button:focus,
			.monaco-workbench .menubar:not(:focus-within) > .menubar-menu-button:hover {
				background-color: ${menubarSelectedBgColor};
			}
		`);
	}

	const menubarSelectedBorderColor = theme.getColor(MENUBAR_SELECTION_BORDER);
	if (menubarSelectedBorderColor) {
		collector.addRule(`
			.monaco-workbench .menubar > .menubar-menu-button:hover {
				outline: dashed 1px;
			}

			.monaco-workbench .menubar > .menubar-menu-button.open,
			.monaco-workbench .menubar > .menubar-menu-button:focus {
				outline: solid 1px;
			}

			.monaco-workbench .menubar > .menubar-menu-button.open,
			.monaco-workbench .menubar > .menubar-menu-button:focus,
			.monaco-workbench .menubar > .menubar-menu-button:hover {
				outline-offset: -1px;
				outline-color: ${menubarSelectedBorderColor};
			}
		`);
	}
});
