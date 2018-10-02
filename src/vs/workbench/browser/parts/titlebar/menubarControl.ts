/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as browser from 'vs/base/browser/browser';
import * as strings from 'vs/base/common/strings';
import { IMenubarMenu, IMenubarMenuItemAction, IMenubarMenuItemSubmenu, IMenubarKeybinding } from 'vs/platform/menubar/common/menubar';
import { IMenuService, MenuId, IMenu, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { registerThemingParticipant, ITheme, ICssStyleCollector, IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowService, MenuBarVisibility, IWindowsService } from 'vs/platform/windows/common/windows';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ActionRunner, IActionRunner, IAction, Action } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import * as DOM from 'vs/base/browser/dom';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { isMacintosh } from 'vs/base/common/platform';
import { Menu, IMenuOptions, SubmenuAction, MENU_MNEMONIC_REGEX, cleanMnemonic, MENU_ESCAPED_MNEMONIC_REGEX } from 'vs/base/browser/ui/menu/menu';
import { KeyCode, KeyCodeUtils } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { domEvent } from 'vs/base/browser/event';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { RunOnceScheduler } from 'vs/base/common/async';
import { MENUBAR_SELECTION_FOREGROUND, MENUBAR_SELECTION_BACKGROUND, MENUBAR_SELECTION_BORDER, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { URI } from 'vs/base/common/uri';
import { ILabelService } from 'vs/platform/label/common/label';
import { IUpdateService, StateType } from 'vs/platform/update/common/update';
import { Gesture, EventType, GestureEvent } from 'vs/base/browser/touch';
import { attachMenuStyler } from 'vs/platform/theme/common/styler';

const $ = DOM.$;

interface CustomMenu {
	title: string;
	buttonElement: HTMLElement;
	titleElement: HTMLElement;
	actions?: IAction[];
}

enum MenubarState {
	HIDDEN,
	VISIBLE,
	FOCUSED,
	OPEN
}

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

	private focusedMenu: {
		index: number;
		holder?: HTMLElement;
		widget?: Menu;
	};

	private customMenus: CustomMenu[];

	private menuUpdater: RunOnceScheduler;
	private actionRunner: IActionRunner;
	private focusToReturn: HTMLElement;
	private container: HTMLElement;
	private recentlyOpened: IRecentlyOpened;
	private updatePending: boolean;
	private _focusState: MenubarState;

	// Input-related
	private _mnemonicsInUse: boolean;
	private openedViaKeyboard: boolean;
	private awaitingAltRelease: boolean;
	private ignoreNextMouseUp: boolean;
	private mnemonics: Map<KeyCode, number>;

	private _onVisibilityChange: Emitter<boolean>;
	private _onFocusStateChange: Emitter<boolean>;

	private static MAX_MENU_RECENT_ENTRIES = 10;

	constructor(
		@IThemeService private themeService: IThemeService,
		@IMenuService private menuService: IMenuService,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ILabelService private labelService: ILabelService,
		@IUpdateService private updateService: IUpdateService
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

		this.menuUpdater = this._register(new RunOnceScheduler(() => this.doSetupMenubar(), 200));

		this.actionRunner = this._register(new ActionRunner());
		this._register(this.actionRunner.onDidBeforeRun(() => {
			this.setUnfocusedState();
		}));

		this._onVisibilityChange = this._register(new Emitter<boolean>());
		this._onFocusStateChange = this._register(new Emitter<boolean>());

		if (isMacintosh || this.currentTitlebarStyleSetting !== 'custom') {
			for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
				this._register(this.topLevelMenus[topLevelMenuName].onDidChange(() => this.setupMenubar()));
			}
			this.doSetupMenubar();
		}

		this._focusState = MenubarState.HIDDEN;

		this.windowService.getRecentlyOpened().then((recentlyOpened) => {
			this.recentlyOpened = recentlyOpened;
		});

		this.registerListeners();
	}

	private get currentEnableMenuBarMnemonics(): boolean {
		let enableMenuBarMnemonics = this.configurationService.getValue<boolean>('window.enableMenuBarMnemonics');
		if (typeof enableMenuBarMnemonics !== 'boolean') {
			enableMenuBarMnemonics = true;
		}

		return enableMenuBarMnemonics;
	}

	private get currentAutoSaveSetting(): string {
		return this.configurationService.getValue<string>('files.autoSave');
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
		return this.configurationService.getValue<string>('window.titleBarStyle');
	}

	private get focusState(): MenubarState {
		return this._focusState;
	}

	private set focusState(value: MenubarState) {
		if (this._focusState >= MenubarState.FOCUSED && value < MenubarState.FOCUSED) {
			// Losing focus, update the menu if needed

			if (this.updatePending) {
				this.menuUpdater.schedule();
				this.updatePending = false;
			}
		}

		if (value === this._focusState) {
			return;
		}

		const isVisible = this.isVisible;
		const isOpen = this.isOpen;
		const isFocused = this.isFocused;

		this._focusState = value;

		switch (value) {
			case MenubarState.HIDDEN:
				if (isVisible) {
					this.hideMenubar();
				}

				if (isOpen) {
					this.cleanupCustomMenu();
				}

				if (isFocused) {
					this.focusedMenu = null;

					if (this.focusToReturn) {
						this.focusToReturn.focus();
						this.focusToReturn = null;
					}
				}


				break;
			case MenubarState.VISIBLE:
				if (!isVisible) {
					this.showMenubar();
				}

				if (isOpen) {
					this.cleanupCustomMenu();
				}

				if (isFocused) {
					if (this.focusedMenu) {
						this.customMenus[this.focusedMenu.index].buttonElement.blur();
					}

					this.focusedMenu = null;

					if (this.focusToReturn) {
						this.focusToReturn.focus();
						this.focusToReturn = null;
					}
				}

				break;
			case MenubarState.FOCUSED:
				if (!isVisible) {
					this.showMenubar();
				}

				if (isOpen) {
					this.cleanupCustomMenu();
				}

				if (this.focusedMenu) {
					this.customMenus[this.focusedMenu.index].buttonElement.focus();
				}
				break;
			case MenubarState.OPEN:
				if (!isVisible) {
					this.showMenubar();
				}

				if (this.focusedMenu) {
					this.showCustomMenu(this.focusedMenu.index, this.openedViaKeyboard);
				}
				break;
		}

		this._focusState = value;
		this._onFocusStateChange.fire(this.focusState >= MenubarState.FOCUSED);
	}

	private get mnemonicsInUse(): boolean {
		return this._mnemonicsInUse;
	}

	private set mnemonicsInUse(value: boolean) {
		this._mnemonicsInUse = value;
	}

	private get isVisible(): boolean {
		return this.focusState >= MenubarState.VISIBLE;
	}

	private get isFocused(): boolean {
		return this.focusState >= MenubarState.FOCUSED;
	}

	private get isOpen(): boolean {
		return this.focusState >= MenubarState.OPEN;
	}

	private onDidChangeFullscreen(): void {
		this.setUnfocusedState();
	}

	private onDidChangeWindowFocus(hasFocus: boolean): void {
		if (this.container) {
			if (hasFocus) {
				DOM.removeClass(this.container, 'inactive');
			} else {
				DOM.addClass(this.container, 'inactive');
				this.setUnfocusedState();
				this.awaitingAltRelease = false;
			}
		}
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (this.keys.some(key => event.affectsConfiguration(key))) {
			this.setupMenubar();
		}

		if (event.affectsConfiguration('window.menuBarVisibility')) {
			this.setUnfocusedState();
		}
	}

	private setUnfocusedState(): void {
		if (this.currentMenubarVisibility === 'toggle' || this.currentMenubarVisibility === 'hidden') {
			this.focusState = MenubarState.HIDDEN;
		} else if (this.currentMenubarVisibility === 'default' && browser.isFullscreen()) {
			this.focusState = MenubarState.HIDDEN;
		} else {
			this.focusState = MenubarState.VISIBLE;
		}

		this.ignoreNextMouseUp = false;
		this.mnemonicsInUse = false;
		this.updateMnemonicVisibility(false);
	}

	private hideMenubar(): void {
		this.container.style.display = 'none';
		this._onVisibilityChange.fire(false);
	}

	private showMenubar(): void {
		this.container.style.display = 'flex';
		this._onVisibilityChange.fire(true);
	}

	private onModifierKeyToggled(modifierKeyStatus: IModifierKeyStatus): void {
		const allModifiersReleased = !modifierKeyStatus.altKey && !modifierKeyStatus.ctrlKey && !modifierKeyStatus.shiftKey;

		if (this.currentMenubarVisibility === 'hidden') {
			return;
		}

		// Alt key pressed while menu is focused. This should return focus away from the menubar
		if (this.isFocused && modifierKeyStatus.lastKeyPressed === 'alt' && modifierKeyStatus.altKey) {
			this.setUnfocusedState();
			this.mnemonicsInUse = false;
			this.awaitingAltRelease = true;
		}

		// Clean alt key press and release
		if (allModifiersReleased && modifierKeyStatus.lastKeyPressed === 'alt' && modifierKeyStatus.lastKeyReleased === 'alt') {
			if (!this.awaitingAltRelease) {
				if (!this.isFocused) {
					this.mnemonicsInUse = true;
					this.focusedMenu = { index: 0 };
					this.focusState = MenubarState.FOCUSED;
				} else if (!this.isOpen) {
					this.setUnfocusedState();
				}
			}
		}

		// Alt key released
		if (!modifierKeyStatus.altKey && modifierKeyStatus.lastKeyReleased === 'alt') {
			this.awaitingAltRelease = false;
		}

		if (this.currentEnableMenuBarMnemonics && this.customMenus && !this.isOpen) {
			this.updateMnemonicVisibility((!this.awaitingAltRelease && modifierKeyStatus.altKey) || this.mnemonicsInUse);
		}
	}

	private updateMnemonicVisibility(visible: boolean): void {
		if (this.customMenus) {
			this.customMenus.forEach(customMenu => {
				if (customMenu.titleElement.children.length) {
					let child = customMenu.titleElement.children.item(0) as HTMLElement;
					if (child) {
						child.style.textDecoration = visible ? 'underline' : null;
					}
				}
			});
		}
	}

	private onRecentlyOpenedChange(): void {
		this.windowService.getRecentlyOpened().then(recentlyOpened => {
			this.recentlyOpened = recentlyOpened;
			this.setupMenubar();
		});
	}

	private registerListeners(): void {
		// Update when config changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));

		// Listen to update service
		this.updateService.onStateChange(() => this.setupMenubar());

		// Listen for context changes
		this._register(this.contextKeyService.onDidChangeContext(() => this.setupMenubar()));

		// Listen for changes in recently opened menu
		this._register(this.windowsService.onRecentlyOpenedChange(() => { this.onRecentlyOpenedChange(); }));

		// Listen to keybindings change
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.setupMenubar()));

		// These listeners only apply when the custom menubar is being used
		if (!isMacintosh && this.currentTitlebarStyleSetting === 'custom') {
			// Listen to fullscreen changes
			this._register(browser.onDidChangeFullscreen(() => this.onDidChangeFullscreen()));

			// Listen for alt key presses
			this._register(ModifierKeyEmitter.getInstance(this.windowService).event(this.onModifierKeyToggled, this));

			// Listen for window focus changes
			this._register(this.windowService.onDidChangeFocus(e => this.onDidChangeWindowFocus(e)));
		}
	}

	private doSetupMenubar(): void {
		if (!isMacintosh && this.currentTitlebarStyleSetting === 'custom') {
			this.setupCustomMenubar();
		}

		// TODO@sbatten Uncomment to bring back dynamic menubar
		// else {
		// 	// Send menus to main process to be rendered by Electron
		// 	const menubarData = {};
		// 	if (this.getMenubarMenus(menubarData)) {
		// 		this.menubarService.updateMenubar(this.windowService.getCurrentWindowId(), menubarData, this.getAdditionalKeybindings());
		// 	}
		// }
	}

	private setupMenubar(): void {
		this.menuUpdater.schedule();
	}

	private registerMnemonic(menuIndex: number, mnemonic: string): void {
		this.mnemonics.set(KeyCodeUtils.fromString(mnemonic), menuIndex);
	}

	private setCheckedStatus(action: IAction | IMenubarMenuItemAction) {
		switch (action.id) {
			case 'workbench.action.toggleAutoSave':
				action.checked = this.currentAutoSaveSetting !== 'off';
				break;

			default:
				break;
		}
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

	private setupCustomMenubar(): void {
		// Don't update while using the menu
		if (this.isFocused) {
			this.updatePending = true;
			return;
		}

		this.container.attributes['role'] = 'menubar';

		const firstTimeSetup = this.customMenus === undefined;
		if (firstTimeSetup) {
			this.customMenus = [];
			this.mnemonics = new Map<KeyCode, number>();
		}

		let idx = 0;

		for (let menuTitle of Object.keys(this.topLevelMenus)) {
			const menu: IMenu = this.topLevelMenus[menuTitle];
			let menuIndex = idx++;
			const cleanMenuLabel = cleanMnemonic(this.topLevelTitles[menuTitle]);

			// Create the top level menu button element
			if (firstTimeSetup) {

				const buttonElement = $('div.menubar-menu-button', { 'role': 'menuitem', 'tabindex': 0, 'aria-label': cleanMenuLabel, 'aria-haspopup': true });
				const titleElement = $('div.menubar-menu-title', { 'role': 'none', 'aria-hidden': true });

				buttonElement.appendChild(titleElement);
				this.container.appendChild(buttonElement);

				this.customMenus.push({
					title: menuTitle,
					buttonElement: buttonElement,
					titleElement: titleElement
				});
			}

			// Update the button label to reflect mnemonics
			this.customMenus[menuIndex].titleElement.innerHTML = this.currentEnableMenuBarMnemonics ?
				strings.escape(this.topLevelTitles[menuTitle]).replace(MENU_ESCAPED_MNEMONIC_REGEX, '<mnemonic aria-hidden="true">$1</mnemonic>') :
				cleanMenuLabel;

			let mnemonicMatches = MENU_MNEMONIC_REGEX.exec(this.topLevelTitles[menuTitle]);

			// Register mnemonics
			if (mnemonicMatches) {
				let mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[2];

				if (firstTimeSetup) {
					this.registerMnemonic(menuIndex, mnemonic);
				}

				if (this.currentEnableMenuBarMnemonics) {
					this.customMenus[menuIndex].buttonElement.setAttribute('aria-keyshortcuts', 'Alt+' + mnemonic.toLocaleLowerCase());
				} else {
					this.customMenus[menuIndex].buttonElement.removeAttribute('aria-keyshortcuts');
				}
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
							const submenuActions = [];
							updateActions(submenu, submenuActions);
							target.push(new SubmenuAction(action.label, submenuActions));
						} else {
							action.label = this.calculateActionLabel(action);
							this.setCheckedStatus(action);
							target.push(action);
						}
					}

					target.push(new Separator());
				}

				target.pop();
			};

			this.customMenus[menuIndex].actions = [];
			if (firstTimeSetup) {
				this._register(menu.onDidChange(() => updateActions(menu, this.customMenus[menuIndex].actions)));
			}

			updateActions(menu, this.customMenus[menuIndex].actions);

			if (firstTimeSetup) {
				this._register(DOM.addDisposableListener(this.customMenus[menuIndex].buttonElement, DOM.EventType.KEY_UP, (e) => {
					let event = new StandardKeyboardEvent(e as KeyboardEvent);
					let eventHandled = true;

					if ((event.equals(KeyCode.DownArrow) || event.equals(KeyCode.Enter)) && !this.isOpen) {
						this.focusedMenu = { index: menuIndex };
						this.openedViaKeyboard = true;
						this.focusState = MenubarState.OPEN;
					} else {
						eventHandled = false;
					}

					if (eventHandled) {
						event.preventDefault();
						event.stopPropagation();
					}
				}));

				Gesture.addTarget(this.customMenus[menuIndex].buttonElement);
				this._register(DOM.addDisposableListener(this.customMenus[menuIndex].buttonElement, EventType.Tap, (e: GestureEvent) => {
					// Ignore this touch if the menu is touched
					if (this.isOpen && this.focusedMenu.holder && DOM.isAncestor(e.initialTarget as HTMLElement, this.focusedMenu.holder)) {
						return;
					}

					this.ignoreNextMouseUp = false;
					this.onMenuTriggered(menuIndex, true);

					e.preventDefault();
					e.stopPropagation();
				}));

				this._register(DOM.addDisposableListener(this.customMenus[menuIndex].buttonElement, DOM.EventType.MOUSE_DOWN, (e) => {
					if (!this.isOpen) {
						// Open the menu with mouse down and ignore the following mouse up event
						this.ignoreNextMouseUp = true;
						this.onMenuTriggered(menuIndex, true);
					} else {
						this.ignoreNextMouseUp = false;
					}

					e.preventDefault();
					e.stopPropagation();
				}));

				this._register(DOM.addDisposableListener(this.customMenus[menuIndex].buttonElement, DOM.EventType.MOUSE_UP, (e) => {
					if (!this.ignoreNextMouseUp) {
						if (this.isFocused) {
							this.onMenuTriggered(menuIndex, true);
						}
					} else {
						this.ignoreNextMouseUp = false;
					}
				}));

				this._register(DOM.addDisposableListener(this.customMenus[menuIndex].buttonElement, DOM.EventType.MOUSE_ENTER, () => {
					if (this.isOpen && !this.isCurrentMenu(menuIndex)) {
						this.customMenus[menuIndex].buttonElement.focus();
						this.cleanupCustomMenu();
						this.showCustomMenu(menuIndex, false);
					} else if (this.isFocused && !this.isOpen) {
						this.focusedMenu = { index: menuIndex };
						this.customMenus[menuIndex].buttonElement.focus();
					}
				}));
			}
		}

		if (firstTimeSetup) {
			this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, (e) => {
				let event = new StandardKeyboardEvent(e as KeyboardEvent);
				let eventHandled = true;
				const key = !!e.key ? KeyCodeUtils.fromString(e.key) : KeyCode.Unknown;

				if (event.equals(KeyCode.LeftArrow) || (event.shiftKey && event.keyCode === KeyCode.Tab)) {
					this.focusPrevious();
				} else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Tab)) {
					this.focusNext();
				} else if (event.equals(KeyCode.Escape) && this.isFocused && !this.isOpen) {
					this.setUnfocusedState();
				} else if (!this.isOpen && !event.ctrlKey && this.currentEnableMenuBarMnemonics && this.mnemonicsInUse && this.mnemonics.has(key)) {
					const menuIndex = this.mnemonics.get(key);
					this.onMenuTriggered(menuIndex, false);
				} else {
					eventHandled = false;
				}

				if (eventHandled) {
					event.preventDefault();
					event.stopPropagation();
				}
			}));

			this._register(DOM.addDisposableListener(window, DOM.EventType.MOUSE_DOWN, () => {
				// This mouse event is outside the menubar so it counts as a focus out
				if (this.isFocused) {
					this.setUnfocusedState();
				}
			}));

			this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_IN, (e) => {
				let event = e as FocusEvent;

				if (event.relatedTarget) {
					if (!this.container.contains(event.relatedTarget as HTMLElement)) {
						this.focusToReturn = event.relatedTarget as HTMLElement;
					}
				}
			}));

			this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_OUT, (e) => {
				let event = e as FocusEvent;

				if (event.relatedTarget) {
					if (!this.container.contains(event.relatedTarget as HTMLElement)) {
						this.focusToReturn = null;
						this.setUnfocusedState();
					}
				}
			}));

			this._register(DOM.addDisposableListener(window, DOM.EventType.KEY_DOWN, (e) => {
				if (!this.currentEnableMenuBarMnemonics || !e.altKey || e.ctrlKey) {
					return;
				}

				const key = KeyCodeUtils.fromString(e.key);
				if (!this.mnemonics.has(key)) {
					return;
				}

				// Prevent conflicts with keybindings
				const standardKeyboardEvent = new StandardKeyboardEvent(e);
				const resolvedResult = this.keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);
				if (resolvedResult) {
					return;
				}

				this.mnemonicsInUse = true;
				this.updateMnemonicVisibility(true);

				const menuIndex = this.mnemonics.get(key);
				this.onMenuTriggered(menuIndex, false);
			}));
		}
	}

	private onMenuTriggered(menuIndex: number, clicked: boolean) {
		if (this.isOpen) {
			if (this.isCurrentMenu(menuIndex)) {
				this.setUnfocusedState();
			} else {
				this.cleanupCustomMenu();
				this.showCustomMenu(menuIndex, this.openedViaKeyboard);
			}
		} else {
			this.focusedMenu = { index: menuIndex };
			this.openedViaKeyboard = !clicked;
			this.focusState = MenubarState.OPEN;
		}
	}

	private focusPrevious(): void {

		if (!this.focusedMenu) {
			return;
		}

		let newFocusedIndex = (this.focusedMenu.index - 1 + this.customMenus.length) % this.customMenus.length;

		if (newFocusedIndex === this.focusedMenu.index) {
			return;
		}

		if (this.isOpen) {
			this.cleanupCustomMenu();
			this.showCustomMenu(newFocusedIndex);
		} else if (this.isFocused) {
			this.focusedMenu.index = newFocusedIndex;
			this.customMenus[newFocusedIndex].buttonElement.focus();
		}
	}

	private focusNext(): void {
		if (!this.focusedMenu) {
			return;
		}

		let newFocusedIndex = (this.focusedMenu.index + 1) % this.customMenus.length;

		if (newFocusedIndex === this.focusedMenu.index) {
			return;
		}

		if (this.isOpen) {
			this.cleanupCustomMenu();
			this.showCustomMenu(newFocusedIndex);
		} else if (this.isFocused) {
			this.focusedMenu.index = newFocusedIndex;
			this.customMenus[newFocusedIndex].buttonElement.focus();
		}
	}

	private getMenubarKeybinding(id: string): IMenubarKeybinding {
		const binding = this.keybindingService.lookupKeybinding(id);
		if (!binding) {
			return null;
		}

		// first try to resolve a native accelerator
		const electronAccelerator = binding.getElectronAccelerator();
		if (electronAccelerator) {
			return { id, label: electronAccelerator, isNative: true };
		}

		// we need this fallback to support keybindings that cannot show in electron menus (e.g. chords)
		const acceleratorLabel = binding.getLabel();
		if (acceleratorLabel) {
			return { id, label: acceleratorLabel, isNative: false };
		}

		return null;
	}

	private populateMenuItems(menu: IMenu, menuToPopulate: IMenubarMenu) {
		let groups = menu.getActions();
		for (let group of groups) {
			const [, actions] = group;

			actions.forEach(menuItem => {

				if (menuItem instanceof SubmenuItemAction) {
					const submenu = { items: [] };
					this.populateMenuItems(this.menuService.createMenu(menuItem.item.submenu, this.contextKeyService), submenu);

					let menubarSubmenuItem: IMenubarMenuItemSubmenu = {
						id: menuItem.id,
						label: menuItem.label,
						submenu: submenu
					};

					menuToPopulate.items.push(menubarSubmenuItem);
				} else {
					let menubarMenuItem: IMenubarMenuItemAction = {
						id: menuItem.id,
						label: menuItem.label,
						checked: menuItem.checked,
						enabled: menuItem.enabled,
						keybinding: this.getMenubarKeybinding(menuItem.id)
					};

					this.setCheckedStatus(menubarMenuItem);
					menubarMenuItem.label = this.calculateActionLabel(menubarMenuItem);

					menuToPopulate.items.push(menubarMenuItem);
				}
			});

			menuToPopulate.items.push({ id: 'vscode.menubar.separator' });
		}

		if (menuToPopulate.items.length > 0) {
			menuToPopulate.items.pop();
		}
	}

	// private getAdditionalKeybindings(): Array<IMenubarKeybinding> {
	// 	const keybindings = [];
	// 	if (isMacintosh) {
	// 		keybindings.push(this.getMenubarKeybinding('workbench.action.quit'));
	// 	}

	// 	return keybindings;
	// }

	// private getMenubarMenus(menubarData: IMenubarData): boolean {
	// 	if (!menubarData) {
	// 		return false;
	// 	}

	// 	for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
	// 		const menu = this.topLevelMenus[topLevelMenuName];
	// 		let menubarMenu: IMenubarMenu = { items: [] };
	// 		this.populateMenuItems(menu, menubarMenu);
	// 		if (menubarMenu.items.length === 0) {
	// 			// Menus are incomplete
	// 			return false;
	// 		}
	// 		menubarData[topLevelMenuName] = menubarMenu;
	// 	}

	// 	return true;
	// }

	private isCurrentMenu(menuIndex: number): boolean {
		if (!this.focusedMenu) {
			return false;
		}

		return this.focusedMenu.index === menuIndex;
	}

	private cleanupCustomMenu(): void {
		if (this.focusedMenu) {
			// Remove focus from the menus first
			this.customMenus[this.focusedMenu.index].buttonElement.focus();

			if (this.focusedMenu.holder) {
				DOM.removeClass(this.focusedMenu.holder.parentElement, 'open');
				this.focusedMenu.holder.remove();
			}

			if (this.focusedMenu.widget) {
				this.focusedMenu.widget.dispose();
			}

			this.focusedMenu = { index: this.focusedMenu.index };
		}
	}

	private showCustomMenu(menuIndex: number, selectFirst = true): void {
		const customMenu = this.customMenus[menuIndex];
		const menuHolder = $('div.menubar-menu-items-holder');

		DOM.addClass(customMenu.buttonElement, 'open');
		menuHolder.style.top = `${this.container.clientHeight}px`;
		menuHolder.style.left = `${customMenu.buttonElement.getBoundingClientRect().left}px`;

		customMenu.buttonElement.appendChild(menuHolder);

		let menuOptions: IMenuOptions = {
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
			actionRunner: this.actionRunner,
			enableMnemonics: this.mnemonicsInUse && this.currentEnableMenuBarMnemonics,
			ariaLabel: customMenu.buttonElement.attributes['aria-label'].value
		};

		let menuWidget = this._register(new Menu(menuHolder, customMenu.actions, menuOptions));
		this._register(attachMenuStyler(menuWidget, this.themeService));

		this._register(menuWidget.onDidCancel(() => {
			this.focusState = MenubarState.FOCUSED;
		}));

		this._register(menuWidget.onDidBlur(() => {
			setTimeout(() => {
				this.cleanupCustomMenu();
			}, 100);
		}));

		menuWidget.focus(selectFirst);

		this.focusedMenu = {
			index: menuIndex,
			holder: menuHolder,
			widget: menuWidget
		};
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

		if (!this.isVisible) {
			this.hideMenubar();
		} else {
			this.showMenubar();
		}
	}

	public getMenubarItemsDimensions(): DOM.Dimension {
		if (this.customMenus) {
			const left = this.customMenus[0].buttonElement.getBoundingClientRect().left;
			const right = this.customMenus[this.customMenus.length - 1].buttonElement.getBoundingClientRect().right;
			return new DOM.Dimension(right - left, this.container.clientHeight);
		}

		return new DOM.Dimension(0, 0);
	}

	public create(parent: HTMLElement): HTMLElement {
		this.container = parent;

		// Build the menubar
		if (this.container) {
			this.doSetupMenubar();

			if (!isMacintosh && this.currentTitlebarStyleSetting === 'custom') {
				this.setUnfocusedState();
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
		`);
	}

	const menubarInactiveWindowFgColor = theme.getColor(TITLE_BAR_INACTIVE_FOREGROUND);
	if (menubarInactiveWindowFgColor) {
		collector.addRule(`
			.monaco-workbench .menubar.inactive > .menubar-menu-button {
				color: ${menubarInactiveWindowFgColor};
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

type ModifierKey = 'alt' | 'ctrl' | 'shift';

interface IModifierKeyStatus {
	altKey: boolean;
	shiftKey: boolean;
	ctrlKey: boolean;
	lastKeyPressed?: ModifierKey;
	lastKeyReleased?: ModifierKey;
}


class ModifierKeyEmitter extends Emitter<IModifierKeyStatus> {

	private _subscriptions: IDisposable[] = [];
	private _keyStatus: IModifierKeyStatus;
	private static instance: ModifierKeyEmitter;

	private constructor(windowService: IWindowService) {
		super();

		this._keyStatus = {
			altKey: false,
			shiftKey: false,
			ctrlKey: false
		};

		this._subscriptions.push(domEvent(document.body, 'keydown')(e => {
			const event = new StandardKeyboardEvent(e);

			if (e.altKey && !this._keyStatus.altKey) {
				this._keyStatus.lastKeyPressed = 'alt';
			} else if (e.ctrlKey && !this._keyStatus.ctrlKey) {
				this._keyStatus.lastKeyPressed = 'ctrl';
			} else if (e.shiftKey && !this._keyStatus.shiftKey) {
				this._keyStatus.lastKeyPressed = 'shift';
			} else if (event.keyCode !== KeyCode.Alt) {
				this._keyStatus.lastKeyPressed = undefined;
			} else {
				return;
			}

			this._keyStatus.altKey = e.altKey;
			this._keyStatus.ctrlKey = e.ctrlKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.lastKeyPressed) {
				this.fire(this._keyStatus);
			}
		}));
		this._subscriptions.push(domEvent(document.body, 'keyup')(e => {
			if (!e.altKey && this._keyStatus.altKey) {
				this._keyStatus.lastKeyReleased = 'alt';
			} else if (!e.ctrlKey && this._keyStatus.ctrlKey) {
				this._keyStatus.lastKeyReleased = 'ctrl';
			} else if (!e.shiftKey && this._keyStatus.shiftKey) {
				this._keyStatus.lastKeyReleased = 'shift';
			} else {
				this._keyStatus.lastKeyReleased = undefined;
			}

			if (this._keyStatus.lastKeyPressed !== this._keyStatus.lastKeyReleased) {
				this._keyStatus.lastKeyPressed = undefined;
			}

			this._keyStatus.altKey = e.altKey;
			this._keyStatus.ctrlKey = e.ctrlKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.lastKeyReleased) {
				this.fire(this._keyStatus);
			}
		}));
		this._subscriptions.push(domEvent(document.body, 'mousedown')(e => {
			this._keyStatus.lastKeyPressed = undefined;
		}));

		this._subscriptions.push(windowService.onDidChangeFocus(focused => {
			if (!focused) {
				this._keyStatus.lastKeyPressed = undefined;
				this._keyStatus.lastKeyReleased = undefined;
				this._keyStatus.altKey = false;
				this._keyStatus.shiftKey = false;
				this._keyStatus.shiftKey = false;

				this.fire(this._keyStatus);
			}
		}));
	}

	static getInstance(windowService: IWindowService) {
		if (!ModifierKeyEmitter.instance) {
			ModifierKeyEmitter.instance = new ModifierKeyEmitter(windowService);
		}

		return ModifierKeyEmitter.instance;
	}

	dispose() {
		super.dispose();
		this._subscriptions = dispose(this._subscriptions);
	}
}
