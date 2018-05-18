/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/menubar/menubar.contribution';
import 'vs/css!./media/menubarpart';
import { Part } from 'vs/workbench/browser/part';
import { IMenubarService, IMenubarMenu, IMenubarMenuItemAction, IMenubarData } from 'vs/platform/menubar/common/menubar';
import { IMenuService, MenuId, IMenu, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ActionRunner, IActionRunner, IAction } from 'vs/base/common/actions';
import { Builder, $ } from 'vs/base/browser/builder';
import { Separator, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventType } from 'vs/base/browser/dom';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { isWindows } from 'vs/base/common/platform';
import { Menu, IMenuOptions } from 'vs/base/browser/ui/menu/menu';

interface CustomMenu {
	title: string;
	titleElement: Builder;
	actions?: IAction[];
}

export class MenubarPart extends Part {

	private topLevelMenus: {
		'File': IMenu;
		'Edit': IMenu;
		[index: string]: IMenu;
	};

	private customMenus: {
		[title: string]: CustomMenu;
	} = {};

	private actionRunner: IActionRunner;
	private container: Builder;
	private displayedMenu: Builder;
	private displayedMenuWidget: Menu;
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
			'Edit': this.menuService.createMenu(MenuId.MenubarEditMenu, this.contextKeyService)
		};

		this.actionRunner = new ActionRunner();
		this.actionRunner.onDidBeforeRun(() => {
			if (this.displayedMenu) {
				this.displayedMenu.hide();
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

	private setupCustomMenubar(): void {
		for (let menuTitle of Object.keys(this.topLevelMenus)) {
			const menu: IMenu = this.topLevelMenus[menuTitle];

			let titleElement = $(this.container).div({ class: 'menubar-menu-button' });
			$(titleElement).div({ class: 'menubar-menu-title' }).text(menuTitle);

			this.customMenus[menuTitle] = {
				title: menuTitle,
				titleElement: titleElement
			};

			// Update cached actions array for CustomMenus
			const updateActions = () => {
				this.customMenus[menuTitle].actions = [];
				let groups = menu.getActions();
				for (let group of groups) {
					const [, actions] = group;

					actions.map((action: MenuItemAction) => {
						action.label = action.label.replace(/\(&&\w\)|&&/g, '');
					});

					this.customMenus[menuTitle].actions.push(...actions);
					this.customMenus[menuTitle].actions.push(new Separator());
				}

				this.customMenus[menuTitle].actions.pop();
			};

			menu.onDidChange(updateActions);
			updateActions();

			// this.menus[menuTitle].element.on(EventType.CLICK, () => {
			// 	this.showMenu(menuTitle);
			// });


			this.customMenus[menuTitle].titleElement.on(EventType.CLICK, () => {
				this.toggleCustomMenu(menuTitle);
				this.isFocused = !this.isFocused;
			});

			this.customMenus[menuTitle].titleElement.getHTMLElement().onmouseenter = () => {
				if (this.isFocused && !this.isCurrentMenu(menuTitle)) {
					this.toggleCustomMenu(menuTitle);
				}
			};

			this.customMenus[menuTitle].titleElement.getHTMLElement().onmouseleave = () => {
				if (!this.isFocused) {
					this.cleanupCustomMenu();
				}
			};

			this.customMenus[menuTitle].titleElement.getHTMLElement().onblur = () => {
				this.cleanupCustomMenu();
			};
		}
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

	private isCurrentMenu(menuTitle: string): boolean {
		if (!this.displayedMenu) {
			return false;
		}

		return this.displayedMenu.getHTMLElement().parentNode === this.customMenus[menuTitle].titleElement.getHTMLElement();
	}

	private cleanupCustomMenu(): void {
		if (this.displayedMenu) {
			$(this.displayedMenu.getHTMLElement().parentElement).removeClass('open');
			this.displayedMenu.dispose();
		}

		if (this.displayedMenuWidget) {
			this.displayedMenuWidget.dispose();
		}

		this.displayedMenu = null;
		this.displayedMenuWidget = null;
	}

	private toggleCustomMenu(title: string): void {
		const customMenu = this.customMenus[title];

		if (this.displayedMenu) {
			let hiding: boolean = this.isCurrentMenu(title);

			// Need to cleanup currently displayed menu
			this.cleanupCustomMenu();

			// Hiding this menu
			if (hiding) {
				return;
			}
		}

		this.displayedMenu = $(customMenu.titleElement).div({ class: 'menubar-menu-items-holder' });

		$(this.displayedMenu.getHTMLElement().parentElement).addClass('open');

		this.displayedMenu.addClass('menubar-menu-items-holder-open');
		this.displayedMenu.style({
			'background-color': this.getColor(ACTIVITY_BAR_BACKGROUND),
			'color': this.getColor(ACTIVITY_BAR_FOREGROUND)
		});

		let menuOptions: IMenuOptions = {};

		this.displayedMenuWidget = new Menu(this.displayedMenu.getHTMLElement(), customMenu.actions, menuOptions);

		this.displayedMenuWidget.onDidCancel(() => {
			this.cleanupCustomMenu();
			this.isFocused = false;
		});

		this.displayedMenuWidget.onDidBlur(() => {
			setTimeout(() => {
				this.cleanupCustomMenu();
				this.isFocused = false;
			}, 100);
		});

		this.displayedMenuWidget.focus();

		// let boundingRect = this.menus[title].element.getHTMLElement().getBoundingClientRect();
		// console.log(this.menus[title].actions);

		// this.contextMenuService.showContextMenu({
		// 	getAnchor: () => ({ x: boundingRect.left, y: boundingRect.bottom }),
		// 	getActions: () => TPromise.as(
		// 		this.menus[title].actions
		// 	)
		// });
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