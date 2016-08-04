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
import {MenuId, MenuRegistry, ICommandAction, MenuItemAction, IMenu, IMenuItem, IMenuService} from 'vs/platform/actions/common/actions';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {ResourceContextKey} from 'vs/platform/actions/common/resourceContextKey';

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
		return values(MenuRegistry.commands);
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

			const menuItems = MenuRegistry.getMenuItems(id);
			const keysFilter: { [key: string]: boolean } = Object.create(null);

			let group: MenuItemGroup;
			menuItems.sort(Menu._compareMenuItems);

			for (let item of menuItems) {
				// group by groupId
				const groupName = item.group;
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
					action.resource = ResourceContextKey.Resource.getValue<URI>(this._keybindingService);
					activeActions.push(action);
				}
			}
			if (activeActions.length > 0) {
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

		let aGroup = a.group;
		let bGroup = b.group;

		if (aGroup !== bGroup) {

			// Falsy groups come last
			if (!aGroup) {
				return 1;
			} else if (!bGroup) {
				return -1;
			}

			// 'navigation' group comes first
			if (aGroup === 'navigation') {
				return -1;
			} else if (bGroup === 'navigation') {
				return 1;
			}

			// lexical sort for groups
			let value = aGroup.localeCompare(bGroup);
			if (value !== 0) {
				return value;
			}
		}

		// sort on priority - default is 0
		let aPrio = a.order || 0;
		let bPrio = b.order || 0;
		if (aPrio < bPrio) {
			return -1;
		} else if (aPrio > bPrio) {
			return 1;
		}

		// sort on titles
		return a.command.title.localeCompare(b.command.title);
	}
}