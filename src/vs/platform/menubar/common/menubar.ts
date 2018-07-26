/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMenubarService = createDecorator<IMenubarService>('menubarService');

export interface IMenubarService {
	_serviceBrand: any;

	updateMenubar(windowId: number, menus: IMenubarData): TPromise<void>;
}

export interface IMenubarData {
	'Files'?: IMenubarMenu;
	'Edit'?: IMenubarMenu;
	[id: string]: IMenubarMenu;
}

export interface IMenubarMenu {
	items: Array<MenubarMenuItem>;
}

export interface IMenubarKeybinding {
	id: string;
	label: string;
	isNative: boolean;
}

export interface IMenubarMenuItemAction {
	id: string;
	label: string;
	checked: boolean;
	enabled: boolean;
	keybinding?: IMenubarKeybinding;
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

export function isMenubarMenuItemAction(menuItem: MenubarMenuItem): menuItem is IMenubarMenuItemAction {
	return (<IMenubarMenuItemAction>menuItem).checked !== undefined || (<IMenubarMenuItemAction>menuItem).enabled !== undefined;
}

export function isMenubarMenuItemSeparator(menuItem: MenubarMenuItem): menuItem is IMenubarMenuItemSeparator {
	return (<IMenubarMenuItemSeparator>menuItem).id === 'vscode.menubar.separator';
}