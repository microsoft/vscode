/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItem } from '../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../base/common/actions.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { MenuId } from '../common/actions.js';


export const IActionViewItemService = createDecorator<IActionViewItemService>('IActionViewItemService');


export interface IActionViewItemFactory {
	(action: IAction, options: IActionViewItemOptions, instantiationService: IInstantiationService, windowId: number): IActionViewItem | undefined;
}

export interface IActionViewItemService {

	_serviceBrand: undefined;

	readonly onDidChange: Event<MenuId>;

	register(menu: MenuId, submenu: MenuId, provider: IActionViewItemFactory, event?: Event<unknown>): IDisposable;
	register(menu: MenuId, commandId: string, provider: IActionViewItemFactory, event?: Event<unknown>): IDisposable;

	lookUp(menu: MenuId, submenu: MenuId): IActionViewItemFactory | undefined;
	lookUp(menu: MenuId, commandId: string): IActionViewItemFactory | undefined;
}

export class NullActionViewItemService implements IActionViewItemService {
	_serviceBrand: undefined;

	readonly onDidChange: Event<MenuId> = Event.None;

	register(menu: MenuId, commandId: string | MenuId, provider: IActionViewItemFactory, event?: Event<unknown>): IDisposable {
		return Disposable.None;
	}

	lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
		return undefined;
	}
}

class ActionViewItemService implements IActionViewItemService {

	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IActionViewItemFactory>();

	private readonly _onDidChange = new Emitter<MenuId>();
	readonly onDidChange: Event<MenuId> = this._onDidChange.event;

	dispose(): void {
		this._onDidChange.dispose();
	}

	register(menu: MenuId, commandOrSubmenuId: string | MenuId, provider: IActionViewItemFactory, event?: Event<unknown>): IDisposable {
		const id = this._makeKey(menu, commandOrSubmenuId);
		if (this._providers.has(id)) {
			throw new Error(`A provider for the command ${commandOrSubmenuId} and menu ${menu} is already registered.`);
		}
		this._providers.set(id, provider);

		const listener = event?.(() => {
			this._onDidChange.fire(menu);
		});

		return toDisposable(() => {
			listener?.dispose();
			this._providers.delete(id);
		});
	}

	lookUp(menu: MenuId, commandOrMenuId: string | MenuId): IActionViewItemFactory | undefined {
		return this._providers.get(this._makeKey(menu, commandOrMenuId));
	}

	private _makeKey(menu: MenuId, commandOrMenuId: string | MenuId) {
		return `${menu.id}/${(commandOrMenuId instanceof MenuId ? commandOrMenuId.id : commandOrMenuId)}`;
	}
}

registerSingleton(IActionViewItemService, ActionViewItemService, InstantiationType.Delayed);
