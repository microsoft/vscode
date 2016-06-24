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
import {KbExpr, IKeybindingScopeLocation, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {MenuId, CommandAction, MenuItemAction, IMenu, IMenuItem, IMenuService} from 'vs/platform/actions/common/actions';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ResourceContextKey} from 'vs/platform/actions/common/resourceContextKey';


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
	getMenuItems(loc: MenuId): IMenuItem[] {
		const menuItems = this.menuItems[loc];
		if (menuItems) {
			return menuItems.map(item => {
				const when = KbExpr.deserialize(item.when);
				const command = this.commands[item.command];
				const alt = this.commands[item.alt];
				return { when, command, alt };
			});
		}
	}
};

export const MenuRegistry: IMenuRegistry = _registry;

export class MenuService implements IMenuService {

	serviceId = IMenuService;

	constructor(
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IExtensionService private _extensionService: IExtensionService
	) {
		//
	}

	createMenu(id: MenuId, scope: IKeybindingScopeLocation): IMenu {
		return new Menu(scope, id, this._keybindingService, this._extensionService);
	}

	getCommandActions(): CommandAction[] {
		return values(_registry.commands);
	}
}

class Menu implements IMenu {

	private _scope: IKeybindingScopeLocation;
	private _menuItems: IMenuItem[] = [];
	private _disposables: IDisposable[] = [];
	private _onDidChange = new Emitter<IMenu>();

	constructor(
		scope: IKeybindingScopeLocation,
		id: MenuId,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IExtensionService private _extensionService: IExtensionService
	) {
		this._scope = scope;
		this._extensionService.onReady().then(_ => {

			let menuItems = _registry.getMenuItems(id);
			if (!menuItems) {
				return;
			}
			let keysFilter: { [key: string]: boolean } = Object.create(null);
			for (let item of menuItems) {
				if (!item.command) {
					//TODO@joh, warn? default command?
					continue;
				}

				// keep menu item
				this._menuItems.push(item);
				Menu._fillInKbExprKeys(item.when, keysFilter);
			}

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

	getActions(): IAction[] {
		const result: IAction[] = [];
		for (let item of this._menuItems) {
			if (this._keybindingService.contextMatchesRules(this._scope, item.when)) {
				result.push(new MenuItemAction(item,
					this._keybindingService.getContextValue<URI>(this._scope, ResourceContextKey.Resource),
					this._keybindingService));
			}
		}
		return result;
	}

	private static _fillInKbExprKeys(exp: KbExpr, set: { [k: string]: boolean }): void {
		if (exp) {
			const parts = exp.serialize().split(' && ');
			for (let part of parts) {
				const m = /^\w+/.exec(part);
				if (m) {
					set[m[0]] = true;
				}
			}
		}
	}
}