/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IAction} from 'vs/base/common/actions';
import {values} from 'vs/base/common/collections';
import {KbExpr, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {MenuId, CommandAction, MenuItemAction, IMenu, IMenuItem, IMenuService} from 'vs/platform/actions/common/actions';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ResourceContextKey} from 'vs/platform/actions/common/resourceContextKey';


export interface IDeclaredMenuItem {
	command: string;
	alt?: string;
	when?: string;
	group?: string;
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
	getMenuItems(loc: MenuId): IMenuItem[] {
		const result: IMenuItem[] = [];
		const menuItems = this.menuItems[loc];
		if (menuItems) {
			for (let item of menuItems) {
				const command = this.commands[item.command];
				if (!command) {
					// warn?
					continue;
				}
				const when = KbExpr.deserialize(item.when);
				const alt = this.commands[item.alt];
				result.push({ when, command, alt, group: item.group });
			}
		}
		return result;
	}
};

export const MenuRegistry: IMenuRegistry = _registry;

export class MenuService implements IMenuService {

	serviceId = IMenuService;

	constructor(
		@IExtensionService private _extensionService: IExtensionService
	) {
		//
	}

	createMenu(id: MenuId, keybindingService: IKeybindingService): IMenu {
		return new Menu(id, keybindingService, this._extensionService);
	}

	getCommandActions(): CommandAction[] {
		return values(_registry.commands);
	}
}

type MenuItemGroup = [string, IMenuItem[]];

class Menu implements IMenu {

	private _menuGroups: MenuItemGroup[] = [];
	private _disposables: IDisposable[] = [];
	private _onDidChange = new Emitter<IMenu>();

	constructor(
		id: MenuId,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IExtensionService private _extensionService: IExtensionService
	) {
		this._extensionService.onReady().then(_ => {

			const menuItems = _registry.getMenuItems(id);
			const keysFilter: { [key: string]: boolean } = Object.create(null);

			let group: MenuItemGroup;
			menuItems.sort(Menu._compareMenuItems);

			for (let item of menuItems) {
				// group by groupId
				const groupName = Menu._group(item.group);
				if (!group || group[0] !== groupName) {
					group = [groupName, []];
					this._menuGroups.push(group);
				}
				group[1].push(item);

				// keep keys for eventing
				Menu._fillInKbExprKeys(item.when, keysFilter);
			}

			// subscribe to context changes
			this._disposables.push(this._keybindingService.onDidChangeContext(keys => {
				for (let k of keys) {
					if (keysFilter[k]) {
						this._onDidChange.fire();
						return;
					}
				}
			}));

			this._onDidChange.fire(this);
		});
	}

	dispose() {
		this._disposables = dispose(this._disposables);
		this._onDidChange.dispose();
	}

	get onDidChange(): Event<IMenu> {
		return this._onDidChange.event;
	}

	getActions(): [string, IAction[]][] {
		const result: [string, IAction[]][] = [];
		for (let group of this._menuGroups) {
			const [id, items] = group;
			const actions: IAction[] = [];
			for (let item of items) {
				if (this._keybindingService.contextMatchesRules(item.when)) {
					actions.push(new MenuItemAction(item,
						this._keybindingService.getContextValue<URI>(ResourceContextKey.Resource),
						this._keybindingService));
				}
			}
			if (actions.length > 0) {
				result.push([id, actions]);
			}
		}
		return result;
	}

	private static _fillInKbExprKeys(exp: KbExpr, set: { [k: string]: boolean }): void {
		if (exp) {
			const parts = exp.serialize().split(' && ');
			for (let part of parts) {
				const m = /^\S+/.exec(part);
				if (m) {
					set[m[0]] = true;
				}
			}
		}
	}

	private static _compareMenuItems(a: IMenuItem, b: IMenuItem): number {
		let ret: number;
		if (a.group && b.group) {
			ret = Menu._compareGroupId(a.group, b.group);
		}
		if (!ret) {
			ret = a.command.title.localeCompare(b.command.title);
		}
		return ret;
	}

	private static _compareGroupId(a: string, b: string): number {
		const a_boost = Number(a.substr(a.lastIndexOf('@') + 1));
		const b_boost = Number(b.substr(b.lastIndexOf('@') + 1));
		if (a_boost !== b_boost && !isNaN(a_boost) && !isNaN(b_boost)) {
			return a_boost < b_boost ? -1 : 1;
		}
		return a.localeCompare(b);
	}

	private static _group(a: string): string {
		return a && (a.substr(0, a.lastIndexOf('@')) || a);
	}
}