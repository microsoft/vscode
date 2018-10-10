/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMenubarService = createDecorator<IMenubarService>('menubarService');

export interface IMenubarService {
	_serviceBrand: any;

	updateMenubar(windowId: number, menuData: IMenubarData): TPromise<void>;
}

export interface IMenubarData {
	menus: { [id: string]: IMenubarMenu };
	keybindings: { [id: string]: IMenubarKeybinding };
}

export interface IMenubarMenu {
	items: Array<MenubarMenuItem>;
}

export interface IMenubarKeybinding {
	label: string;
	isNative?: boolean; // Assumed true if missing
}

export interface IMenubarMenuItemAction {
	id: string;
	label: string;
	checked?: boolean; // Assumed false if missing
	enabled?: boolean; // Assumed true if missing
}

export interface IMenubarMenuItemSubmenu {
	id: string;
	label: string;
	submenu: IMenubarMenu;
}

export interface IMenubarMenuItemSeparator {
	id: 'vscode.menubar.separator';
}

export type MenubarMenuItem = IMenubarMenuItemAction | IMenubarMenuItemSubmenu | IMenubarMenuItemSeparator;

export function isMenubarMenuItemSubmenu(menuItem: MenubarMenuItem): menuItem is IMenubarMenuItemSubmenu {
	return (<IMenubarMenuItemSubmenu>menuItem).submenu !== undefined;
}

export function isMenubarMenuItemSeparator(menuItem: MenubarMenuItem): menuItem is IMenubarMenuItemSeparator {
	return (<IMenubarMenuItemSeparator>menuItem).id === 'vscode.menubar.separator';
}

export function isMenubarMenuItemAction(menuItem: MenubarMenuItem): menuItem is IMenubarMenuItemAction {
	return !isMenubarMenuItemSubmenu(menuItem) && !isMenubarMenuItemSeparator(menuItem);
}