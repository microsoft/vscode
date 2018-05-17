/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/menubar/menubar.contribution';
import 'vs/css!./media/menubarpart';
import { Part } from 'vs/workbench/browser/part';
import { IMenubarService, IMenubarMenu, IMenubarMenuItemAction } from 'vs/platform/menubar/common/menubar';
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
import { Menu } from 'vs/base/browser/ui/menu/menu';

interface CustomMenu {
	title: string;
	titleElement: Builder;
	menuItemsElement?: Builder;
	menuWidget?: Menu;
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
	private focusedMenu: Builder;
	private container: Builder;

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
			this.focusedMenu.hide();
		});

		for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
			this.topLevelMenus[topLevelMenuName].onDidChange(() => this.setupNativeMenubar());
		}

		this.setupNativeMenubar();
	}

	private setupNativeMenubar(): void {
		this.menubarService.updateMenubar(this.windowService.getCurrentWindowId(), this.getMenubarMenus());
	}

	private getMenubarMenus(): IMenubarMenu[] {
		let ret: IMenubarMenu[] = [];

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

			ret.push(menubarMenu);
		}

		console.log(ret);
		return ret;
	}

	private addCustomMenu(menuTitle: string): void {
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
			this.showCustomMenu(menuTitle);
		});

		this.customMenus[menuTitle].titleElement.getHTMLElement().onmouseenter = () => { this.showCustomMenu(menuTitle); };
		this.customMenus[menuTitle].titleElement.getHTMLElement().onmouseleave = () => { this.hideMenu(menuTitle); };

		this.customMenus[menuTitle].titleElement.getHTMLElement().onblur = () => { console.log('blurred'); this.hideMenu(menuTitle); };
	}

	public getActionItem(action: IAction) {
		const keybinding = this.keybindingService.lookupKeybinding(action.id);
		if (keybinding) {
			return new ActionItem(action, action, { label: true, keybinding: keybinding.getLabel(), isMenu: true });
		}

		const customActionItem = <any>action;
		if (typeof customActionItem.getActionItem === 'function') {
			return customActionItem.getActionItem();
		}

		return new ActionItem(action, action, { icon: true, label: true, isMenu: true });
	}

	private hideMenu(title: string): void {
		this.customMenus[title].menuItemsElement.dispose();
	}

	private showCustomMenu(title: string): void {
		const customMenu = this.customMenus[title];


		customMenu.menuItemsElement = $(customMenu.titleElement).div({ class: 'menubar-menu-items-holder' });

		customMenu.menuItemsElement.addClass('menubar-menu-items-holder-open');
		customMenu.menuItemsElement.style({
			'background-color': this.getColor(ACTIVITY_BAR_BACKGROUND),
			'color': this.getColor(ACTIVITY_BAR_FOREGROUND)
		});

		let getActionItem = (action: IAction) => {
			const keybinding = this.keybindingService.lookupKeybinding(action.id);
			if (keybinding) {
				return new ActionItem(action, action, { label: true, keybinding: keybinding.getLabel(), isMenu: true });
			}

			const customActionItem = <any>action;
			if (typeof customActionItem.getActionItem === 'function') {
				return customActionItem.getActionItem();
			}

			return new ActionItem(action, action, { icon: true, label: true, isMenu: true });
		};

		customMenu.menuWidget = new Menu(customMenu.menuItemsElement.getHTMLElement(), customMenu.actions, {
			actionItemProvider: getActionItem,
			context: null,
			actionRunner: this.actionRunner
		});

		customMenu.menuWidget.onDidCancel(() => {
			customMenu.menuItemsElement.dispose();
			customMenu.menuWidget.dispose();
		});

		customMenu.menuWidget.onDidBlur(() => {
			customMenu.menuItemsElement.dispose();
			customMenu.menuWidget.dispose();
		});

		this.focusedMenu = customMenu.menuItemsElement;

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
			for (let topLevelMenuName of Object.keys(this.topLevelMenus)) {
				this.addCustomMenu(topLevelMenuName);
			}
		}

		return this.container.getHTMLElement();
	}
}