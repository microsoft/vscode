/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/menubarControl.css';
import { localize, localize2 } from '../../../../nls.js';
import { IMenuService, MenuId, IMenu, SubmenuItemAction, registerAction2, Action2, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { MenuBarVisibility, IWindowOpenable, getMenuBarVisibility, hasNativeTitlebar, TitleBarSetting } from '../../../../platform/window/common/window.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IAction, Action, SubmenuAction, Separator, IActionRunner, ActionRunner, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification, toAction } from '../../../../base/common/actions.js';
import { addDisposableListener, Dimension, EventType } from '../../../../base/browser/dom.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isMacintosh, isWeb, isIOS, isNative } from '../../../../base/common/platform.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IRecentlyOpened, isRecentFolder, IRecent, isRecentWorkspace, IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { MenuBar, IMenuBarOptions } from '../../../../base/browser/ui/menu/menubar.js';
import { HorizontalDirection, IMenuDirection, VerticalDirection } from '../../../../base/browser/ui/menu/menu.js';
import { mnemonicMenuLabel, unmnemonicLabel } from '../../../../base/common/labels.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { isFullscreen, onDidChangeFullscreen } from '../../../../base/browser/browser.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { BrowserFeatures } from '../../../../base/browser/canIUse.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IsMacNativeContext, IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { OpenRecentAction } from '../../actions/windowActions.js';
import { isICommandActionToggleInfo } from '../../../../platform/action/common/action.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { defaultMenuStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ActivityBarPosition } from '../../../services/layout/browser/layoutService.js';

export type IOpenRecentAction = IAction & { uri: URI; remoteAuthority?: string };

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarFileMenu,
	title: {
		value: 'File',
		original: 'File',
		mnemonicTitle: localize({ key: 'mFile', comment: ['&& denotes a mnemonic'] }, "&&File"),
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarEditMenu,
	title: {
		value: 'Edit',
		original: 'Edit',
		mnemonicTitle: localize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarSelectionMenu,
	title: {
		value: 'Selection',
		original: 'Selection',
		mnemonicTitle: localize({ key: 'mSelection', comment: ['&& denotes a mnemonic'] }, "&&Selection")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarViewMenu,
	title: {
		value: 'View',
		original: 'View',
		mnemonicTitle: localize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarGoMenu,
	title: {
		value: 'Go',
		original: 'Go',
		mnemonicTitle: localize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go")
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarTerminalMenu,
	title: {
		value: 'Terminal',
		original: 'Terminal',
		mnemonicTitle: localize({ key: 'mTerminal', comment: ['&& denotes a mnemonic'] }, "&&Terminal")
	},
	order: 7
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarHelpMenu,
	title: {
		value: 'Help',
		original: 'Help',
		mnemonicTitle: localize({ key: 'mHelp', comment: ['&& denotes a mnemonic'] }, "&&Help")
	},
	order: 8
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarPreferencesMenu,
	title: {
		value: 'Preferences',
		original: 'Preferences',
		mnemonicTitle: localize({ key: 'mPreferences', comment: ['&& denotes a mnemonic'] }, "Preferences")
	},
	when: IsMacNativeContext,
	order: 9
});

export abstract class MenubarControl extends Disposable {

	protected keys = [
		'window.menuBarVisibility',
		'window.enableMenuBarMnemonics',
		'window.customMenuBarAltFocus',
		'workbench.sideBar.location',
		'window.nativeTabs'
	];

	protected mainMenu: IMenu;
	protected menus: {
		[index: string]: IMenu | undefined;
	} = {};

	protected topLevelTitles: { [menu: string]: string } = {};

	protected readonly mainMenuDisposables: DisposableStore;

	protected recentlyOpened: IRecentlyOpened = { files: [], workspaces: [] };

	protected menuUpdater: RunOnceScheduler;

	protected static readonly MAX_MENU_RECENT_ENTRIES = 10;

	constructor(
		protected readonly menuService: IMenuService,
		protected readonly workspacesService: IWorkspacesService,
		protected readonly contextKeyService: IContextKeyService,
		protected readonly keybindingService: IKeybindingService,
		protected readonly configurationService: IConfigurationService,
		protected readonly labelService: ILabelService,
		protected readonly updateService: IUpdateService,
		protected readonly storageService: IStorageService,
		protected readonly notificationService: INotificationService,
		protected readonly preferencesService: IPreferencesService,
		protected readonly environmentService: IWorkbenchEnvironmentService,
		protected readonly accessibilityService: IAccessibilityService,
		protected readonly hostService: IHostService,
		protected readonly commandService: ICommandService
	) {

		super();

		this.mainMenu = this._register(this.menuService.createMenu(MenuId.MenubarMainMenu, this.contextKeyService));
		this.mainMenuDisposables = this._register(new DisposableStore());

		this.setupMainMenu();

		this.menuUpdater = this._register(new RunOnceScheduler(() => this.doUpdateMenubar(false), 200));

		this.notifyUserOfCustomMenubarAccessibility();
	}

	protected abstract doUpdateMenubar(firstTime: boolean): void;

	protected registerListeners(): void {
		// Listen for window focus changes
		this._register(this.hostService.onDidChangeFocus(e => this.onDidChangeWindowFocus(e)));

		// Update when config changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));

		// Listen to update service
		this._register(this.updateService.onStateChange(() => this.onUpdateStateChange()));

		// Listen for changes in recently opened menu
		this._register(this.workspacesService.onDidChangeRecentlyOpened(() => { this.onDidChangeRecentlyOpened(); }));

		// Listen to keybindings change
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateMenubar()));

		// Update recent menu items on formatter registration
		this._register(this.labelService.onDidChangeFormatters(() => { this.onDidChangeRecentlyOpened(); }));

		// Listen for changes on the main menu
		this._register(this.mainMenu.onDidChange(() => { this.setupMainMenu(); this.doUpdateMenubar(true); }));
	}

	protected setupMainMenu(): void {
		this.mainMenuDisposables.clear();
		this.menus = {};
		this.topLevelTitles = {};

		const [, mainMenuActions] = this.mainMenu.getActions()[0];
		for (const mainMenuAction of mainMenuActions) {
			if (mainMenuAction instanceof SubmenuItemAction && typeof mainMenuAction.item.title !== 'string') {
				this.menus[mainMenuAction.item.title.original] = this.mainMenuDisposables.add(this.menuService.createMenu(mainMenuAction.item.submenu, this.contextKeyService, { emitEventsForSubmenuChanges: true }));
				this.topLevelTitles[mainMenuAction.item.title.original] = mainMenuAction.item.title.mnemonicTitle ?? mainMenuAction.item.title.value;
			}
		}
	}

	protected updateMenubar(): void {
		this.menuUpdater.schedule();
	}

	protected calculateActionLabel(action: { id: string; label: string }): string {
		const label = action.label;
		switch (action.id) {
			default:
				break;
		}

		return label;
	}

	protected onUpdateStateChange(): void {
		this.updateMenubar();
	}

	protected onUpdateKeybindings(): void {
		this.updateMenubar();
	}

	protected getOpenRecentActions(): (Separator | IOpenRecentAction)[] {
		if (!this.recentlyOpened) {
			return [];
		}

		const { workspaces, files } = this.recentlyOpened;

		const result = [];

		if (workspaces.length > 0) {
			for (let i = 0; i < MenubarControl.MAX_MENU_RECENT_ENTRIES && i < workspaces.length; i++) {
				result.push(this.createOpenRecentMenuAction(workspaces[i]));
			}

			result.push(new Separator());
		}

		if (files.length > 0) {
			for (let i = 0; i < MenubarControl.MAX_MENU_RECENT_ENTRIES && i < files.length; i++) {
				result.push(this.createOpenRecentMenuAction(files[i]));
			}

			result.push(new Separator());
		}

		return result;
	}

	protected onDidChangeWindowFocus(hasFocus: boolean): void {
		// When we regain focus, update the recent menu items
		if (hasFocus) {
			this.onDidChangeRecentlyOpened();
		}
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (this.keys.some(key => event.affectsConfiguration(key))) {
			this.updateMenubar();
		}

		if (event.affectsConfiguration('editor.accessibilitySupport')) {
			this.notifyUserOfCustomMenubarAccessibility();
		}

		// Since we try not update when hidden, we should
		// try to update the recently opened list on visibility changes
		if (event.affectsConfiguration('window.menuBarVisibility')) {
			this.onDidChangeRecentlyOpened();
		}
	}

	private get menubarHidden(): boolean {
		return isMacintosh && isNative ? false : getMenuBarVisibility(this.configurationService) === 'hidden';
	}

	protected onDidChangeRecentlyOpened(): void {

		// Do not update recently opened when the menubar is hidden #108712
		if (!this.menubarHidden) {
			this.workspacesService.getRecentlyOpened().then(recentlyOpened => {
				this.recentlyOpened = recentlyOpened;
				this.updateMenubar();
			});
		}
	}

	private createOpenRecentMenuAction(recent: IRecent): IOpenRecentAction {

		let label: string;
		let uri: URI;
		let commandId: string;
		let openable: IWindowOpenable;
		const remoteAuthority = recent.remoteAuthority;

		if (isRecentFolder(recent)) {
			uri = recent.folderUri;
			label = recent.label || this.labelService.getWorkspaceLabel(uri, { verbose: Verbosity.LONG });
			commandId = 'openRecentFolder';
			openable = { folderUri: uri };
		} else if (isRecentWorkspace(recent)) {
			uri = recent.workspace.configPath;
			label = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
			commandId = 'openRecentWorkspace';
			openable = { workspaceUri: uri };
		} else {
			uri = recent.fileUri;
			label = recent.label || this.labelService.getUriLabel(uri, { appendWorkspaceSuffix: true });
			commandId = 'openRecentFile';
			openable = { fileUri: uri };
		}

		const ret = toAction({
			id: commandId, label: unmnemonicLabel(label), run: (browserEvent: KeyboardEvent) => {
				const openInNewWindow = browserEvent && ((!isMacintosh && (browserEvent.ctrlKey || browserEvent.shiftKey)) || (isMacintosh && (browserEvent.metaKey || browserEvent.altKey)));

				return this.hostService.openWindow([openable], {
					forceNewWindow: !!openInNewWindow,
					remoteAuthority: remoteAuthority || null // local window if remoteAuthority is not set or can not be deducted from the openable
				});
			}
		});

		return Object.assign(ret, { uri, remoteAuthority });
	}

	private notifyUserOfCustomMenubarAccessibility(): void {
		if (isWeb || isMacintosh) {
			return;
		}

		const hasBeenNotified = this.storageService.getBoolean('menubar/accessibleMenubarNotified', StorageScope.APPLICATION, false);
		const usingCustomMenubar = !hasNativeTitlebar(this.configurationService);

		if (hasBeenNotified || usingCustomMenubar || !this.accessibilityService.isScreenReaderOptimized()) {
			return;
		}

		const message = localize('menubar.customTitlebarAccessibilityNotification', "Accessibility support is enabled for you. For the most accessible experience, we recommend the custom title bar style.");
		this.notificationService.prompt(Severity.Info, message, [
			{
				label: localize('goToSetting', "Open Settings"),
				run: () => {
					return this.preferencesService.openUserSettings({ query: TitleBarSetting.TITLE_BAR_STYLE });
				}
			}
		]);

		this.storageService.store('menubar/accessibleMenubarNotified', true, StorageScope.APPLICATION, StorageTarget.USER);
	}
}

// This is a bit complex due to the issue https://github.com/microsoft/vscode/issues/205836
let focusMenuBarEmitter: Emitter<void> | undefined = undefined;
function enableFocusMenuBarAction(): Emitter<void> {
	if (!focusMenuBarEmitter) {
		focusMenuBarEmitter = new Emitter<void>();

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.menubar.focus`,
					title: localize2('focusMenu', 'Focus Application Menu'),
					keybinding: {
						primary: KeyMod.Alt | KeyCode.F10,
						weight: KeybindingWeight.WorkbenchContrib,
						when: IsWebContext
					},
					f1: true
				});
			}

			async run(): Promise<void> {
				focusMenuBarEmitter?.fire();
			}
		});
	}

	return focusMenuBarEmitter;
}

export class CustomMenubarControl extends MenubarControl {
	private menubar: MenuBar | undefined;
	private container: HTMLElement | undefined;
	private alwaysOnMnemonics: boolean = false;
	private focusInsideMenubar: boolean = false;
	private pendingFirstTimeUpdate: boolean = false;
	private visible: boolean = true;
	private actionRunner: IActionRunner;
	private readonly webNavigationMenu = this._register(this.menuService.createMenu(MenuId.MenubarHomeMenu, this.contextKeyService));

	private readonly _onVisibilityChange: Emitter<boolean>;
	private readonly _onFocusStateChange: Emitter<boolean>;

	constructor(
		@IMenuService menuService: IMenuService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILabelService labelService: ILabelService,
		@IUpdateService updateService: IUpdateService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IPreferencesService preferencesService: IPreferencesService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHostService hostService: IHostService,
		@ICommandService commandService: ICommandService
	) {
		super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);

		this._onVisibilityChange = this._register(new Emitter<boolean>());
		this._onFocusStateChange = this._register(new Emitter<boolean>());

		this.actionRunner = this._register(new ActionRunner());
		this.actionRunner.onDidRun(e => {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: e.action.id, from: 'menu' });
		});

		this.workspacesService.getRecentlyOpened().then((recentlyOpened) => {
			this.recentlyOpened = recentlyOpened;
		});

		this.registerListeners();
	}

	protected doUpdateMenubar(firstTime: boolean): void {
		if (!this.focusInsideMenubar) {
			this.setupCustomMenubar(firstTime);
		}

		if (firstTime) {
			this.pendingFirstTimeUpdate = true;
		}
	}

	private getUpdateAction(): IAction | null {
		const state = this.updateService.state;

		switch (state.type) {
			case StateType.Idle:
				return new Action('update.check', localize({ key: 'checkForUpdates', comment: ['&& denotes a mnemonic'] }, "Check for &&Updates..."), undefined, true, () =>
					this.updateService.checkForUpdates(true));

			case StateType.CheckingForUpdates:
				return new Action('update.checking', localize('checkingForUpdates', "Checking for Updates..."), undefined, false);

			case StateType.AvailableForDownload:
				return new Action('update.downloadNow', localize({ key: 'download now', comment: ['&& denotes a mnemonic'] }, "D&&ownload Update"), undefined, true, () =>
					this.updateService.downloadUpdate());

			case StateType.Downloading:
				return new Action('update.downloading', localize('DownloadingUpdate', "Downloading Update..."), undefined, false);

			case StateType.Downloaded:
				return isMacintosh ? null : new Action('update.install', localize({ key: 'installUpdate...', comment: ['&& denotes a mnemonic'] }, "Install &&Update..."), undefined, true, () =>
					this.updateService.applyUpdate());

			case StateType.Updating:
				return new Action('update.updating', localize('installingUpdate', "Installing Update..."), undefined, false);

			case StateType.Ready:
				return new Action('update.restart', localize({ key: 'restartToUpdate', comment: ['&& denotes a mnemonic'] }, "Restart to &&Update"), undefined, true, () =>
					this.updateService.quitAndInstall());

			default:
				return null;
		}
	}

	private get currentMenubarVisibility(): MenuBarVisibility {
		return getMenuBarVisibility(this.configurationService);
	}

	private get currentDisableMenuBarAltFocus(): boolean {
		const settingValue = this.configurationService.getValue<boolean>('window.customMenuBarAltFocus');

		let disableMenuBarAltBehavior = false;
		if (typeof settingValue === 'boolean') {
			disableMenuBarAltBehavior = !settingValue;
		}

		return disableMenuBarAltBehavior;
	}

	private insertActionsBefore(nextAction: IAction, target: IAction[]): void {
		switch (nextAction.id) {
			case OpenRecentAction.ID:
				target.push(...this.getOpenRecentActions());
				break;

			case 'workbench.action.showAboutDialog':
				if (!isMacintosh && !isWeb) {
					const updateAction = this.getUpdateAction();
					if (updateAction) {
						updateAction.label = mnemonicMenuLabel(updateAction.label);
						target.push(updateAction);
						target.push(new Separator());
					}
				}

				break;

			default:
				break;
		}
	}

	private get currentEnableMenuBarMnemonics(): boolean {
		let enableMenuBarMnemonics = this.configurationService.getValue<boolean>('window.enableMenuBarMnemonics');
		if (typeof enableMenuBarMnemonics !== 'boolean') {
			enableMenuBarMnemonics = true;
		}

		return enableMenuBarMnemonics && (!isWeb || isFullscreen(mainWindow));
	}

	private get currentCompactMenuMode(): IMenuDirection | undefined {
		if (this.currentMenubarVisibility !== 'compact') {
			return undefined;
		}

		// Menu bar lives in activity bar and should flow based on its location
		const currentSidebarLocation = this.configurationService.getValue<string>('workbench.sideBar.location');
		const horizontalDirection = currentSidebarLocation === 'right' ? HorizontalDirection.Left : HorizontalDirection.Right;

		const activityBarLocation = this.configurationService.getValue<string>('workbench.activityBar.location');
		const verticalDirection = activityBarLocation === ActivityBarPosition.BOTTOM ? VerticalDirection.Above : VerticalDirection.Below;

		return { horizontal: horizontalDirection, vertical: verticalDirection };
	}

	private onDidVisibilityChange(visible: boolean): void {
		this.visible = visible;
		this.onDidChangeRecentlyOpened();
		this._onVisibilityChange.fire(visible);
	}

	private toActionsArray(menu: IMenu): IAction[] {
		return getFlatContextMenuActions(menu.getActions({ shouldForwardArgs: true }));
	}

	private readonly reinstallDisposables = this._register(new DisposableStore());
	private readonly updateActionsDisposables = this._register(new DisposableStore());
	private setupCustomMenubar(firstTime: boolean): void {
		// If there is no container, we cannot setup the menubar
		if (!this.container) {
			return;
		}

		if (firstTime) {
			// Reset and create new menubar
			if (this.menubar) {
				this.reinstallDisposables.clear();
			}

			this.menubar = this.reinstallDisposables.add(new MenuBar(this.container, this.getMenuBarOptions(), defaultMenuStyles));

			this.accessibilityService.alwaysUnderlineAccessKeys().then(val => {
				this.alwaysOnMnemonics = val;
				this.menubar?.update(this.getMenuBarOptions());
			});

			this.reinstallDisposables.add(this.menubar.onFocusStateChange(focused => {
				this._onFocusStateChange.fire(focused);

				// When the menubar loses focus, update it to clear any pending updates
				if (!focused) {
					if (this.pendingFirstTimeUpdate) {
						this.setupCustomMenubar(true);
						this.pendingFirstTimeUpdate = false;
					} else {
						this.updateMenubar();
					}

					this.focusInsideMenubar = false;
				}
			}));

			this.reinstallDisposables.add(this.menubar.onVisibilityChange(e => this.onDidVisibilityChange(e)));

			// Before we focus the menubar, stop updates to it so that focus-related context keys will work
			this.reinstallDisposables.add(addDisposableListener(this.container, EventType.FOCUS_IN, () => {
				this.focusInsideMenubar = true;
			}));

			this.reinstallDisposables.add(addDisposableListener(this.container, EventType.FOCUS_OUT, () => {
				this.focusInsideMenubar = false;
			}));

			// Fire visibility change for the first install if menu is shown
			if (this.menubar.isVisible) {
				this.onDidVisibilityChange(true);
			}
		} else {
			this.menubar?.update(this.getMenuBarOptions());
		}

		// Update the menu actions
		const updateActions = (menuActions: readonly IAction[], target: IAction[], topLevelTitle: string, store: DisposableStore) => {
			target.splice(0);

			for (const menuItem of menuActions) {
				this.insertActionsBefore(menuItem, target);

				if (menuItem instanceof Separator) {
					target.push(menuItem);
				} else if (menuItem instanceof SubmenuItemAction || menuItem instanceof MenuItemAction) {
					// use mnemonicTitle whenever possible
					let title = typeof menuItem.item.title === 'string'
						? menuItem.item.title
						: menuItem.item.title.mnemonicTitle ?? menuItem.item.title.value;

					if (menuItem instanceof SubmenuItemAction) {
						const submenuActions: SubmenuAction[] = [];
						updateActions(menuItem.actions, submenuActions, topLevelTitle, store);

						if (submenuActions.length > 0) {
							target.push(new SubmenuAction(menuItem.id, mnemonicMenuLabel(title), submenuActions));
						}
					} else {
						if (isICommandActionToggleInfo(menuItem.item.toggled)) {
							title = menuItem.item.toggled.mnemonicTitle ?? menuItem.item.toggled.title ?? title;
						}

						const newAction = store.add(new Action(menuItem.id, mnemonicMenuLabel(title), menuItem.class, menuItem.enabled, () => this.commandService.executeCommand(menuItem.id)));
						newAction.tooltip = menuItem.tooltip;
						newAction.checked = menuItem.checked;
						target.push(newAction);
					}
				}

			}

			// Append web navigation menu items to the file menu when not compact
			if (topLevelTitle === 'File' && this.currentCompactMenuMode === undefined) {
				const webActions = this.getWebNavigationActions();
				if (webActions.length) {
					target.push(...webActions);
				}
			}
		};

		for (const title of Object.keys(this.topLevelTitles)) {
			const menu = this.menus[title];
			if (firstTime && menu) {
				const menuChangedDisposable = this.reinstallDisposables.add(new DisposableStore());
				this.reinstallDisposables.add(menu.onDidChange(() => {
					if (!this.focusInsideMenubar) {
						const actions: IAction[] = [];
						menuChangedDisposable.clear();
						updateActions(this.toActionsArray(menu), actions, title, menuChangedDisposable);
						this.menubar?.updateMenu({ actions, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
					}
				}));

				// For the file menu, we need to update if the web nav menu updates as well
				if (menu === this.menus.File) {
					const webMenuChangedDisposable = this.reinstallDisposables.add(new DisposableStore());
					this.reinstallDisposables.add(this.webNavigationMenu.onDidChange(() => {
						if (!this.focusInsideMenubar) {
							const actions: IAction[] = [];
							webMenuChangedDisposable.clear();
							updateActions(this.toActionsArray(menu), actions, title, webMenuChangedDisposable);
							this.menubar?.updateMenu({ actions, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
						}
					}));
				}
			}

			const actions: IAction[] = [];
			if (menu) {
				this.updateActionsDisposables.clear();
				updateActions(this.toActionsArray(menu), actions, title, this.updateActionsDisposables);
			}

			if (this.menubar) {
				if (!firstTime) {
					this.menubar.updateMenu({ actions, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
				} else {
					this.menubar.push({ actions, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
				}
			}
		}
	}

	private getWebNavigationActions(): IAction[] {
		if (!isWeb) {
			return []; // only for web
		}

		const webNavigationActions = [];
		for (const groups of this.webNavigationMenu.getActions()) {
			const [, actions] = groups;
			for (const action of actions) {
				if (action instanceof MenuItemAction) {
					const title = typeof action.item.title === 'string'
						? action.item.title
						: action.item.title.mnemonicTitle ?? action.item.title.value;
					webNavigationActions.push(new Action(action.id, mnemonicMenuLabel(title), action.class, action.enabled, async (event?: any) => {
						this.commandService.executeCommand(action.id, event);
					}));
				}
			}

			webNavigationActions.push(new Separator());
		}

		if (webNavigationActions.length) {
			webNavigationActions.pop();
		}

		return webNavigationActions;
	}

	private getMenuBarOptions(): IMenuBarOptions {
		return {
			enableMnemonics: this.currentEnableMenuBarMnemonics,
			disableAltFocus: this.currentDisableMenuBarAltFocus,
			visibility: this.currentMenubarVisibility,
			actionRunner: this.actionRunner,
			getKeybinding: (action) => this.keybindingService.lookupKeybinding(action.id),
			alwaysOnMnemonics: this.alwaysOnMnemonics,
			compactMode: this.currentCompactMenuMode,
			getCompactMenuActions: () => {
				if (!isWeb) {
					return []; // only for web
				}

				return this.getWebNavigationActions();
			}
		};
	}

	protected override onDidChangeWindowFocus(hasFocus: boolean): void {
		if (!this.visible) {
			return;
		}

		super.onDidChangeWindowFocus(hasFocus);

		if (this.container) {
			if (hasFocus) {
				this.container.classList.remove('inactive');
			} else {
				this.container.classList.add('inactive');
				this.menubar?.blur();
			}
		}
	}

	protected override onUpdateStateChange(): void {
		if (!this.visible) {
			return;
		}

		super.onUpdateStateChange();
	}

	protected override onDidChangeRecentlyOpened(): void {
		if (!this.visible) {
			return;
		}

		super.onDidChangeRecentlyOpened();
	}

	protected override onUpdateKeybindings(): void {
		if (!this.visible) {
			return;
		}

		super.onUpdateKeybindings();
	}

	protected override registerListeners(): void {
		super.registerListeners();

		this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => {
			if (this.menubar && !(isIOS && BrowserFeatures.pointerEvents)) {
				this.menubar.blur();
			}
		}));

		// Mnemonics require fullscreen in web
		if (isWeb) {
			this._register(onDidChangeFullscreen(windowId => {
				if (windowId === mainWindow.vscodeWindowId) {
					this.updateMenubar();
				}
			}));
			this._register(this.webNavigationMenu.onDidChange(() => this.updateMenubar()));
			this._register(enableFocusMenuBarAction().event(() => this.menubar?.toggleFocus()));
		}
	}

	get onVisibilityChange(): Event<boolean> {
		return this._onVisibilityChange.event;
	}

	get onFocusStateChange(): Event<boolean> {
		return this._onFocusStateChange.event;
	}

	getMenubarItemsDimensions(): Dimension {
		if (this.menubar) {
			return new Dimension(this.menubar.getWidth(), this.menubar.getHeight());
		}

		return new Dimension(0, 0);
	}

	create(parent: HTMLElement): HTMLElement {
		this.container = parent;

		// Build the menubar
		if (this.container) {
			this.doUpdateMenubar(true);
		}

		return this.container;
	}

	layout(dimension: Dimension) {
		this.menubar?.update(this.getMenuBarOptions());
	}

	toggleFocus() {
		this.menubar?.toggleFocus();
	}
}
