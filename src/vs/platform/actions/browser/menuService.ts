/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {values} from 'vs/base/common/collections';
import {KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {MenuId, CommandAction, MenuItem, IMenuService} from 'vs/platform/actions/common/actions';

export interface IDeclaredMenuItem {
	command: string;
	alt?: string;
	when?: string;
}

export interface IMenuRegistry {
	registerCommand(userCommand: CommandAction): boolean;
	registerMenuItems(location: MenuId, items: IDeclaredMenuItem[]): void;
}

const _registry = new class {

	commands: { [id: string]: CommandAction } = Object.create(null);

	menuItems: { [loc: number]: IDeclaredMenuItem[] } = Object.create(null);

	registerCommand(command: CommandAction): boolean {
		const old = this.commands[command.id];
		this.commands[command.id] = command;
		return old !== void 0;
	}

	registerMenuItems(loc: MenuId, items: IDeclaredMenuItem[]): void {
		let array = this.menuItems[loc];
		if (!array) {
			this.menuItems[loc] = items;
		} else {
			array.push(...items);
		}
	}
};

export const MenuRegistry: IMenuRegistry = _registry;

export class MenuService implements IMenuService {

	serviceId;

	getMenuItems(loc: MenuId): MenuItem[] {
		const menuItems = _registry.menuItems[loc];
		if (menuItems) {
			return menuItems.map(item => {
				const when = KbExpr.deserialize(item.when);
				const command = _registry.commands[item.command];
				const alt = _registry.commands[item.alt];
				return { when, command, alt };
			});
		}
	}

	getCommandActions(): CommandAction[] {
		return values(_registry.commands);
	}
}
