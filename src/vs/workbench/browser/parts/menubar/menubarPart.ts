/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/menubar/menubar.contribution';
import 'vs/css!./media/menubarpart';
import { Part } from 'vs/workbench/browser/part';
import { IMenubarService, IMenubarMenu, IMenubarMenuItemAction, IMenubarData } from 'vs/platform/menubar/common/menubar';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ActionRunner, IActionRunner, IAction } from 'vs/base/common/actions';
import { Builder, $ } from 'vs/base/browser/builder';
import { Separator, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventType } from 'vs/base/browser/dom';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { Menu, IMenuOptions } from 'vs/base/browser/ui/menu/menu';
import { KeyCode, KeyCodeUtils, KeyMod } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import URI from 'vs/base/common/uri';

interface CustomMenu {
	title: string;
	titleElement: Builder;
	actions?: IAction[];
}

export class MenubarPart extends Part {

	private topLevelMenus: {
		'File': IMenu;
		'Edit': IMenu;
		'Recent': IMenu;
		'Selection': IMenu;
		'View': IMenu;
		'Go': IMenu;
		'Debug': IMenu;
		'Tasks': IMenu;
		'Window'?: IMenu;
		'Preferences': IMenu;
		'Help': IMenu;
		[index: string]: IMenu;
	};

	private topLevelTitles = {
		'File': '&&File',
		'Edit': '&&Edit',
		'Recent': '&&Recent',
		'Selection': '&&Selection',
		'View': '&&View',
		'Go': '&&Go',
		'Debug': '&&Debug',
		'Tasks': '&&Tasks',
		'Preferences': '&&Preferences',
		'Help': '&&Help'
	};

	private mnemonics: {
		[index: number]: number;
	} = {};

	private focusedMenu: {
		index: number;
		holder: Builder;
		widget: Menu;
	};

	private customMenus: CustomMenu[];

	private actionRunner: IActionRunner;
	private container: Builder;
	private isFocused: boolean;

	constructor(
		id: string,
		@IThemeService themeService: IThemeService,
		@IMenubarService private menubarService: IMenubarService,
		@IMenuService private menuService: IMenuService,
		@IWindowService private windowService: IWindowService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, { hasTitle: false }, themeService);

		this.topLevelMenus = {
			'File': this.menuService.createMenu(MenuId.MenubarFileMenu, this.contextKeyService),
			'Edit': this.menuService.createMenu(MenuId.MenubarEditMenu, this.contextKeyService),
			// 'Recent': this.menuService.createMenu(MenuId.MenubarRecentMenu, this.contextKeyService),
			// 'Selection': this.menuService.createMenu(MenuId.MenubarSelectionMenu, this.contextKeyService),
			// 'View': this.menuService.createMenu(MenuId.MenubarViewMenu, this.contextKeyService),
			// 'Go': this.menuService.createMenu(MenuId.MenubarGoMenu, this.contextKeyService),
			// 'Debug': this.menuService.createMenu(MenuId.MenubarDebugMenu, this.contextKeyService),
			// 'Tasks': this.menuService.createMenu(MenuId.MenubarTasksMenu, this.contextKeyService),
			'Preferences': this.menuService.createMenu(MenuId.MenubarPreferencesMenu, this.contextKeyService),
			// 'Help': this.menuService.createMenu(MenuId.MenubarHelpMenu, this.contextKeyService)
		};

		if (isMacintosh) {
			this.topLevelMenus['Window'] = this.menuService.createMenu(MenuId.MenubarWindowMenu, this.contextKeyService);
		}

		this.actionRunner = new ActionRunner();
		this.actionRunner.onDidBeforeRun(() => {
			if (this.focusedMenu && this.focusedMenu.holder) {
				this.focusedMenu.holder.hide();
			}
		});

		for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
			this.topLevelMenus[topLevelMenuName].onDidChange(() => this.setupNativeMenubar());
		}

		this.setupNativeMenubar();

		this.isFocused = false;
	}

	private setupNativeMenubar(): void {
		this.menubarService.updateMenubar(this.windowService.getCurrentWindowId(), this.getMenubarMenus());
	}

	private registerMnemonic(menuIndex: number, keyCode: KeyCode): void {
		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: 'menubar.mnemonics.' + menuIndex,
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
			when: void 0,
			primary: null,
			win: { primary: KeyMod.Alt | keyCode },
			handler: (accessor, resource: URI | object) => {
				if (!this.focusedMenu) {
					this.toggleCustomMenu(menuIndex);
				}
			}
		});
	}

	private setupCustomMenubar(): void {
		this.customMenus = [];
		let idx = 0;

		for (let menuTitle of Object.keys(this.topLevelMenus)) {
			const menu: IMenu = this.topLevelMenus[menuTitle];

			let menuIndex = idx++;

			let titleElement = $(this.container).div({ class: 'menubar-menu-button' });

			let displayTitle = this.topLevelTitles[menuTitle].replace(/&&(.)/g, '<u>$1</u>');
			$(titleElement).div({ class: 'menubar-menu-title' }).innerHtml(displayTitle);

			let mnemonic = (/&&(.)/g).exec(this.topLevelTitles[menuTitle])[1];
			if (mnemonic) {
				this.registerMnemonic(menuIndex, KeyCodeUtils.fromString(mnemonic));
			}

			this.customMenus.push({
				title: menuTitle,
				titleElement: titleElement
			});

			// Update cached actions array for CustomMenus
			const updateActions = () => {
				this.customMenus[menuIndex].actions = [];
				let groups = menu.getActions();
				for (let group of groups) {
					const [, actions] = group;

					// actions.map((action: MenuItemAction) => {
					// 	action.label = action.label.replace(/\(&&\w\)|&&/g, '');
					// });

					this.customMenus[menuIndex].actions.push(...actions);
					this.customMenus[menuIndex].actions.push(new Separator());
				}

				this.customMenus[menuIndex].actions.pop();
			};

			menu.onDidChange(updateActions);
			updateActions();

			// this.menus[menuTitle].element.on(EventType.CLICK, () => {
			// 	this.showMenu(menuTitle);
			// });

			this.customMenus[menuIndex].titleElement.on(EventType.CLICK, () => {
				this.toggleCustomMenu(menuIndex);
				this.isFocused = !this.isFocused;
			});

			this.customMenus[menuIndex].titleElement.getHTMLElement().onmouseenter = () => {
				if (this.isFocused && !this.isCurrentMenu(menuIndex)) {
					this.toggleCustomMenu(menuIndex);
				}
			};

			this.customMenus[menuIndex].titleElement.getHTMLElement().onmouseleave = () => {
				if (!this.isFocused) {
					this.cleanupCustomMenu();
				}
			};

			this.customMenus[menuIndex].titleElement.getHTMLElement().onblur = () => {
				this.cleanupCustomMenu();
			};
		}

		$(this.container).on(EventType.KEY_DOWN, (e) => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			let eventHandled = true;

			if (event.equals(KeyCode.LeftArrow)) {
				this.focusPrevious();
			} else if (event.equals(KeyCode.RightArrow)) {
				this.focusNext();
			} else if (event.altKey && event.keyCode && this.mnemonics[event.keyCode] !== undefined && !this.focusedMenu) {
				this.toggleCustomMenu(this.mnemonics[event.keyCode]);
			} else {
				eventHandled = false;
			}

			if (eventHandled) {
				event.preventDefault();
				event.stopPropagation();
			}
		});
	}

	private focusPrevious(): void {
		if (!this.focusedMenu) {
			return;
		}

		let newFocusedIndex = (this.focusedMenu.index - 1 + this.customMenus.length) % this.customMenus.length;

		if (newFocusedIndex === this.focusedMenu.index) {
			return;
		}

		this.toggleCustomMenu(newFocusedIndex);
	}

	private focusNext(): void {
		if (!this.focusedMenu) {
			return;
		}

		let newFocusedIndex = (this.focusedMenu.index + 1) % this.customMenus.length;

		if (newFocusedIndex === this.focusedMenu.index) {
			return;
		}

		this.toggleCustomMenu(newFocusedIndex);
	}

	private getMenubarMenus(): IMenubarData {
		let ret: IMenubarData = {};

		for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
			const menu = this.topLevelMenus[topLevelMenuName];
			let menubarMenu: IMenubarMenu = { items: [] };
			let groups = menu.getActions();
			for (let group of groups) {
				const [, actions] = group;
				actions.forEach(menuItemAction => {
					let menubarMenuItem: IMenubarMenuItemAction = {
						id: menuItemAction.id,
						label: menuItemAction.label,
						checked: menuItemAction.checked,
						enabled: menuItemAction.enabled
					};

					menubarMenu.items.push(menubarMenuItem);
				});

				menubarMenu.items.push({ id: 'vscode.menubar.separator' });
			}

			if (menubarMenu.items.length > 0) {
				menubarMenu.items.pop();
			}

			ret[topLevelMenuName] = menubarMenu;
		}

		return ret;
	}

	private isCurrentMenu(menuIndex: number): boolean {
		if (!this.focusedMenu) {
			return false;
		}

		return this.focusedMenu.index === menuIndex;
	}

	private cleanupCustomMenu(): void {
		if (this.focusedMenu) {

			if (this.focusedMenu.holder) {
				$(this.focusedMenu.holder.getHTMLElement().parentElement).removeClass('open');
				this.focusedMenu.holder.dispose();
			}

			if (this.focusedMenu.widget) {
				this.focusedMenu.widget.dispose();
			}
		}

		this.focusedMenu = null;
	}

	public focusCustomMenu(menuTitle: string): void {
		this.toggleCustomMenu(0);
	}

	private _getActionItem(action: IAction): ActionItem {
		const keybinding = this.keybindingService.lookupKeybinding(action.id);
		if (keybinding) {
			return new ActionItem(action, action, { label: true, keybinding: keybinding.getLabel() });
		}
		return null;
	}

	private toggleCustomMenu(menuIndex: number): void {
		const customMenu = this.customMenus[menuIndex];

		if (this.focusedMenu) {
			let hiding: boolean = this.isCurrentMenu(menuIndex);

			// Need to cleanup currently displayed menu
			this.cleanupCustomMenu();

			// Hiding this menu
			if (hiding) {
				return;
			}
		}

		let menuHolder = $(customMenu.titleElement).div({ class: 'menubar-menu-items-holder' });

		$(menuHolder.getHTMLElement().parentElement).addClass('open');

		menuHolder.addClass('menubar-menu-items-holder-open');
		menuHolder.style({
			'background-color': this.getColor(ACTIVITY_BAR_BACKGROUND),
			'color': this.getColor(ACTIVITY_BAR_FOREGROUND)
		});

		let menuOptions: IMenuOptions = {
			actionRunner: this.actionRunner,
			actionItemProvider: (action) => { return this._getActionItem(action); }
		};

		let menuWidget = new Menu(menuHolder.getHTMLElement(), customMenu.actions, menuOptions);

		menuWidget.onDidCancel(() => {
			this.cleanupCustomMenu();
			this.isFocused = false;
		});

		menuWidget.onDidBlur(() => {
			setTimeout(() => {
				this.cleanupCustomMenu();
				this.isFocused = false;
			}, 100);
		});

		menuWidget.focus();

		this.focusedMenu = {
			index: menuIndex,
			holder: menuHolder,
			widget: menuWidget
		};
	}

	public createContentArea(parent: HTMLElement): HTMLElement {
		this.container = $(parent);

		if (!isWindows) {
			return this.container.getHTMLElement();
		}

		// Build the menubar
		if (this.container) {
			this.setupCustomMenubar();
		}

		return this.container.getHTMLElement();
	}
}