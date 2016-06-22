/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {values} from 'vs/base/common/collections';
import {KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {MenuLocation, CommandAction, MenuItem, IMenuService} from './actions';

export type IUserFriendlyMenuLocation = 'editor/primary' | 'editor/secondary';

export interface IUserFriendlyMenuItem {
	command: string;
	alt?: string;
	when?: string;
}

export interface IUserFriendlyCommand {
	command: string;
	title: string;
	category?: string;
	icon?: string | { light: string; dark: string; };
}

export interface IMenuRegistry {
	registerCommand(userCommand: IUserFriendlyCommand): boolean;
	registerMenuItems(location: IUserFriendlyMenuLocation, items: IUserFriendlyMenuItem[]): boolean;
}

const _registry = new class {

	private _commands: { [id: string]: CommandAction } = Object.create(null);

	private _menuItems: { [loc: number]: IUserFriendlyMenuItem[] } = Object.create(null);

	registerCommand(userCommand: IUserFriendlyCommand): boolean {
		let {command, category, icon, title} = userCommand;
		if (!icon) {
			icon = '';
		}
		const old = this._commands[command];
		this._commands[command] = {
			id: command,
			title,
			category,
			lightThemeIcon: typeof icon === 'string' ? icon : icon.light,
			darkThemeIcon: typeof icon === 'string' ? icon : icon.dark
		};

		return old !== void 0;
	}

	registerMenuItems(location: IUserFriendlyMenuLocation, items: IUserFriendlyMenuItem[]): boolean {
		const loc = MenuLocation.parse(location);
		if (loc) {
			let array = this._menuItems[loc];
			if (!array) {
				this._menuItems[loc] = items;
			} else {
				array.push(...items);
			}
			return true;
		}
	}

	getMenuItems(loc: MenuLocation): MenuItem[] {
		const menuItems = this._menuItems[loc];
		if (menuItems) {
			return menuItems.map(item => {
				const when = KbExpr.deserialize(item.when);
				const command = this._commands[item.command];
				const alt = this._commands[item.alt];
				return { when, command, alt };
			});
		}
	}

	getCommandActions(): CommandAction[] {
		return values(this._commands);
	}
};

export const MenuRegistry: IMenuRegistry = _registry;

export class MenuService implements IMenuService {

	serviceId;

	getMenuItems(loc: MenuLocation): MenuItem[] {
		return _registry.getMenuItems(loc);
	}

	getCommandActions(): CommandAction[] {
		return _registry.getCommandActions();
	}
}
