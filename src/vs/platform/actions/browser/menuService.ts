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
import {KbExpr, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {MenuId, ICommandAction, MenuItemAction, IMenu, IMenuItem, IMenuService} from 'vs/platform/actions/common/actions';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {ResourceContextKey} from 'vs/platform/actions/common/resourceContextKey';


export interface IMenuRegistry {
	addCommand(userCommand: ICommandAction): boolean;
	getCommand(id: string): ICommandAction;
	appendMenuItem(menu: MenuId, item: IMenuItem): void;
}

const _registry = new class {

	commands: { [id: string]: ICommandAction } = Object.create(null);

	menuItems: { [loc: number]: IMenuItem[] } = Object.create(null);

	addCommand(command: ICommandAction): boolean {
		const old = this.commands[command.id];
		this.commands[command.id] = command;
		return old !== void 0;
	}

	getCommand(id: string): ICommandAction {
		return this.commands[id];
	}

	appendMenuItem(loc: MenuId, items: IMenuItem): void {
		let array = this.menuItems[loc];
		if (!array) {
			this.menuItems[loc] = [items];
		} else {
			array.push(items);
		}
	}
	getMenuItems(loc: MenuId): IMenuItem[] {
		return this.menuItems[loc] || [];
	}
};

export const MenuRegistry: IMenuRegistry = _registry;

export class MenuService implements IMenuService {

	_serviceBrand: any;

	constructor(
		@IExtensionService private _extensionService: IExtensionService,
		@ICommandService private _commandService: ICommandService
	) {
		//
	}

	createMenu(id: MenuId, keybindingService: IKeybindingService): IMenu {
		return new Menu(id, this._commandService, keybindingService, this._extensionService);
	}

	getCommandActions(): ICommandAction[] {
		return values(_registry.commands);
	}
}

type MenuItemGroup = [string, MenuItemAction[]];

class Menu implements IMenu {

	private _menuGroups: MenuItemGroup[] = [];
	private _disposables: IDisposable[] = [];
	private _onDidChange = new Emitter<IMenu>();

	constructor(
		id: MenuId,
		@ICommandService private _commandService: ICommandService,
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
				group[1].push(new MenuItemAction(item, this._commandService));

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
		const result: MenuItemGroup[] = [];
		for (let group of this._menuGroups) {
			const [id, actions] = group;
			const activeActions: MenuItemAction[] = [];
			for (let action of actions) {
				if (this._keybindingService.contextMatchesRules(action.item.when)) {
					action.resource = this._keybindingService.getContextValue<URI>(ResourceContextKey.Resource);
					activeActions.push(action);
				}
			}
			if (actions.length > 0) {
				result.push([id, activeActions]);
			}
		}
		return result;
	}

	private static _fillInKbExprKeys(exp: KbExpr, set: { [k: string]: boolean }): void {
		if (exp) {
			for (let key of exp.keys()) {
				set[key] = true;
			}
		}
	}

	private static _compareMenuItems(a: IMenuItem, b: IMenuItem): number {
		if (a.group === b.group) {
			return a.command.title.localeCompare(b.command.title);
		} else if (!a.group) {
			return 1;
		} else if (!b.group) {
			return -1;
		} else {
			return Menu._compareGroupId(a.group, b.group);
		}
	}

	private static _compareGroupId(a: string, b: string): number {
		const a_order = Number(a.substr(a.lastIndexOf('@') + 1)) || 0;
		const b_order = Number(b.substr(b.lastIndexOf('@') + 1)) || 0;
		if (a_order !== b_order) {
			return a_order < b_order ? -1 : 1;
		}
		return a.localeCompare(b);
	}

	private static _group(a: string): string {
		return a && (a.substr(0, a.lastIndexOf('@')) || a);
	}
}