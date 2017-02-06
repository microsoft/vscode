/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MenuId, MenuRegistry, MenuItemAction, IMenu, IMenuItem } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';

type MenuItemGroup = [string, IMenuItem[]];

export class Menu implements IMenu {

	private _menuGroups: MenuItemGroup[] = [];
	private _disposables: IDisposable[] = [];
	private _onDidChange = new Emitter<IMenu>();

	constructor(
		id: MenuId,
		startupSignal: TPromise<boolean>,
		@ICommandService private _commandService: ICommandService,
		@IContextKeyService private _contextKeyService: IContextKeyService
	) {
		startupSignal.then(_ => {
			const menuItems = MenuRegistry.getMenuItems(id);
			const keysFilter = new Set<string>();

			let group: MenuItemGroup;
			menuItems.sort(Menu._compareMenuItems);

			for (let item of menuItems) {
				// group by groupId
				const groupName = item.group;
				if (!group || group[0] !== groupName) {
					group = [groupName, []];
					this._menuGroups.push(group);
				}
				group[1].push(item);

				// keep keys for eventing
				Menu._fillInKbExprKeys(item.when, keysFilter);
			}

			// subscribe to context changes
			this._disposables.push(this._contextKeyService.onDidChangeContext(keys => {
				for (let k of keys) {
					if (keysFilter.has(k)) {
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

	getActions(arg?: any): [string, MenuItemAction[]][] {
		const result: [string, MenuItemAction[]][] = [];
		for (let group of this._menuGroups) {
			const [id, items] = group;
			const activeActions: MenuItemAction[] = [];
			for (const item of items) {
				if (this._contextKeyService.contextMatchesRules(item.when)) {
					const action = new MenuItemAction(item.command, item.alt, arg, this._commandService);
					action.order = item.order; //TODO@Ben order is menu item property, not an action property
					activeActions.push(action);
				}
			}
			if (activeActions.length > 0) {
				result.push([id, activeActions]);
			}
		}
		return result;
	}

	private static _fillInKbExprKeys(exp: ContextKeyExpr, set: Set<string>): void {
		if (exp) {
			for (let key of exp.keys()) {
				set.add(key);
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
